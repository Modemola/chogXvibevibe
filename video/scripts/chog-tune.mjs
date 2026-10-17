// Synthesizes the soundtrack for "Hold Your Chog" (2:00): a bouncy 120 BPM tune in F major with sound effects cut to
// the picture (pops, coin dings, whooshes, a sad trombone, a passport stamp). One bar = 2 s; scenes change on downbeats.
// Usage: node scripts/chog-tune.mjs [out.wav]. Deterministic.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'public/chog-tune.wav';
const SR = 48000;
const DUR = 120;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);
const BEAT = 0.5;
const BAR = 2;

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const note = (name) => {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
  return midi(12 * (Number(m[3]) + 1) + base);
};
let seed = 5;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
function add(s, v, p = 0) {
  if (s < 0 || s >= N) return;
  const [gl, gr] = pan(p);
  L[s] += v * gl;
  R[s] += v * gr;
}
const S = (t) => Math.round(t * SR);

// --- Instruments ---------------------------------------------------------------------------------
function kick(at, g = 0.9) {
  let ph = 0;
  for (let i = 0; i < SR * 0.35; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (48 + 110 * Math.exp(-t * 32))) / SR;
    add(S(at) + i, Math.sin(ph) * Math.exp(-t * 9) * g);
  }
}
function clap(at, g = 0.35) {
  for (const off of [0, 0.011, 0.023]) for (let i = 0; i < SR * 0.18; i++) {
    const t = i / SR;
    const n = rand() - rand() * 0.6;
    add(S(at + off) + i, n * Math.exp(-t * (off ? 60 : 22)) * g * (off ? 0.6 : 1), (rand() * 0.3));
  }
}
let hp = 0;
function hat(at, g = 0.08, p = 0.3) {
  for (let i = 0; i < SR * 0.05; i++) {
    const n = rand();
    const v = n - hp;
    hp = n;
    add(S(at) + i, v * Math.exp(-(i / SR) * 70) * g, p);
  }
}
function bassNote(at, f, len, g = 0.28) {
  let ph = 0;
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
    const env = Math.min(1, t * 200) * Math.exp(-t * 3.2) * Math.min(1, (len - t) * 40);
    add(S(at) + i, (tri * 0.8 + Math.sin(ph * 2) * 0.15) * env * g);
  }
}
function marimba(at, f, g = 0.14, p = 0, decay = 7) {
  for (let i = 0; i < SR * 1.2; i++) {
    const t = i / SR;
    const w = 2 * Math.PI * f * t;
    const v = Math.sin(w) * Math.exp(-t * decay) + 0.35 * Math.sin(w * 4) * Math.exp(-t * decay * 3) + 0.12 * Math.sin(w * 10) * Math.exp(-t * 40);
    add(S(at) + i, v * Math.min(1, t * 2000) * g, p);
  }
}
function bell(at, f, g = 0.12, p = 0, len = 2.5) {
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    const w = 2 * Math.PI * f * t;
    const v = Math.sin(w) * Math.exp(-t * 2.2) + 0.4 * Math.sin(w * 2.76) * Math.exp(-t * 4) + 0.2 * Math.sin(w * 5.4) * Math.exp(-t * 7);
    add(S(at) + i, v * Math.min(1, t * 3000) * g, p);
  }
}
function popSfx(at, g = 0.22, p = 0, up = 1) {
  let ph = 0;
  for (let i = 0; i < SR * 0.09; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (up ? 380 + 9000 * t : 1400 - 9000 * t)) / SR;
    add(S(at) + i, Math.sin(ph) * Math.exp(-t * 35) * g, p);
  }
}
function coin(at, g = 0.12, p = 0) {
  bell(at, note('B6'), g * 0.7, p, 0.25);
  bell(at + 0.07, note('E7'), g, p, 0.6);
}
function whoosh(at, len = 0.5, g = 0.25, p0 = -0.8, p1 = 0.8) {
  let lp = 0;
  for (let i = 0; i < SR * len; i++) {
    const k = i / (SR * len);
    const a = 0.02 + 0.5 * Math.sin(k * Math.PI);
    lp += (rand() - lp) * a;
    add(S(at) + i, lp * Math.sin(k * Math.PI) ** 2 * g * 3, p0 + (p1 - p0) * k);
  }
}
function boing(at, g = 0.2) {
  let ph = 0;
  for (let i = 0; i < SR * 0.6; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (180 + 120 * Math.sin(t * 40) * Math.exp(-t * 5) + 200 * t)) / SR;
    add(S(at) + i, Math.sin(ph) * Math.exp(-t * 5) * g);
  }
}
function thud(at, g = 0.8) {
  let ph = 0;
  for (let i = 0; i < SR * 0.5; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (60 + 90 * Math.exp(-t * 20))) / SR;
    add(S(at) + i, (Math.sin(ph) + rand() * 0.3 * Math.exp(-t * 40)) * Math.exp(-t * 8) * g);
  }
}
function crash(at, g = 0.25, len = 2.4) {
  let p = 0;
  for (let i = 0; i < SR * len; i++) {
    const n = rand();
    const v = n - p;
    p = n;
    add(S(at) + i, v * Math.exp(-(i / SR) * 2.2) * g, rand() * 0.6);
  }
}
function trombone(at, notes, g = 0.2) {
  notes.forEach((nm, k) => {
    const len = k === notes.length - 1 ? 1.3 : 0.42;
    let ph = 0;
    const f0 = note(nm);
    for (let i = 0; i < SR * len; i++) {
      const t = i / SR;
      const vib = k === notes.length - 1 ? 1 + 0.02 * Math.sin(t * 34) : 1;
      ph += (2 * Math.PI * f0 * vib * (1 - (k === notes.length - 1 ? 0.04 * t : 0))) / SR;
      let v = 0;
      for (let h = 1; h <= 7; h++) v += Math.sin(ph * h) / h ** 1.3;
      add(S(at + k * 0.45) + i, v * Math.min(1, t * 40) * Math.min(1, (len - t) * 12) * g * 0.5);
    }
  });
}
function blip(at, f, g = 0.1, p = 0) {
  for (let i = 0; i < SR * 0.08; i++) {
    const t = i / SR;
    add(S(at) + i, Math.sign(Math.sin(2 * Math.PI * f * t)) * Math.exp(-t * 30) * g * 0.5, p);
  }
}
function riser(a, b, g = 0.15) {
  let lp = 0;
  for (let i = 0; i < SR * (b - a); i++) {
    const k = i / (SR * (b - a));
    lp += (rand() - lp) * (0.02 + 0.5 * k);
    add(S(a) + i, lp * k * k * g * 2.5, Math.sin(k * 20) * 0.5);
  }
}

