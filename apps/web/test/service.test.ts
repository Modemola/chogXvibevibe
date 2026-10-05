import { TEMPLATES, buildMessage, normalizeAddress } from '@scout/core';
import { type Db, createPgliteDb, migrate, runAftermath, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, ScoutService } from '../lib/service.js';

const alice = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const bob = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const A = normalizeAddress(alice.address);
const B = normalizeAddress(bob.address);

describe('ScoutService', () => {
  let db: Db;
  let svc: ScoutService;
  const world = simulateWorld({ seed: 3, wallets: 150, launches: 30 });
  let clock = world.asOf + 3_600;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    await writeBatch(db, world.batch);
    await runAftermath(db, { now: world.asOf });
    svc = new ScoutService(db, { now: () => clock, cacheSec: 0 });
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });

  const expectApiError = async (p: Promise<unknown>, status: number, match?: RegExp) => {
    const e = await p.then(() => undefined, (x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    if (match) expect((e as ApiError).message).toMatch(match);
  };

  it('reports stats and launches', async () => {
    const s = await svc.stats();
    expect(s.profiles).toBe(world.batch.profiles!.length);
    expect(s.launches).toBe(30);
    expect((await svc.launches()).length).toBe(30);
  });

  it('explains a profile, with template eligibility', async () => {
    const wallet = world.batch.profiles![0]!.wallet;
    const p = await svc.profile(wallet, { template: 'hold_or_die' });
    expect(p.optedIn).toBe(true);
    expect(p.eligibility.map((e) => e.template)).toEqual(Object.keys(TEMPLATES));
    const sum = p.reasons.reduce((s, r) => s + r.contrib, 0);
    expect(Math.abs(sum - p.score)).toBeLessThan(0.05); // small contributions are hidden
    await expectApiError(svc.profile('0x123'), 400, /wallet/);
    await expectApiError(svc.profile(wallet, { template: 'nope' }), 400, /template/);
  });

  it('shows a score preview for wallets that never opted in', async () => {
    const p = await svc.profile(A);
    expect(p.optedIn).toBe(false);
    expect(p.score).toBeCloseTo(0.2, 2); // baseline priors only
  });

  it('opts in with a signed, single-use, fresh message', async () => {
    const { nonce, issuedAt } = await svc.issueNonce();
    const message = buildMessage({ kind: 'opt_in', wallet: A }, { nonce, issuedAt });
    await expectApiError(svc.optIn({ message, signature: await bob.signMessage({ message }) }), 401);
    const signature = await alice.signMessage({ message });
    expect(await svc.optIn({ message, signature })).toEqual({ wallet: A, created: true });
    await expectApiError(svc.optIn({ message, signature }), 400, /nonce/); // replay
    expect((await svc.profile(A)).optedIn).toBe(true);

    const stale = await svc.issueNonce();
    const old = buildMessage({ kind: 'opt_in', wallet: A }, stale);
    clock += 3_600;
    await expectApiError(svc.optIn({ message: old, signature: await alice.signMessage({ message: old }) }), 400, /expired/);
  });

  it('shows a fresh opt-in on another server instance with a warm cache', async () => {
    const carol = privateKeyToAccount(generatePrivateKey());
    const C = normalizeAddress(carol.address);
    // A second instance on the same database, whose population cache is warmed before the opt-in.
    const other = new ScoutService(db, { now: () => clock, cacheSec: 600 });
    expect((await other.profile(C)).optedIn).toBe(false);
    const env = await svc.issueNonce();
    const message = buildMessage({ kind: 'opt_in', wallet: C }, env);
    await svc.optIn({ message, signature: await carol.signMessage({ message }) });
    expect((await other.profile(C)).optedIn).toBe(true);
  });

  it('links wallets only when both sign', async () => {
    const env = await svc.issueNonce();
    const message = buildMessage({ kind: 'link', primary: A, alt: B }, env);
    const altSig = await bob.signMessage({ message });
    await expectApiError(svc.link({ message, signature: altSig, primarySignature: altSig }), 401, /primary/);
    expect(await svc.link({ message, signature: altSig, primarySignature: await alice.signMessage({ message }) })).toEqual({
      primary: A,
      alt: B,
    });
    const pa = await svc.profile(A);
    expect(pa.alts).toEqual([B]);
    const pb = await svc.profile(B);
    expect(pb.linkedTo).toBe(A);
    expect(pb.cluster.size).toBe(2);
    expect(pb.cluster.sybilScore).toBe(0);

    // B can't become a primary now.
    const env2 = await svc.issueNonce();
    const msg2 = buildMessage({ kind: 'link', primary: B, alt: normalizeAddress('0x00000000000000000000000000000000000000aa') }, env2);
    await expectApiError(
      svc.link({ message: msg2, signature: await bob.signMessage({ message: msg2 }), primarySignature: await bob.signMessage({ message: msg2 }) }),
      401,
    );
  });

  it('previews allocations for stored and ad-hoc launches', async () => {
    const launchId = world.batch.launches![0]!.id;
    const p = await svc.preview({ policy: TEMPLATES.custom.policy, launch: { launchId }, sliceTokens: '1000000', topN: 5 });
    expect(p.recipients.length).toBeLessThanOrEqual(5);
    expect(p.totalRecipients).toBeGreaterThan(5);
    expect(p.allocated + p.unallocated).toBe(1_000_000n * 10n ** 18n);

    const adhoc = await svc.preview({
      policy: TEMPLATES.spark_core.policy,
      launch: { lane: 'meme', pairClass: 'eth', creator: A },
      sliceTokens: 500,
    });
    expect(adhoc.recipients.some((r) => r.wallet === A || r.wallet === B)).toBe(false); // creator cluster
    await expectApiError(svc.preview({ policy: { version: 1, buckets: [] }, launch: { launchId }, sliceTokens: 1 }), 400);
    await expectApiError(svc.preview({ policy: TEMPLATES.custom.policy, launch: { launchId: 'nope' }, sliceTokens: 1 }), 404);
    await expectApiError(svc.preview({ policy: TEMPLATES.custom.policy, launch: { launchId }, sliceTokens: '1.5' }), 400);
    const csv = await svc.exportCsv({ policy: TEMPLATES.custom.policy, launch: { launchId }, sliceTokens: 1000 });
    expect(csv.startsWith('wallet,amount,score,buckets\n')).toBe(true);
  });

  it('serves the aftermath card for a launch with a Scout drop', async () => {
    const launch = (await svc.launches()).find((l) => l.drops > 0)!;
    const a = await svc.aftermath(launch.id);
    expect(a.recipients.length).toBe(launch.drops);
    const h1 = a.windows.find((w) => w.window === 'h1')!;
    expect(h1.measured).toBe(launch.drops);
    expect(h1.held + h1.trimmed + h1.mostlySold + h1.dumped).toBe(h1.measured);
    expect(h1.retained).toBeGreaterThan(0);
    await expectApiError(svc.aftermath('nope'), 404);
  });

  it('saves policies by hash and lets only the creator lock one per launch', async () => {
    const { hash } = await svc.savePolicy(TEMPLATES.hold_or_die.policy);
    expect((await svc.savePolicy(TEMPLATES.hold_or_die.policy)).hash).toBe(hash);
    expect((await svc.getPolicy(hash)).policy.template).toBe('hold_or_die');

    // Pretend alice created launch 0.
    const launchId = world.batch.launches![0]!.id;
    await db.query('UPDATE launches SET creator = $1 WHERE id = $2', [A, launchId]);

    const env = await svc.issueNonce();
    const byBob = buildMessage({ kind: 'lock_policy', creator: B, launchId, policyHash: hash }, env);
    await expectApiError(svc.lockPolicy({ message: byBob, signature: await bob.signMessage({ message: byBob }) }), 403);

    const message = buildMessage({ kind: 'lock_policy', creator: A, launchId, policyHash: hash }, env);
    expect(await svc.lockPolicy({ message, signature: await alice.signMessage({ message }) })).toEqual({ launchId, policyHash: hash });
    expect((await svc.launches()).find((l) => l.id === launchId)!.lockedPolicy).toBe(hash);

    const env2 = await svc.issueNonce();
    const again = buildMessage({ kind: 'lock_policy', creator: A, launchId, policyHash: hash }, env2);
    await expectApiError(svc.lockPolicy({ message: again, signature: await alice.signMessage({ message: again }) }), 409);
  });
});
