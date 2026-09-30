import { type AllocationSet, type WalletFacts, resolveAllocation } from '@scout/core';
import { type Address, getAddress, parseEventLogs } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { BURN_SINK, DAY, ScoutDrop, TestToken, claimBatches, createDropArgs } from '../src/index.js';
import { localChain, revertName } from '../src/testing.js';

const E18 = 10n ** 18n;
const lower = (a: string) => a.toLowerCase() as Address;

type Chain = Awaited<ReturnType<typeof localChain>>;

/** A real Scout allocation over some of the chain's accounts. */
function allocate(recipients: Address[], creator: Address, sliceTokens: bigint, weights?: number[]): AllocationSet {
  const facts: WalletFacts[] = recipients.map((w, i) => ({
    wallet: lower(w),
    sparkBalance: BigInt(weights?.[i] ?? 1) * 100_000n * E18,
    guilds: [],
    scoutDrops: [],
    positions: [],
    createdLaunches: [],
    earlyBuys: [],
  }));
  return resolveAllocation({
    policy: { version: 1, caps: { perWalletBps: 10_000, perClusterBps: 10_000 }, buckets: [{ id: 'all', weightBps: 10_000 }] },
    launch: { launchId: 'L', lane: 'utility', pairClass: 'stock', creator: lower(creator), asOf: 1_790_000_000 },
    slice: sliceTokens * E18,
    wallets: facts,
  });
}