// --- Harmony -------------------------------------------------------------------------------------
const MAJOR = [['F2', ['F4', 'A4', 'C5']], ['D2', ['D4', 'F4', 'A4']], ['Bb1', ['Bb3', 'D4', 'F4']], ['C2', ['C4', 'E4', 'G4']]];
const MINOR = [['D2', ['D4', 'F4', 'A4']], ['A1', ['A3', 'C4', 'E4']], ['Bb1', ['Bb3', 'D4', 'F4']], ['C2', ['C4', 'E4', 'G4']]];
const chordAt = (t, prog) => prog[Math.floor(t / BAR) % 4];

/** Drums from a to b; `full` adds offbeat hats and claps. */
function drums(a, b, { kickG = 0.85, clapG = 0.32, hats = true } = {}) {
  for (let t = a; t < b - 0.01; t += BEAT) {
    kick(t, kickG);
    const beatInBar = Math.round((t % BAR) / BEAT);
    if (clapG && (beatInBar === 1 || beatInBar === 3)) clap(t, clapG);
    if (hats) {
      hat(t + BEAT / 2, 0.09, 0.35);
      hat(t + BEAT / 4, 0.04, -0.3);
    }
  }
}
function bassline(a, b, prog = MAJOR, g = 0.3) {
  for (let t = a; t < b - 0.01; t += BEAT / 2) {
    const [root] = chordAt(t, prog);
    const step = Math.round((t % BAR) / (BEAT / 2));
    const f = note(root) * ([0, 2, 3, 6].includes(step) ? 1 : step === 7 ? 1.5 : 2);
    if (step % 2 === 0 || step === 3 || step === 7) bassNote(t, f, 0.22, g);
  }
}
const HOOK = [0, 2, 1, 2, 0, 2, 1, 3]; // chord-tone index per 8th note (3 = an octave above the root)
function hook(a, b, prog = MAJOR, g = 0.12, oct = 1) {
  let k = 0;
  for (let t = a; t < b - 0.01; t += BEAT / 2, k++) {
    const [, tones] = chordAt(t, prog);
    const idx = HOOK[k % 8];
    const f = idx === 3 ? note(tones[0]) * 2 : note(tones[idx]);
    if (k % 8 !== 5) marimba(t, f * oct, g, Math.sin(k) * 0.4);
  }
}
function arps(a, b, prog = MAJOR, g = 0.07, step = BEAT / 4) {
  let k = 0;
  for (let t = a; t < b - 0.01; t += step, k++) {
    const [, tones] = chordAt(t, prog);
    marimba(t, note(tones[k % 3]) * 2, g, k % 2 ? 0.5 : -0.5, 9);
  }
}
function pads(a, b, prog = MAJOR, g = 0.035) {
  for (let t = a; t < b - 0.01; t += BAR) {
    const [, tones] = chordAt(t, prog);
    for (const nm of tones) {
      const f = note(nm);
      for (let i = 0; i < SR * BAR; i++) {
        const x = i / SR;
        const env = Math.min(1, x * 4) * Math.min(1, (BAR - x) * 4);
        const v = Math.sin(2 * Math.PI * f * x) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * x);
        add(S(t) + i, v * env * g);
      }
    }
  }
}

