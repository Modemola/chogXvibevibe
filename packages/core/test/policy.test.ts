import { describe, expect, it } from 'vitest';
import { PolicyError, TEMPLATES, TEMPLATE_IDS, compilePolicy, policyHash } from '../src/index.js';
import { addr } from './fixtures.js';

describe('policy', () => {
  it('compiles every template', () => {
    for (const id of TEMPLATE_IDS) expect(() => compilePolicy(TEMPLATES[id].policy)).not.toThrow();
  });

  it('fills defaults', () => {
    const p = compilePolicy({ version: 1, buckets: [{ id: 'all', weightBps: 10_000 }] });
    expect(p.template).toBe('custom');
    expect(p.caps).toEqual({ perWalletBps: 50, perClusterBps: 80 });
    expect(p.buckets[0]!.distribution).toBe('score');
    expect(p.buckets[0]!.maxRecipients).toBe(500);
  });

  it('allowlist buckets default to equal split and dedupe/normalize addresses', () => {
    const upper = addr(1).replace('0x', '0X').toUpperCase().replace('0X', '0x');
    const p = compilePolicy({
      version: 1,
      buckets: [{ id: 'friends', weightBps: 10_000, allowlist: [upper, addr(1), addr(2)] }],
    });
    expect(p.buckets[0]!.distribution).toBe('equal');
    expect(p.buckets[0]!.allowlist).toEqual([addr(1), addr(2)]);
  });

  it('rejects bad weights, duplicate ids, bad fallback, bad caps, bad filters, bad addresses', () => {
    const bad = (over: object) => () =>
      compilePolicy({ version: 1, buckets: [{ id: 'a', weightBps: 10_000 }], ...over });
    expect(bad({ buckets: [{ id: 'a', weightBps: 5_000 }] })).toThrow(/sum to 10000/);
    expect(bad({ buckets: [{ id: 'a', weightBps: 5_000 }, { id: 'a', weightBps: 5_000 }] })).toThrow(/duplicate/);
    expect(bad({ fallbackBucket: 'zzz' })).toThrow(/fallbackBucket/);
    expect(bad({ caps: { perWalletBps: 100, perClusterBps: 50 } })).toThrow(/perClusterBps/);
    expect(bad({ excludes: ['nope > 1'] })).toThrow(/excludes.0: Unknown field/);
    expect(bad({ buckets: [{ id: 'a', weightBps: 10_000, allowlist: ['0x123'] }] })).toThrow(/Invalid address/);
    try {
      bad({ buckets: [{ id: 'A B', weightBps: 10_000 }] })();
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyError);
    }
  });

  it('hash ignores filter formatting but not semantics', () => {
    const mk = (f: string) => compilePolicy({ version: 1, buckets: [{ id: 'a', weightBps: 10_000, filter: f }] });
    expect(policyHash(mk('spark_tier>=1 and dump_score<0.25'))).toBe(policyHash(mk('spark_tier >= 1 AND dump_score < 0.25')));
    expect(policyHash(mk('spark_tier >= 2'))).not.toBe(policyHash(mk('spark_tier >= 1')));
  });

  it('compiling a compiled policy is a no-op', () => {
    const once = compilePolicy(TEMPLATES.hold_or_die.policy);
    expect(compilePolicy(once)).toEqual(once);
  });
});
