import { type Address, type WalletFacts, resolveAllocation } from '@scout/core';
import { BURN_SINK, DAY, ScoutDrop, TestToken, claimBatches, createDropArgs } from '@scout/contracts';
import { localChain } from '@scout/contracts/testing';
import { type Db, createPgliteDb, migrate, runAftermath, writeBatch } from '@scout/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestScoutDrops } from '../src/onchain.js';

const E18 = 10n ** 18n;
const lower = (a: string) => a.toLowerCase() as Address;
const H = 3_600;

/**
 * The whole on-chain loop on an in-process EVM:
 * resolve → fund ScoutDrop → keeper pushes claims → recipients act →
 * ingest events and transfers → aftermath measures what they did.
 */
describe('ScoutDrop on-chain loop', () => {
  let db: Db;
  let c: Awaited<ReturnType<typeof localChain>>;
  let contract: Address;
  let token: Address;
  let recipients: Address[];
  let set: ReturnType<typeof resolveAllocation>;
  const POOL = '0x00000000000000000000000000000000000900a1' as Address;
  const LOCKER = '0x00000000000000000000000000000000000010cc' as Address;

  const send = async (from: Address, address: Address, abi: typeof ScoutDrop.abi | typeof TestToken.abi, functionName: string, args: unknown[]) => {
    const hash = await c.wallet(from).writeContract({ address, abi, functionName, args } as never);
    return c.pub.waitForTransactionReceipt({ hash });
  };

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    c = await localChain();
    const [creator, keeper, ...rest] = c.accounts as [Address, Address, ...Address[]];
    recipients = rest.slice(0, 4);
    contract = await c.deploy(creator, ScoutDrop);
    token = await c.deploy(creator, TestToken, [10_000_000n * E18, 0n]);

    await writeBatch(db, {
      launches: [
        { id: 'L-chain', token: lower(token), creator: lower(creator), lane: 'utility', pairClass: 'stock', taxBps: 0, createdAt: (await c.now()) - DAY, hasProductLinks: true, flaggedRug: false },
      ],
      holdContracts: [{ address: LOCKER, label: 'test locker' }],
    });

    const facts: WalletFacts[] = recipients.map((w) => ({ wallet: lower(w), sparkBalance: 100_000n * E18, guilds: [], scoutDrops: [], positions: [], createdLaunches: [], earlyBuys: [] }));
    set = resolveAllocation({
      policy: { version: 1, caps: { perWalletBps: 10_000, perClusterBps: 10_000 }, buckets: [{ id: 'all', weightBps: 10_000, distribution: 'equal' }] },
      launch: { launchId: 'L-chain', lane: 'utility', pairClass: 'stock', creator: lower(creator), asOf: await c.now() },
      slice: 1_000n * E18,
      wallets: facts,
    });

    await send(creator, token, TestToken.abi, 'approve', [contract, set.allocated]);
    await send(creator, contract, ScoutDrop.abi, 'createDrop', [...createDropArgs(set, { token, sink: BURN_SINK })]);
    const [batch] = claimBatches(set);
    await send(keeper, contract, ScoutDrop.abi, 'claimMany', [1n, batch!.accounts, batch!.amounts, batch!.proofs]);

    const [dumper, trimmer, staker] = recipients as [Address, Address, Address, Address];
    const each = 250n * E18;
    await c.increaseTime(600);
    await send(dumper, token, TestToken.abi, 'transfer', [POOL, each]); // 100% within 10 minutes
    await send(staker, token, TestToken.abi, 'transfer', [LOCKER, each]); // staked, not sold
    await c.increaseTime(2 * H);
    await send(trimmer, token, TestToken.abi, 'transfer', [POOL, (each * 3n) / 10n]); // 30% after 2 hours
    await c.increaseTime(DAY);
    await send(creator, token, TestToken.abi, 'transfer', [POOL, 1n]); // move the chain on past 24h
  }, 120_000);
  afterAll(async () => {
    await db.close();
  });

  it('ingests drops, claims and transfers, and aftermath measures each recipient', async () => {
    const toBlock = await c.pub.getBlockNumber();
    const r = await ingestScoutDrops(db, { client: c.pub, contract, startBlock: 0n, toBlock });
    expect(r).toMatchObject({ drops: 1, unknownTokens: [], claims: 4, claimsRecorded: 4 });
    expect(r.transfers).toBeGreaterThanOrEqual(9);

    const [drop] = await db.query<{ launch_id: string; policy_hash: string; claimed: string }>('SELECT launch_id, policy_hash, claimed::text FROM onchain_drops');
    expect(drop).toEqual({ launch_id: 'L-chain', policy_hash: set.policyHash, claimed: set.allocated.toString() });

    const am = await runAftermath(db);
    expect(am).toMatchObject({ measured: 4, unobserved: 0 });
    const rows = await db.query<{ wallet: string; window: string; sold_bps: number }>('SELECT wallet, "window", sold_bps FROM drop_outcomes ORDER BY wallet, "window"');
    const sold = (w: Address, win: string) => rows.find((x) => x.wallet === lower(w) && x.window === win)?.sold_bps;
    const [dumper, trimmer, staker, holder] = recipients as [Address, Address, Address, Address];
    expect([sold(dumper, 'h1'), sold(dumper, 'h24')]).toEqual([10_000, 10_000]);
    expect([sold(trimmer, 'h1'), sold(trimmer, 'h24')]).toEqual([0, 3_000]);
    expect([sold(staker, 'h1'), sold(staker, 'h24')]).toEqual([0, 0]);
    expect([sold(holder, 'h1'), sold(holder, 'h24')]).toEqual([0, 0]);
  });

  it('re-running ingest picks up only new blocks', async () => {
    const toBlock = await c.pub.getBlockNumber();
    const again = await ingestScoutDrops(db, { client: c.pub, contract, startBlock: 0n, toBlock });
    expect(again).toMatchObject({ drops: 0, claims: 0, transfers: 0 });
    const [{ n }] = (await db.query<{ n: string }>('SELECT count(*)::text AS n FROM scout_drops')) as [{ n: string }];
    expect(n).toBe('4');
  });
});