// --- Score ----------------------------------------------------------------------------------------
// 0:00–0:10 · gm: music box, a pop for each sticker landing, a chime on the title.
arps(0, 10, MAJOR, 0.05, BEAT / 2);
pads(0, 10, MAJOR, 0.025);
for (let i = 0; i < 12; i++) popSfx(0.4 + i * 0.5 + 0.33, 0.2, ((i % 6) - 2.5) / 3);
bell(6.5, note('F6'), 0.14);
bell(6.62, note('A6'), 0.1, 0.3);
for (let t = 8; t < 10; t += BEAT) hat(t, 0.06);
riser(8.5, 10, 0.12);

// 0:10–0:24 · the crew: the groove arrives.
crash(10, 0.2);
drums(10, 24);
bassline(10, 24);
hook(10, 24);
pads(10, 24, MAJOR, 0.02);
bell(17.1, note('C6'), 0.1);

// 0:24–0:42 · the problem: graduation, rain, flippers, sad trombone.
boing(24.3, 0.25);
bell(24.5, note('C6'), 0.12);
drums(24, 31.4, { clapG: 0.25 });
bassline(24, 31.4);
hook(24, 31.4, MAJOR, 0.1);
for (let i = 0; i < 18; i++) coin(27.4 + i * 0.2 + (i % 3) * 0.03, 0.06, ((i * 37) % 10) / 5 - 1);
drums(31.4, 42, { kickG: 0.7, clapG: 0.2 });
bassline(31.4, 42, MINOR, 0.26);
hook(32, 42, MINOR, 0.08, 1);
for (let i = 0; i < 4; i++) whoosh(31.4 + i * 0.35, 0.55, 0.22, -0.4, 1);
for (let i = 0; i < 4; i++) popSfx(32.6 + i * 0.2, 0.14, 0.6, 0);
trombone(35.6, ['G3', 'F#3', 'F3', 'E3'], 0.22);
bell(38.8, note('A5'), 0.1);

// 0:42–0:58 · Scout: half-time, scanner chirps, the stamp.
drums(42, 58, { kickG: 0.6, clapG: 0.18, hats: true });
bassline(42, 58, MAJOR, 0.22);
arps(42, 58, MAJOR, 0.045);
boing(42.2, 0.12);
bell(44.4, note('C6'), 0.1);
for (let i = 0; i < 10; i++) blip(45 + i * 0.25, i % 2 ? 1760 : 1320, 0.07, 0.3);
for (let i = 0; i < 6; i++) blip(48 + i * 0.3, 2093, 0.05, -0.3);
thud(53.2, 0.9);
bell(53.25, note('F6'), 0.13);
bell(53.4, note('C7'), 0.08, 0.4);

// 0:58–1:16 · hold: storm, "nope", +0.10, the calendar, +0.05, a riser into the drop.
drums(58, 60, { clapG: 0.25 });
bassline(58, 76, MAJOR, 0.26);
for (let t = 60; t < 64.4; t += 0.25) bassNote(t, note('D1') * (1 + (Math.floor((t - 60) * 4) % 2) * 0.06), 0.24, 0.22);
for (let i = 0; i < 6; i++) whoosh(60 + i * 0.7, 0.6, 0.12, -1, 1);
popSfx(61.4, 0.24, -0.3);
drums(64.4, 76);
hook(64.4, 72, MAJOR, 0.1);
coin(64.4, 0.18);
bell(64.5, note('A6'), 0.1);
for (let i = 0; i < 30; i++) blip(66 + i * 0.12, 1000 + i * 30, 0.04, 0);
coin(70, 0.2);
bell(70.1, note('C7'), 0.12);
arps(72, 76, MAJOR, 0.06, BEAT / 4);
riser(72, 76, 0.2);

