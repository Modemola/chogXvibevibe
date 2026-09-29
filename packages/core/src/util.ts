import { isAddress, keccak256, toBytes } from 'viem';
import type { Address, Timestamp } from './types.js';

export const DAY = 86_400;

export function normalizeAddress(value: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new Error(`Invalid address: ${value}`);
  }
  return value.toLowerCase() as Address;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Exponential decay weight for an event `ageSec` old. Future events weigh 1. */
export function decayWeight(ageSec: number, halfLifeDays: number): number {
  if (ageSec <= 0) return 1;
  return Math.pow(0.5, ageSec / (halfLifeDays * DAY));
}

export function ageSec(asOf: Timestamp, at: Timestamp): number {
  return asOf - at;
}

/** Whole-token value of a raw bigint balance, as a float (fine for thresholds). */
export function toWhole(raw: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(raw / base) + Number(raw % base) / Number(base);
}

/** Round to 9 decimals so float noise cannot change a ranking between machines. */
export function round9(x: number): number {
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/** Deterministic JSON: sorted keys, bigints as decimal strings. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function hashJson(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)));
}

export function compareAddress(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
