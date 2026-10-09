// Synthesizes the "pulse" score for the 30 s teaser: a dark, minimal electronic pulse in D minor,
// cut to the teaser's own moments, mixed loud enough for social feeds (about −14 dBFS RMS).
//   0–15 s   heartbeat (lub-dub) under a dark pad; glass chimes as the droplet lands (3.4) and the title appears (7.2)
//   15.0     impact as the orb shatters into wallets
//   15–27.3  100 BPM pulse: kick, side-chained bass, 16th ticks; a riser from 20.5
//   27.3     a beat of silence
//   27.7     resolve on the end card (D major), chime as the address appears (28.5)
// Usage: node scripts/pulse.mjs [out.wav]. Deterministic: same input, same file.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'public/pulse-teaser.wav';
const SR = 48000;
const DUR = 30;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const note = (name) => {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
  return midi(12 * (Number(m[3]) + 1) + base);
};
let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const panGains = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];
const add = (s, v, pan = 0) => {
  if (s < 0 || s >= N) return;
  const [gl, gr] = panGains(pan);
  L[s] += v * gl;
  R[s] += v * gr;
};

// --- Timeline ----------------------------------------------------------------------------------
const IMPACT = 15.0;
const GAP_START = 27.3;
const END = 27.7;
const BEAT = 0.6; // 100 BPM
const kicks = [];
// Heartbeat in the open: one lub-dub per second, growing.
for (let t = 1.0; t < IMPACT - 0.5; t += 1.0) kicks.push([t, 0.35 + 0.35 * (t / IMPACT)], [t + 0.24, 0.2 + 0.2 * (t / IMPACT)]);
// Four on the floor from the impact to the gap.
for (let t = IMPACT; t < GAP_START - 0.05; t += BEAT) kicks.push([t, 0.85]);

// --- Instruments ---------------------------------------------------------------------------------
function kick(at, gain) {
  const s0 = Math.floor(at * SR);
  let ph = 0;
  for (let i = 0; i < SR * 0.6; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (48 + 95 * Math.exp(-t * 28))) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 6.5);
    const click = t < 0.004 ? rand() * (1 - t / 0.004) * 0.5 : 0;
    add(s0 + i, (body + click) * gain * Math.min(1, t * 2000));
  }
}

function boom(at, gain, len = 2.2) {
  const s0 = Math.floor(at * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (38 + 60 * Math.exp(-t * 10))) / SR;
    lp += 0.08 * (rand() - lp);
    const v = (Math.sin(ph) * Math.exp(-t * 1.6) + lp * 1.6 * Math.exp(-t * 4)) * gain * Math.min(1, t * 1500);
    add(s0 + i, v, 0);
  }
}

// Reverse swell into a hit: noise that opens up and stops dead on `at`.
function suck(at, len, gain) {
  const s0 = Math.floor((at - len) * SR);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < SR * len; i++) {
    const k = (i / (SR * len)) ** 3;
    const cut = 0.01 + 0.25 * k;
    lpL += cut * (rand() - lpL);
    lpR += cut * (rand() - lpR);
    const s = s0 + i;
    if (s >= 0 && s < N) {
      L[s] += lpL * k * gain;
      R[s] += lpR * k * gain;
    }
  }
}

function chime(at, name, gain, pan = 0) {
  const f = note(name);
  const s0 = Math.floor(at * SR);
  for (let i = 0; i < SR * 4; i++) {
    const t = i / SR;
    const e = Math.exp(-t * 1.4) * Math.min(1, t * 500);
    const v = gain * e * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 7));
    add(s0 + i, v, pan);
  }
}

function pad(a, b, names, gain, fadeIn = 1.5, fadeOut = 1.2) {
  const s0 = Math.floor(a * SR);
  const s1 = Math.min(N, Math.ceil(b * SR));
  names.forEach((nm, vi) => {
    const f = note(nm);
    for (const [det, pan] of [[-0.09, -0.7], [0.08, 0.7]]) {
      const fr = f * 2 ** (det / 12);
      const ph = [0, vi * 1.3, vi * 2.1, vi * 0.7];
      for (let s = s0; s < s1; s++) {
        const t = s / SR;
        const e = Math.min(1, (t - a) / fadeIn, (b - t) / fadeOut);
        if (e <= 0) continue;
        let v = 0;
        for (let h = 1; h <= 3; h++) {
          ph[h] += (2 * Math.PI * fr * h) / SR;
          v += Math.sin(ph[h]) / h ** 1.6;
        }
        add(s, v * gain * Math.sin((e * Math.PI) / 2) ** 2 / names.length, pan);
      }
    }
  });
}

// Side-chain: everything sustained ducks under each kick.
function duck(t) {
  let d = 1;
  for (const [k, g] of kicks) {
    if (t >= k && t < k + 0.35) d = Math.min(d, 1 - 0.75 * g * Math.exp(-(t - k) * 9));
  }
  return d;
}

