'use client';

import { toHex } from 'viem';

/**
 * Minimal injected-wallet access (MetaMask, Rabby, Coinbase extension, …).
 * Signing is chain-agnostic personal_sign, so no network switching is needed.
 */
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function provider(): Eip1193 {
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error('No wallet found. Install a browser wallet such as MetaMask or Rabby.');
  return eth;
}

export function hasWallet(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { ethereum?: unknown }).ethereum);
}

/** Asks the wallet for accounts; returns the selected one, lowercased. */
export async function connect(): Promise<`0x${string}`> {
  const accounts = (await provider().request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts[0]) throw new Error('The wallet returned no account');
  return accounts[0].toLowerCase() as `0x${string}`;
}

/** Current account without prompting, if any. */
export async function currentAccount(): Promise<`0x${string}` | undefined> {
  const accounts = (await provider().request({ method: 'eth_accounts' })) as string[];
  return accounts[0]?.toLowerCase() as `0x${string}` | undefined;
}

export async function sign(message: string, account: `0x${string}`): Promise<`0x${string}`> {
  return (await provider().request({ method: 'personal_sign', params: [toHex(message), account] })) as `0x${string}`;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error ?? `Request failed (${res.status})`) as Error & { issues?: string[] };
    err.issues = (data as { issues?: string[] }).issues;
    throw err;
  }
  return data as T;
}
