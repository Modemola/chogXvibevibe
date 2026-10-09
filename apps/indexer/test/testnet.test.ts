import { type Address, TEMPLATES, resolveAllocation } from '@scout/core';
import { BURN_SINK, ScoutDrop, TestToken, claimBatches, createDropArgs } from '@scout/contracts';
import { localChain } from '@scout/contracts/testing';
import { createPgliteDb, listProfileWallets, loadWalletFacts, migrate, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { describe, expect, it } from 'vitest';
import { pushClaims, runShowcaseDrop } from '../src/testnet.js';

const E18 = 10n ** 18n;

describe('runShowcaseDrop', () => {
  it('deploys, funds and pays out a resolved drop, every recipient claimed', async () => {
    const db = await createPgliteDb();
    await migrate(db);
    const world = simulateWorld({ seed: 7, wallets: 120, launches: 10 });
    await writeBatch(db, world.batch);
    const wallets = await listProfileWallets(db, world.asOf);
    const facts = await loadWalletFacts(db, { wallets, asOf: world.asOf });
    const set = resolveAllocation({
      policy: TEMPLATES.custom.policy,
      launch: { launchId: 'sim-demo', lane: 'utility', pairClass: 'stock', creator: '0x000000000000000000000000000000000000dead', asOf: world.asOf },
      slice: 1_000_000n * E18,
      wallets: facts,
    });
    expect(set.recipients.length).toBeGreaterThan(20); // more than one claim batch of 20

    const c = await localChain();
    const wallet = c.wallet(c.accounts[0]!) as Parameters<typeof runShowcaseDrop>[0]['wallet'];
    const lines: string[] = [];
    const r = await runShowcaseDrop({ pub: c.pub, wallet, set, template: 'custom', batchSize: 20, log: (l) => lines.push(l) });

    expect(r).toMatchObject({ chainId: 1337, dropId: '1', recipients: set.recipients.length, claimed: set.recipients.length, policyHash: set.policyHash });
    expect(r.txs.claims.length).toBe(Math.ceil(set.recipients.length / 20));
    for (const rec of [set.recipients[0]!, set.recipients.at(-1)!]) {
      const claimed = await c.pub.readContract({ address: r.scoutDrop, abi: ScoutDrop.abi, functionName: 'hasClaimed', args: [1n, rec.wallet] });
      const balance = await c.pub.readContract({ address: r.token, abi: TestToken.abi, functionName: 'balanceOf', args: [rec.wallet as Address] });
      expect([claimed, balance]).toEqual([true, rec.amount]);
    }
    expect(lines.at(-1)).toBe(`Claimed ${set.recipients.length}/${set.recipients.length}`);

    // A second drop where one recipient claims for themselves before the keeper's batch:
    // the keeper skips them instead of reverting the whole batch.
    await wallet.writeContract({ address: r.token, abi: TestToken.abi, functionName: 'approve', args: [r.scoutDrop, set.allocated] });
    const created = await wallet.writeContract({
      address: r.scoutDrop,
      abi: ScoutDrop.abi,
      functionName: 'createDrop',
      args: [...createDropArgs(set, { token: r.token, sink: BURN_SINK })],
    });
    await c.pub.waitForTransactionReceipt({ hash: created });
    const [first] = claimBatches(set, 20);
    const self = await wallet.writeContract({
      address: r.scoutDrop,
      abi: ScoutDrop.abi,
      functionName: 'claim',
      args: [2n, first!.accounts[3]!, first!.amounts[3]!, first!.proofs[3]!],
    });
    await c.pub.waitForTransactionReceipt({ hash: self });
    const pushed = await pushClaims({ pub: c.pub, wallet, scoutDrop: r.scoutDrop, dropId: 2n, set, batchSize: 20 });
    expect(pushed.claimed).toBe(set.recipients.length);
    for (const rec of set.recipients) {
      expect(await c.pub.readContract({ address: r.scoutDrop, abi: ScoutDrop.abi, functionName: 'hasClaimed', args: [2n, rec.wallet] })).toBe(true);
    }
    // Re-running sends nothing.
    expect((await pushClaims({ pub: c.pub, wallet, scoutDrop: r.scoutDrop, dropId: 2n, set, batchSize: 20 })).txs).toEqual([]);
    await db.close();
  }, 240_000);
});
