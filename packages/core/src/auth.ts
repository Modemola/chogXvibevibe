import { verifyMessage } from 'viem';
import type { Address } from './types.js';
import { normalizeAddress } from './util.js';

/**
 * Human-readable messages wallets sign. Every message carries a server nonce
 * and an issue time, so a signature can be used once and only briefly.
 *
 * Linking needs both wallets to sign the same message. A one-sided link would
 * let anyone attach a wallet to a stranger and eat into their allocation cap.
 */

export type SignedAction =
  | { kind: 'opt_in'; wallet: Address }
  | { kind: 'link'; primary: Address; alt: Address }
  | { kind: 'lock_policy'; creator: Address; launchId: string; policyHash: `0x${string}` };

export interface MessageEnvelope {
  nonce: string;
  issuedAt: number;
}

const HEADERS: Record<SignedAction['kind'], string> = {
  opt_in: 'Graduation Scout: opt in',
  link: 'Graduation Scout: link wallets',
  lock_policy: 'Graduation Scout: lock airdrop policy',
};

const STATEMENTS: Record<SignedAction['kind'], string> = {
  opt_in:
    'I want this wallet scored for vibe/vibe graduation airdrops. Scores use public on-chain activity and are shown with their reasons.',
  link: 'Both wallets sign this message. Linked wallets are scored as one person and share one allocation cap.',
  lock_policy: 'I am the creator of this launch and lock this airdrop policy for its graduation.',
};

export function buildMessage(action: SignedAction, env: MessageEnvelope): string {
  const lines = [HEADERS[action.kind], ''];
  switch (action.kind) {
    case 'opt_in':
      lines.push(`Wallet: ${action.wallet}`);
      break;
    case 'link':
      lines.push(`Primary: ${action.primary}`, `Alt: ${action.alt}`);
      break;
    case 'lock_policy':
      lines.push(`Creator: ${action.creator}`, `Launch: ${action.launchId}`, `Policy: ${action.policyHash}`);
      break;
  }
  lines.push('', STATEMENTS[action.kind], '', `Nonce: ${env.nonce}`, `Issued At: ${new Date(env.issuedAt * 1000).toISOString()}`);
  return lines.join('\n');
}

export class MessageError extends Error {}

/** Parses a message and checks it is exactly what `buildMessage` would produce. */
export function parseMessage(message: string): { action: SignedAction; envelope: MessageEnvelope } {
  const lines = message.split('\n');
  const kind = (Object.keys(HEADERS) as SignedAction['kind'][]).find((k) => HEADERS[k] === lines[0]);
  if (!kind) throw new MessageError('Unknown message type');
  const field = (name: string) => {
    const line = lines.find((l) => l.startsWith(`${name}: `));
    if (!line) throw new MessageError(`Missing ${name}`);
    return line.slice(name.length + 2);
  };
  const addr = (name: string) => {
    try {
      return normalizeAddress(field(name));
    } catch {
      throw new MessageError(`Invalid ${name}`);
    }
  };

  let action: SignedAction;
  if (kind === 'opt_in') action = { kind, wallet: addr('Wallet') };
  else if (kind === 'link') action = { kind, primary: addr('Primary'), alt: addr('Alt') };
  else {
    const policyHash = field('Policy');
    if (!/^0x[0-9a-f]{64}$/.test(policyHash)) throw new MessageError('Invalid Policy');
    action = { kind, creator: addr('Creator'), launchId: field('Launch'), policyHash: policyHash as `0x${string}` };
  }
  const issuedMs = Date.parse(field('Issued At'));
  if (!Number.isFinite(issuedMs)) throw new MessageError('Invalid Issued At');
  const envelope = { nonce: field('Nonce'), issuedAt: Math.floor(issuedMs / 1000) };
  if (buildMessage(action, envelope) !== message) throw new MessageError('Message does not match the expected format');
  return { action, envelope };
}

/** EOA signature check (personal_sign). No network access. */
export async function verifySignature(message: string, signer: Address, signature: `0x${string}`): Promise<boolean> {
  try {
    return await verifyMessage({ address: signer, message, signature });
  } catch {
    return false;
  }
}
