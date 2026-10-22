// Builds the soundtracks for the Spot the Farm puzzle and reveal: a slice of the Chog film's tune with a pop on every
// buy from src/data/farm.json (the farm's three wallets pop together, so they sound louder), then the cues.
// Usage: node scripts/farm-audio.mjs   (needs public/chog-tune.wav from scripts/chog-tune.mjs)
import { readFileSync, writeFileSync } from 'node:fs';

const farm = JSON.parse(readFileSync('src/data/farm.json', 'utf8'));
const src = readFileSync('public/chog-tune.wav');
const SR = 48000;
const pcm = src.subarray(44);
const sample = (i, ch) => (i * 4 + ch * 2 + 1 < pcm.length ? pcm.readInt16LE(i * 4 + ch * 2) / 32768 : 0);

function track(dur, musicFrom, musicGain) {
  const N = Math.round(dur * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const music = (fromSec, toSec, gainAt) => {
    for (let i = Math.round(fromSec * SR); i < Math.min(N, Math.round(toSec * SR)); i++) {
      const g = gainAt(i / SR);
      const j = Math.round(musicFrom * SR) + i;
      L[i] += sample(j, 0) * g;
      R[i] += sample(j, 1) * g;
    }
  };
  const add = (at, fn, len, pan = 0) => {
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    for (let k = 0; k < len * SR; k++) {
      const i = Math.round(at * SR) + k;
      if (i < 0 || i >= N) continue;
      const v = fn(k / SR);
      L[i] += v * gl;
      R[i] += v * gr;
    }
  };
  const pop = (at, g = 0.35, pitch = 1, pan = 0) => {
    let ph = 0;
    add(at, (t) => {
      ph += (2 * Math.PI * (420 + 7000 * t) * pitch) / SR;
      return Math.sin(ph) * Math.exp(-t * 32) * g;
    }, 0.12, pan);
  };
  const ding = (at, f, g = 0.25, len = 1.2) => add(at, (t) => (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3)) * Math.exp(-t * 2.4) * g, len);
  const tick = (at, g = 0.3) => add(at, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 60) * g, 0.08);
  const thud = (at, g = 0.9) => {
    let ph = 0;
    add(at, (t) => {
      ph += (2 * Math.PI * (55 + 90 * Math.exp(-t * 20))) / SR;
      return Math.sin(ph) * Math.exp(-t * 7) * g;
    }, 0.6);
  };
  const zap = (at, g = 0.3) => {
    let ph = 0;
    add(at, (t) => {
      ph += (2 * Math.PI * (300 + 2400 * t)) / SR;
      return Math.sign(Math.sin(ph)) * Math.exp(-t * 6) * g * 0.4;
    }, 0.5);
  };
  return { N, L, R, music, pop, ding, tick, thud, zap, musicGain };
}

function write(file, { N, L, R }) {
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0.95 ? 0.95 / peak : 1;
  const out = Buffer.alloc(44 + N * 4);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + N * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  writeFileSync(file, out);
  console.log(file, (N / SR).toFixed(1) + 's');
}

const panOf = (n) => (((n - 1) % 4) - 1.5) / 2;

// Puzzle: 15 s. The groove plays under the buys, drops away at the freeze, then a three-tick countdown.
{
  const a = track(15, 10, 0.6);
  a.music(0, 10.8, (t) => 0.6 * Math.min(1, t / 0.3));
  a.music(10.8, 15, (t) => 0.6 * Math.max(0, 1 - (t - 10.8) / 0.6) + 0.15);
  for (const e of farm.events) for (const w of e.w) a.pop(e.t, 0.32, 1 + (w % 3) * 0.04, panOf(w));
  a.ding(10.8, 880, 0.3);
  for (const s of [11.8, 12.8, 13.8]) a.tick(s, 0.35);
  a.ding(14.3, 1320, 0.2, 0.8);
  write('public/farm-puzzle.wav', a);
}

// Reveal: 16 s. The replay at double speed, a zap as the links snap, a thud as the three become one.
{
  const a = track(16, 76, 0.55);
  a.music(0, 16, (t) => 0.55 * Math.min(1, t / 0.3) * Math.min(1, (16 - t) / 0.6));
  for (const e of farm.events) for (const w of e.w) a.pop(1.8 + (e.t - 2.4) / 2, 0.28, 1 + (w % 3) * 0.04, panOf(w));
  a.zap(6.2, 0.35);
  a.ding(7.0, 660, 0.25);
  a.thud(11.2, 0.9);
  a.ding(11.3, 1320, 0.25);
  a.ding(13.0, 990, 0.2);
  write('public/farm-reveal.wav', a);
}