describe('ScoutDrop', () => {
  let c: Chain;
  let creator: Address;
  let recipients: Address[];
  let keeper: Address;
  let drop: Address;
  let token: Address;
  let set: AllocationSet;

  const read = <T>(address: Address, abi: typeof ScoutDrop.abi | typeof TestToken.abi, functionName: string, args: unknown[] = []) =>
    c.pub.readContract({ address, abi, functionName, args } as never) as Promise<T>;
  const write = async (from: Address, address: Address, abi: typeof ScoutDrop.abi | typeof TestToken.abi, functionName: string, args: unknown[]) => {
    const hash = await c.wallet(from).writeContract({ address, abi, functionName, args } as never);
    return c.pub.waitForTransactionReceipt({ hash });
  };
  /** eth_call the transaction: returns normally or throws with the revert data. */
  const sim = (from: Address, address: Address, abi: typeof ScoutDrop.abi, functionName: string, args: unknown[]) =>
    c.pub.simulateContract({ account: from, address, abi, functionName, args } as never);
  const balance = (who: Address, t = token) => read<bigint>(t, TestToken.abi, 'balanceOf', [who]);
  const createDrop = async (s: AllocationSet, t = token, period = 30 * DAY, sink: Address = BURN_SINK) => {
    await write(creator, t, TestToken.abi, 'approve', [drop, s.allocated]);
    const r = await write(creator, drop, ScoutDrop.abi, 'createDrop', [...createDropArgs(s, { token: t, claimPeriodSec: period, sink })]);
    const [ev] = parseEventLogs({ abi: ScoutDrop.abi, logs: r.logs, eventName: 'DropCreated' });
    return ev!.args.dropId;
  };

  beforeEach(async () => {
    c = await localChain();
    [creator, keeper, ...recipients] = c.accounts as [Address, Address, ...Address[]];
    drop = await c.deploy(creator, ScoutDrop);
    token = await c.deploy(creator, TestToken, [10_000_000n * E18, 0n]);
    set = allocate(recipients, creator, 1_000_000n, [1, 2, 3, 4]);
  }, 30_000);

  it('pays a real Scout allocation, pushed by a keeper in one batch', async () => {
    expect(set.recipients.length).toBe(4);
    const id = await createDrop(set);
    expect(await balance(drop)).toBe(set.allocated);

    const [batch] = claimBatches(set);
    const r = await write(keeper, drop, ScoutDrop.abi, 'claimMany', [id, batch!.accounts, batch!.amounts, batch!.proofs]);
    for (const rec of set.recipients) expect(await balance(getAddress(rec.wallet))).toBe(rec.amount);
    expect(await balance(drop)).toBe(0n);
    const claimed = parseEventLogs({ abi: ScoutDrop.abi, logs: r.logs, eventName: 'Claimed' });
    expect(claimed.map((e) => lower(e.args.account))).toEqual(set.recipients.map((x) => x.wallet));
    expect(claimed.every((e) => lower(e.args.submitter) === lower(keeper))).toBe(true);
    // Batch sizing in claimBatches assumes roughly 70k gas per claim.
    const perClaim = Number(r.gasUsed) / 4;
    expect(perClaim).toBeLessThan(80_000);
    process.stderr.write(`claimMany: ${r.gasUsed} gas for 4 claims (${Math.round(perClaim)} each)\n`);

    const stored = await read<readonly unknown[]>(drop, ScoutDrop.abi, 'drops', [id]);
    expect(stored[4]).toBe(set.merkleRoot);
    expect(stored[5]).toBe(set.policyHash);
  });

  it('rejects wrong amounts, foreign proofs and double claims', async () => {
    const id = await createDrop(set);
    const [b] = claimBatches(set);
    const [a0, a1] = [b!.accounts[0]!, b!.accounts[1]!];
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [id, a0, b!.amounts[0]! + 1n, b!.proofs[0]]))).toBe('InvalidProof');
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [id, a1, b!.amounts[0], b!.proofs[0]]))).toBe('InvalidProof');
    expect(await read<boolean>(drop, ScoutDrop.abi, 'canClaim', [id, a0, b!.amounts[0], b!.proofs[0]])).toBe(true);
    expect(await read<boolean>(drop, ScoutDrop.abi, 'canClaim', [id, a0, 2n ** 256n - 1n, b!.proofs[0]])).toBe(false);
    await write(recipients[0]!, drop, ScoutDrop.abi, 'claim', [id, a0, b!.amounts[0], b!.proofs[0]]);
    expect(await read<boolean>(drop, ScoutDrop.abi, 'canClaim', [id, a0, b!.amounts[0], b!.proofs[0]])).toBe(false);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [id, a0, b!.amounts[0], b!.proofs[0]]))).toBe('AlreadyClaimed');
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [99n, a0, b!.amounts[0], b!.proofs[0]]))).toBe('UnknownDrop');
  });

  it('sweeps only after the deadline, only to the sink, only once', async () => {
    const sink = '0x00000000000000000000000000000000000051c4' as Address;
    const id = await createDrop(set, token, DAY, sink);
    const [b] = claimBatches(set);
    await write(keeper, drop, ScoutDrop.abi, 'claim', [id, b!.accounts[0], b!.amounts[0], b!.proofs[0]]);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'sweep', [id]))).toBe('DropNotExpired');

    await c.increaseTime(DAY + 1);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [id, b!.accounts[1], b!.amounts[1], b!.proofs[1]]))).toBe('DropExpired');
    await write(keeper, drop, ScoutDrop.abi, 'sweep', [id]); // anyone can sweep; it never goes to the caller
    expect(await balance(sink)).toBe(set.allocated - b!.amounts[0]!);
    expect(await balance(keeper)).toBe(0n);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'sweep', [id]))).toBe('AlreadySwept');
  });

  it('refuses fee-on-transfer deposits', async () => {
    const taxed = await c.deploy(creator, TestToken, [10_000_000n * E18, 200n]); // 2% tax
    await write(creator, taxed, TestToken.abi, 'approve', [drop, set.allocated]);
    expect(
      await revertName(ScoutDrop.abi, () => sim(creator, drop, ScoutDrop.abi, 'createDrop', [...createDropArgs(set, { token: taxed })])),
    ).toBe('FeeOnTransferUnsupported');
  });

  it('a root that promises more than the deposit cannot drain other drops', async () => {
    const honest = await createDrop(set);
    // Same recipients and amounts, but the creator deposits only half.
    await write(creator, token, TestToken.abi, 'approve', [drop, set.allocated / 2n]);
    const r = await write(creator, drop, ScoutDrop.abi, 'createDrop', [token, set.merkleRoot, set.policyHash, set.allocated / 2n, BigInt(30 * DAY), BURN_SINK]);
    const under = parseEventLogs({ abi: ScoutDrop.abi, logs: r.logs, eventName: 'DropCreated' })[0]!.args.dropId;
    const [b] = claimBatches(set);
    // Largest recipient (40%) fits, then the next (30%) would push past 50%.
    await write(keeper, drop, ScoutDrop.abi, 'claim', [under, b!.accounts[0], b!.amounts[0], b!.proofs[0]]);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claim', [under, b!.accounts[1], b!.amounts[1], b!.proofs[1]]))).toBe('Overdrawn');
    // The honest drop is untouched and still pays everyone.
    await write(keeper, drop, ScoutDrop.abi, 'claimMany', [honest, b!.accounts, b!.amounts, b!.proofs]);
  });

  it('validates creation parameters', async () => {
    const args = createDropArgs(set, { token });
    await write(creator, token, TestToken.abi, 'approve', [drop, set.allocated]);
    const bad = (patch: Partial<Record<number, unknown>>) => {
      const a: unknown[] = [...args];
      for (const [i, v] of Object.entries(patch)) a[Number(i)] = v;
      return revertName(ScoutDrop.abi, () => sim(creator, drop, ScoutDrop.abi, 'createDrop', a));
    };
    expect(await bad({ 1: `0x${'00'.repeat(32)}` })).toBe('EmptyRoot');
    expect(await bad({ 3: 0n })).toBe('ZeroAmount');
    expect(await bad({ 4: BigInt(DAY - 1) })).toBe('BadClaimPeriod');
    expect(await bad({ 4: BigInt(366 * DAY) })).toBe('BadClaimPeriod');
    expect(await bad({ 5: '0x0000000000000000000000000000000000000000' })).toBe('ZeroAddress');
  });

  it('rejects mismatched batch lengths', async () => {
    const id = await createDrop(set);
    const [b] = claimBatches(set);
    expect(await revertName(ScoutDrop.abi, () => sim(keeper, drop, ScoutDrop.abi, 'claimMany', [id, b!.accounts, b!.amounts.slice(1), b!.proofs]))).toBe('LengthMismatch');
  });
});
