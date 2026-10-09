// Synthesizes the film's ambient score to public/score.wav (180 s, 48 kHz, stereo).
// Low pads that change chord with each scene, soft sub pulses on scene changes, glassy
// bells on key moments, a swell into the on-chain scene, and a breath of silence before
// the final line. Deterministic: same input, same file.
import { mkdirSync, writeFileSync } from 'node:fs';

const SR = 48000;
const DUR = 180;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const note = (name) => {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
  return midi(12 * (Number(m[3]) + 1) + base);
};

// Chord per section: [start, end, notes].
const CHORDS = [
  [1.0, 15.4, ['D2', 'A2', 'F3', 'E4']],
  [15.0, 27.4, ['Bb1', 'F2', 'D3', 'A3']],
  [27.0, 40.4, ['G1', 'D2', 'Bb2', 'A3']],
  [40.0, 65.4, ['F2', 'C3', 'A3', 'G4', 'E4']],
  [65.0, 80.4, ['D2', 'A2', 'C4', 'E4', 'F4']],
  [80.0, 95.4, ['Bb1', 'F2', 'D3', 'A3', 'C4']],
  [95.0, 115.4, ['G1', 'D2', 'Bb2', 'F3', 'A3']],
  [115.0, 135.4, ['C2', 'G2', 'A3', 'C4', 'F4']],
  [135.0, 155.4, ['Bb1', 'F2', 'D3', 'F3', 'A3', 'C5']],
  [155.0, 171.6, ['D2', 'A2', 'F3', 'C4', 'E4']],
  [172.2, 180, ['D2', 'A2', 'F#3', 'E4', 'A4']],
];

function env(t, a, b, fadeIn, fadeOut) {
  if (t < a || t > b) return 0;
  const i = Math.min(1, (t - a) / fadeIn);
  const o = Math.min(1, (b - t) / fadeOut);
  return Math.sin((Math.min(i, o) * Math.PI) / 2) ** 2;
}

// Overall dynamics: quiet open, swell into the on-chain scene, silence before the final line.
function master(t) {
  let g = 0.55;
  if (t < 3.2) g *= t / 3.2;
  g *= 1 + 0.45 * Math.max(0, Math.min(1, (t - 128) / 7)) * (t < 141 ? 1 : Math.max(0, 1 - (t - 141) / 6));
  if (t > 171.2 && t < 172.3) g *= Math.max(0, 1 - (t - 171.2) / 0.4) + Math.max(0, (t - 171.9) / 0.4);
  if (t > 176) g *= Math.max(0, 1 - (t - 176) / 4) ** 1.5;
  return g;
}

// Pads: per note, a few detuned voices with soft harmonics.
for (const [a, b, names] of CHORDS) {
  const s0 = Math.max(0, Math.floor(a * SR));
  const s1 = Math.min(N, Math.ceil(b * SR));
  names.forEach((nm, vi) => {
    const f = note(nm);
    const low = f < 120;
    for (const [det, pan] of [[-0.12, -0.6], [0.0, 0], [0.11, 0.6]]) {
      const fr = f * 2 ** (det / 12);
      const harmonics = low ? 3 : 5;
      const ph = new Float64Array(harmonics + 1).map((_, h) => (vi * 1.7 + h * 0.9 + det * 13) % (2 * Math.PI));
      const gl = Math.cos(((pan + 1) * Math.PI) / 4);
      const gr = Math.sin(((pan + 1) * Math.PI) / 4);
      const amp = (low ? 0.05 : 0.032) / Math.sqrt(names.length);
      for (let s = s0; s < s1; s++) {
        const t = s / SR;
        const e = env(t, a, b, 2.2, 1.6) * (0.85 + 0.15 * Math.sin(t * 0.37 + vi * 2.1 + det * 40));
        if (e <= 0) continue;
        let v = 0;
        for (let h = 1; h <= harmonics; h++) {
          ph[h] += (2 * Math.PI * fr * h) / SR;
          v += Math.sin(ph[h]) / h ** 1.7;
        }
        v *= amp * e;
        L[s] += v * gl;
        R[s] += v * gr;
      }
    }
  });
}