// Pulse bass: 8th notes of D2 through an opening low-pass, following a small figure.
function bass(a, b) {
  const figure = ['D2', 'D2', 'D2', 'F2', 'D2', 'D2', 'C2', 'A1'];
  let lp = 0;
  let lp2 = 0;
  let ph = 0;
  for (let s = Math.floor(a * SR); s < Math.min(N, b * SR); s++) {
    const t = s / SR;
    const step = Math.floor((t - a) / (BEAT / 2));
    const inStep = (t - a) % (BEAT / 2);
    const f = note(figure[step % figure.length]);
    ph += f / SR;
    const saw = 2 * (ph % 1) - 1;
    const open = Math.min(1, (t - a) / (b - a)); // filter opens across the section
    const cut = 0.012 + 0.05 * open + 0.06 * Math.exp(-inStep * 18);
    lp += cut * (saw - lp);
    lp2 += cut * (lp - lp2);
    const amp = 0.55 * Math.exp(-inStep * 3) * Math.min(1, inStep * 300) * Math.min(1, (b - t) * 20);
    add(s, lp2 * amp * duck(t));
  }
}

function ticks(a, b, every, gain) {
  for (let t = a, i = 0; t < b; t += every, i++) {
    const s0 = Math.floor(t * SR);
    const accent = i % 4 === 2 ? 1.6 : i % 2 ? 0.7 : 1;
    let hp = 0;
    let prev = 0;
    for (let k = 0; k < SR * 0.05; k++) {
      const x = rand();
      hp = 0.85 * (hp + x - prev);
      prev = x;
      add(s0 + k, hp * Math.exp(-(k / SR) * 90) * gain * accent, i % 2 ? 0.35 : -0.35);
    }
  }
}

function riser(a, b, gain) {
  let lpL = 0;
  let lpR = 0;
  let ph = 0;
  for (let s = Math.floor(a * SR); s < Math.min(N, b * SR); s++) {
    const t = s / SR;
    const k = ((t - a) / (b - a)) ** 2.2;
    const cut = 0.004 + 0.2 * k;
    lpL += cut * (rand() - lpL);
    lpR += cut * (rand() - lpR);
    ph += (2 * Math.PI * (180 + 1100 * k)) / SR;
    const tone = Math.sin(ph) * 0.18 * k;
    L[s] += (lpL * 0.9 + tone) * k * gain;
    R[s] += (lpR * 0.9 + tone) * k * gain;
  }
}

// --- Arrangement ---------------------------------------------------------------------------------
pad(0.2, IMPACT + 0.4, ['D3', 'A3', 'F4', 'E5'], 0.16, 3.0, 0.4); // dark D minor add9
pad(IMPACT, GAP_START, ['Bb2', 'F3', 'D4', 'A4'], 0.12, 0.6, 0.15); // tension: Bbmaj7
pad(END, DUR, ['D3', 'A3', 'F#4', 'A4', 'E5'], 0.2, 0.25, 2.2); // resolve: D major add9
for (const [t, g] of kicks) kick(t, g);
bass(IMPACT, GAP_START);
ticks(7.6, IMPACT - 0.3, BEAT / 2, 0.035); // sparse 8ths after the title
ticks(IMPACT + BEAT * 4, GAP_START, BEAT / 4, 0.05); // 16ths once the pulse is going
riser(20.5, GAP_START, 0.85);
suck(IMPACT, 0.9, 0.5);
boom(IMPACT, 0.9);
suck(END, 0.4, 0.25);
boom(END, 0.75, 2.6);
chime(3.4, 'A5', 0.1); // droplet lands
chime(7.2, 'E5', 0.08, -0.3); // title
chime(7.55, 'A5', 0.07, 0.3);
chime(END, 'A5', 0.08, -0.2); // end card
chime(END + 0.12, 'E6', 0.05, 0.25);
chime(28.5, 'D6', 0.06, 0); // the address

// Silence before the end card: cut everything dry, let only reverb breathe.
for (let s = Math.floor(GAP_START * SR); s < Math.floor((END - 0.03) * SR); s++) {
  L[s] = 0;
  R[s] = 0;
}

// --- Mix -------------------------------------------------------------------------------------------
function reverb(x, offset) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
  const o = new Float32Array(x.length);
  for (let s = 0; s < x.length; s++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.6 + c.lp * 0.4;
      c.buf[c.i] = x[s] * 0.012 + c.lp * 0.82;
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
    o[s] = acc;
  }
  return o;
}
const wl = reverb(L, 0);
const wr = reverb(R, 23);
for (let s = 0; s < N; s++) {
  const t = s / SR;
  const fade = (t < 0.15 ? t / 0.15 : 1) * (t > DUR - 1.2 ? Math.max(0, (DUR - t) / 1.2) : 1);
  L[s] = (L[s] + wl[s] * 0.6) * fade;
  R[s] = (R[s] + wr[s] * 0.6) * fade;
}

// Loudness: scale to −14 dBFS RMS, then a soft clipper keeps peaks under −1 dBFS.
let sum = 0;
for (let s = 0; s < N; s++) sum += L[s] * L[s] + R[s] * R[s];
const rms = Math.sqrt(sum / (2 * N));
const gain = 10 ** (-14 / 20) / rms;
const ceil = 10 ** (-1 / 20);
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
