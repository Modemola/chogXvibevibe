import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { MessageError, buildMessage, normalizeAddress, parseMessage, verifySignature } from '../src/index.js';

const alice = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const bob = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const env = { nonce: 'abc123', issuedAt: 1_790_000_000 };

describe('signed messages', () => {
  it('round-trips every action', () => {
    const actions = [
      { kind: 'opt_in', wallet: normalizeAddress(alice.address) },
      { kind: 'link', primary: normalizeAddress(alice.address), alt: normalizeAddress(bob.address) },
      { kind: 'lock_policy', creator: normalizeAddress(alice.address), launchId: 'sim-0001', policyHash: `0x${'ab'.repeat(32)}` },
    ] as const;
    for (const action of actions) {
      expect(parseMessage(buildMessage(action, env))).toEqual({ action, envelope: env });
    }
  });

  it('rejects tampered or foreign messages', () => {
    const msg = buildMessage({ kind: 'opt_in', wallet: normalizeAddress(alice.address) }, env);
    expect(() => parseMessage(msg.replace('I want', 'We want'))).toThrow(MessageError);
    expect(() => parseMessage(msg + '\nextra')).toThrow(MessageError);
    expect(() => parseMessage('hello')).toThrow(/Unknown/);
  });

  it('verifies personal_sign signatures from the right wallet only', async () => {
    const msg = buildMessage({ kind: 'opt_in', wallet: normalizeAddress(alice.address) }, env);
    const sig = await alice.signMessage({ message: msg });
    expect(await verifySignature(msg, normalizeAddress(alice.address), sig)).toBe(true);
    expect(await verifySignature(msg, normalizeAddress(bob.address), sig)).toBe(false);
    expect(await verifySignature(msg, normalizeAddress(alice.address), '0x1234')).toBe(false);
  });
});