// 1:16–1:36 · graduation day: the drop.
crash(76, 0.32, 3);
thud(76, 0.7);
drums(76, 96, { kickG: 0.9, clapG: 0.36 });
bassline(76, 96, MAJOR, 0.32);
hook(76, 96, MAJOR, 0.13);
pads(76, 96, MAJOR, 0.025);
for (let i = 0; i < 22; i++) coin(76.3 + i * 0.11, 0.06, ((i * 53) % 10) / 5 - 1);
['F5', 'A5', 'C6', 'F6', 'A6', 'C7'].forEach((n, i) => bell(79.2 + i * 0.3, note(n), 0.08, (i % 3) - 1));
for (let i = 0; i < 14; i++) coin(87.6 + i * 0.18, 0.09, ((i % 5) - 2) / 2);
for (let i = 0; i < 3; i++) boing(88.2 + i * 0.6, 0.1);
thud(89, 0.6);
crash(91.6, 0.2);
for (let i = 0; i < 14; i++) coin(91.8 + i * 0.15, 0.05, ((i * 29) % 10) / 5 - 1);

// 1:36–1:50 · who earns more: lighter groove, counting ticks.
drums(96, 110, { kickG: 0.75, clapG: 0.26 });
bassline(96, 110, MAJOR, 0.26);
hook(96, 110, MAJOR, 0.11, 2);
for (let i = 0; i < 26; i++) blip(98.2 + i * 0.24, 1568 + (i % 4) * 120, 0.035, i % 2 ? 0.4 : -0.4);
bell(104.6, note('F6'), 0.12);

// 1:50–2:00 · the end: pops for the wall, a wink, the final chord.
for (let i = 0; i < 12; i++) popSfx(110.1 + i * 0.12 + 0.25, 0.15, ((i % 6) - 2.5) / 3);
drums(110, 112, { clapG: 0.3 });
bassline(110, 112);
boing(111.6, 0.12);
crash(112, 0.22, 3);
for (const nm of ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4']) bassNote(112, note(nm), 6, 0.06);
['F5', 'A5', 'C6', 'F6'].forEach((n, i) => bell(112 + i * 0.12, note(n), 0.1, i % 2 ? 0.4 : -0.4, 4));
popSfx(113, 0.16);
bell(114.0, note('C7'), 0.07, 0.3, 3);

// --- Space and master ------------------------------------------------------------------------------
function echo(x, delay, fb, mix) {
  const d = S(delay);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] + (i >= d ? y[i - d] * fb : 0);
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - mix) + y[i] * mix;
}
echo(L, 0.375, 0.25, 0.18);
echo(R, 0.25, 0.25, 0.18);
// Fade out the last 1.5 s.
for (let i = 0; i < SR * 1.5; i++) {
  const g = 1 - i / (SR * 1.5);
  L[N - 1 - i] *= 1 - g;
  R[N - 1 - i] *= 1 - g;
}
let rms = 0;
for (let i = 0; i < N; i++) rms += L[i] * L[i] + R[i] * R[i];
rms = Math.sqrt(rms / (2 * N));
const gain = 0.2 / rms;
const ceil = 0.95;
const clip = (x) => ceil * Math.tanh((x * gain) / ceil);
const pcm = Buffer.alloc(N * 4);
let peak = 0;
let sum2 = 0;
for (let s = 0; s < N; s++) {
  const l = clip(L[s]);
  const r = clip(R[s]);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  sum2 += l * l + r * r;
  pcm.writeInt16LE(Math.round(l * 32767), s * 4);
  pcm.writeInt16LE(Math.round(r * 32767), s * 4 + 2);
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
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, pcm]));
const db = (v) => (20 * Math.log10(v)).toFixed(1);
console.log(`${out}: ${DUR}s, RMS ${db(Math.sqrt(sum2 / (2 * N)))} dBFS, peak ${db(peak)} dBFS`);