// Sub pulses on scene changes.
for (const at of [15, 40, 65, 95, 115, 135, 155, 170]) {
  const s0 = Math.floor(at * SR);
  let ph = 0;
  for (let s = s0; s < Math.min(N, s0 + SR * 3); s++) {
    const t = (s - s0) / SR;
    ph += (2 * Math.PI * (44 + 18 * Math.exp(-t * 9))) / SR;
    const v = Math.sin(ph) * Math.exp(-t * 2.4) * Math.min(1, t * 80) * 0.22;
    L[s] += v;
    R[s] += v;
  }
}

// Glassy bells on key moments: [time, note, gain, pan].
const BELLS = [
  [3.4, 'A5', 0.09, 0], // droplet lands
  [7.2, 'E5', 0.06, -0.3], // title
  [7.6, 'A5', 0.05, 0.3],
  [59.8, 'C6', 0.07, 0.2], // signature check
  [60.0, 'G5', 0.05, -0.2],
  [84.2, 'A5', 0.04, 0], // "= score, exactly"
  [131.0, 'F5', 0.05, 0.3], // policy locked
  [149.5, 'C6', 0.06, -0.2], // all 184 paid
  [149.7, 'F6', 0.04, 0.2],
  [175.5, 'A5', 0.06, -0.25], // end card
  [175.9, 'E6', 0.04, 0.25],
];
for (const [at, nm, gain, pan] of BELLS) {
  const f = note(nm);
  const s0 = Math.floor(at * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let s = s0; s < Math.min(N, s0 + SR * 5); s++) {
    const t = (s - s0) / SR;
    const e = Math.exp(-t * 1.3) * Math.min(1, t * 400);
    const v = gain * e * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3) + 0.2 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 6));
    L[s] += v * gl;
    R[s] += v * gr;
  }
}

// Swell: filtered noise rising into 2:15.
{
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  let lpL = 0;
  let lpR = 0;
  const s0 = Math.floor(126 * SR);
  const s1 = Math.floor(137 * SR);
  for (let s = s0; s < s1; s++) {
    const t = s / SR;
    const k = t < 135 ? ((t - 126) / 9) ** 2.2 : Math.max(0, 1 - (t - 135) / 2);
    const cut = 0.002 + 0.05 * k;
    lpL += cut * (rand() - lpL);
    lpR += cut * (rand() - lpR);
    L[s] += lpL * k * 0.5;
    R[s] += lpR * k * 0.5;
  }
}

// Master gain, then a simple stereo reverb (Freeverb-style combs + allpasses).
for (let s = 0; s < N; s++) {
  const g = master(s / SR);
  L[s] *= g;
  R[s] *= g;
}
function reverb(x, offset) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  const out = new Float32Array(x.length);
  for (let s = 0; s < x.length; s++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x[s] * 0.015 + c.lp * 0.86;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i];
      const v = -acc + y;
      a.buf[a.i] = acc + y * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      acc = v;
    }
    out[s] = acc;
  }
  return out;
}
const wl = reverb(L, 0);
const wr = reverb(R, 23);
let peak = 0;
for (let s = 0; s < N; s++) {
  L[s] = L[s] * 0.8 + wl[s] * 0.9;
  R[s] = R[s] * 0.8 + wr[s] * 0.9;
  peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
}
// Normalise to −3 dBFS peak; the film keeps it quiet through its own volume.
const norm = 0.707 / peak;
const pcm = Buffer.alloc(N * 4);
for (let s = 0; s < N; s++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[s] * norm)) * 32767), s * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[s] * norm)) * 32767), s * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
mkdirSync('public', { recursive: true });
writeFileSync('public/score.wav', Buffer.concat([header, pcm]));
console.log(`public/score.wav: ${DUR}s, peak normalised from ${peak.toFixed(3)}`);
