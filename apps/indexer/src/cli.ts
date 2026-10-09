#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DEFAULT_SCORING_CONFIG,
  type LaunchContext,
  type Lane,
  type PairClass,
  type ScoringConfig,
  TEMPLATES,
  TEMPLATE_IDS,
  type TemplateId,
  allocationToCsv,
  normalizeAddress,
  type Address,
  resolveAllocation,
} from '@scout/core';
import {
  type Db,
  hubFunders,
  latestSnapshotId,
  listProfileWallets,
  loadLaunchContext,
  loadSimLabels,
  loadEvidenceFacts,
  loadWalletFacts,
  migrate,
  openDb,
  runAftermath,
  writeBatch,
} from '@scout/db';
import { BURN_SINK, createDropArgs, claimBatches } from '@scout/contracts';
import { http, createPublicClient, createWalletClient, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SPARK_BASE, createBaseClient, createRpcClient, simulateWorld, snapshotErc20 } from '@scout/sources';
import { evaluate, renderReport } from './evaluate.js';
import { ingestScoutDrops } from './onchain.js';
import { robinhoodTestnet, runShowcaseDrop, transfersOpen } from './testnet.js';

const USAGE = `scout <command> [options]

Database: DATABASE_URL if set, otherwise PGlite at --data (default: <repo>/.data/pglite, shared with the web app).

Commands
  migrate                               Apply schema migrations
  simulate  [--seed 42] [--wallets 400] [--launches 80] [--farms 4]
                                        Write a simulated vibe/vibe world
  spark-snapshot --rpc URL --from-block N [--to-block N|latest] [--token 0x..] [--chunk 10000]
                                        Snapshot SPARK (or any ERC-20) holders on Base
  aftermath [--as-of T]                   Measure Scout drops whose 1h/24h/7d/30d windows have ended
                                        (default now: latest indexed transfer). Run on a schedule.
  hubs      [--min-fanout 20]           List funders that funded many wallets (sybil ignore candidates)
  facts     <wallet> [--as-of T]        Print the WalletFacts Scout sees for a wallet
  resolve   [--launch ID | --lane L --pair P --creator 0x..] [--template T] [--slice N]
            [--as-of T] [--out file.csv] [--drop-out drop.json] [--token 0x..] [--ignore-hubs 20]
                                        Resolve an allocation over all opted-in profiles.
                                        --drop-out writes ScoutDrop createDrop args + claim batches with proofs
  ingest-drops --rpc URL --contract 0x.. --from-block N [--to-block N|latest] [--chunk 2000]
                                        Read ScoutDrop events and launch-token transfers, then run aftermath
  showcase-drop --rpc URL [--launch ID] [--template hold_or_die] [--slice N] [--out file.json]
              [--scoutdrop 0x..] [--token 0x..]
                                        Run a resolved drop for real: deploy ScoutDrop and a demo token (or reuse
                                        them), fund the drop, push every claim. Needs DEPLOYER_PRIVATE_KEY in the
                                        environment. Defaults to the most recently graduated launch
                                        that has no Scout drop yet.
  token-status --rpc URL --token 0x.. [--holder 0x..]
                                        Name, supply, the holder's balance, and whether transfers are open
                                        (vibe/vibe locks them until graduation). Exits 2 while locked.
  evaluate  [--template T] [--ignore-hubs 20] [--as-of T]
                                        Score simulated profiles against ground truth

Templates: ${TEMPLATE_IDS.join(', ')}
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string', default: process.env.SCOUT_PGLITE_DIR ?? fileURLToPath(new URL('../../../.data/pglite', import.meta.url)) },
    seed: { type: 'string' },
    wallets: { type: 'string' },
    launches: { type: 'string' },
    farms: { type: 'string' },
    rpc: { type: 'string' },
    'from-block': { type: 'string' },
    'to-block': { type: 'string' },
    token: { type: 'string' },
    chunk: { type: 'string' },
    'min-fanout': { type: 'string' },
    'as-of': { type: 'string' },
    launch: { type: 'string' },
    lane: { type: 'string' },
    pair: { type: 'string' },
    creator: { type: 'string' },
    template: { type: 'string' },
    slice: { type: 'string' },
    out: { type: 'string' },
    'ignore-hubs': { type: 'string' },
    'drop-out': { type: 'string' },
    contract: { type: 'string' },
    scoutdrop: { type: 'string' },
    holder: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const int = (v: string | undefined, d: number) => (v === undefined ? d : Number.parseInt(v, 10));
const E18 = 10n ** 18n;

async function latestActivity(db: Db): Promise<number> {
  const [row] = await db.query<{ t: string | null }>(
    'SELECT GREATEST((SELECT max(ts) FROM trades), (SELECT max(opted_in_at) FROM profiles)) AS t',
  );
  return row?.t ? Number(row.t) : Math.floor(Date.now() / 1000);
}

async function configWithHubs(db: Db, minFanout: string | undefined): Promise<ScoringConfig> {
  if (minFanout === undefined) return DEFAULT_SCORING_CONFIG;
  const hubs = await hubFunders(db, Number(minFanout));
  console.error(`Ignoring ${hubs.length} hub funder(s) with fanout >= ${minFanout}`);
  return { ...DEFAULT_SCORING_CONFIG, sybil: { ...DEFAULT_SCORING_CONFIG.sybil, ignoredFunders: hubs.map((h) => h.funder) } };
}

async function sparkSnapshotFor(db: Db, asOf: number): Promise<string | undefined> {
  // Prefer the real SPARK snapshot; fall back to whatever the simulator wrote.
  const real = await latestSnapshotId(db, SPARK_BASE, asOf);
  if (real) return real;
  const [row] = await db.query<{ id: string }>(
    'SELECT id FROM snapshots WHERE taken_at <= $1 ORDER BY taken_at DESC, id DESC LIMIT 1',
    [asOf],
  );
  return row?.id;
}

function templateArg(): TemplateId {
  const t = (values.template ?? 'custom') as TemplateId;
  if (!TEMPLATE_IDS.includes(t)) throw new Error(`Unknown template '${t}'. One of: ${TEMPLATE_IDS.join(', ')}`);
  return t;
}

/** Resolves a template over every opted-in profile for --launch (or an ad-hoc launch from --lane/--pair/--creator). */
async function resolveFromArgs(db: Db, launchId: string | undefined) {
  const asOf = values['as-of'] ? Number(values['as-of']) : await latestActivity(db);
  let launch: LaunchContext | undefined;
  if (launchId) {
    launch = await loadLaunchContext(db, launchId, asOf);
    if (!launch) throw new Error(`Launch ${launchId} not found`);
  } else {
    launch = {
      launchId: 'adhoc',
      lane: (values.lane ?? 'utility') as Lane,
      pairClass: (values.pair ?? 'stock') as PairClass,
      creator: normalizeAddress(values.creator ?? '0x000000000000000000000000000000000000dead'),
      asOf,
    };
  }
  const config = await configWithHubs(db, values['ignore-hubs']);
  const wallets = await listProfileWallets(db, asOf);
  const snapshot = await sparkSnapshotFor(db, asOf);
  const facts = await loadWalletFacts(db, { wallets, asOf, sparkSnapshotId: snapshot });
  const [creatorFacts] = await loadWalletFacts(db, { wallets: [launch.creator], asOf, sparkSnapshotId: snapshot });
  const evidence = await loadEvidenceFacts(db, { asOf });
  const template = templateArg();
  const set = resolveAllocation({
    policy: TEMPLATES[template].policy,
    launch,
    slice: BigInt(values.slice ?? '1000000') * E18,
    wallets: facts,
    evidence,
    creatorFacts,
    config,
  });
  return { set, launch, facts, template };
}

async function main() {
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    console.log(USAGE);
    return;
  }

  const db = await openDb({ pgliteDir: values.data });
  try {
    const applied = await migrate(db);
    if (applied.length) console.error(`Applied migrations: ${applied.join(', ')}`);

    switch (command) {
      case 'migrate':
        break;

      case 'simulate': {
        const world = simulateWorld({
          seed: int(values.seed, 42),
          wallets: int(values.wallets, 400),
          launches: int(values.launches, 80),
          farms: int(values.farms, 4),
        });
        await writeBatch(db, world.batch);
        const am = await runAftermath(db, { now: world.asOf });
        const b = world.batch;
        console.log(
          [
            `Simulated world (seed ${int(values.seed, 42)}) as of ${new Date(world.asOf * 1000).toISOString()}`,
            `  wallets ${world.personas.size}, profiles ${b.profiles!.length}, launches ${b.launches!.length} (${b.launches!.filter((l) => l.graduatedAt).length} graduated)`,
            `  trades ${b.trades!.length}, scout drops ${b.scoutDrops!.length}, farms ${world.farms.map((f) => `${f.id}(${f.members.length})`).join(' ')}`,
            `  SPARK snapshot ${world.sparkSnapshotId}: ${b.snapshots![0]!.balances.length} holders`,
            `  aftermath: measured ${am.measured} drops, ${am.windowsWritten} windows from ${b.transfers!.length} token transfers`,
          ].join('\n'),
        );
        break;
      }

      case 'spark-snapshot': {
        if (!values.rpc || values['from-block'] === undefined) throw new Error('--rpc and --from-block are required');
        const client = createBaseClient(values.rpc);
        const toBlock =
          values['to-block'] === undefined || values['to-block'] === 'latest'
            ? await client.getBlockNumber()
            : BigInt(values['to-block']);
        const snap = await snapshotErc20({
          client,
          token: normalizeAddress(values.token ?? SPARK_BASE),
          chain: 'base',
          fromBlock: BigInt(values['from-block']),
          toBlock,
          chunkSize: BigInt(values.chunk ?? '10000'),
          onProgress: (p) => process.stderr.write(`\r  block ${p.block}/${p.toBlock}  holders ${p.holders}   `),
        });
        process.stderr.write('\n');
        await writeBatch(db, { snapshots: [snap] });
        console.log(`Snapshot ${snap.id}: ${snap.balances.length} holders at block ${snap.block}`);
        break;
      }

      case 'aftermath': {
        const run = await runAftermath(db, values['as-of'] ? { now: Number(values['as-of']) } : {});
        console.log(
          `Aftermath at ${run.now ? new Date(run.now * 1000).toISOString() : 'n/a'}: ${run.due} drops due, ` +
            `${run.measured} measured, ${run.unobserved} without an indexed drop transfer, ${run.windowsWritten} windows written`,
        );
        break;
      }

      case 'ingest-drops': {
        if (!values.rpc || !values.contract || values['from-block'] === undefined) {
          throw new Error('--rpc, --contract and --from-block are required');
        }
        const client = createRpcClient(values.rpc);
        const toBlock =
          values['to-block'] === undefined || values['to-block'] === 'latest' ? await client.getBlockNumber() : BigInt(values['to-block']);
        const r = await ingestScoutDrops(db, {
          client,
          contract: normalizeAddress(values.contract),
          startBlock: BigInt(values['from-block']),
          toBlock,
          chunkSize: BigInt(values.chunk ?? '2000'),
          now: Math.floor(Date.now() / 1000),
        });
        console.log(
          `Blocks ${r.fromBlock}..${r.toBlock}: ${r.drops} new drop(s), ${r.claims} claim(s) (${r.claimsRecorded} recorded), ${r.transfers} token transfer(s)`,
        );
        if (r.unknownTokens.length) console.log(`  ! drops for tokens not in launches: ${r.unknownTokens.join(', ')}`);
        const am = await runAftermath(db);
        console.log(`Aftermath: ${am.measured} measured, ${am.unobserved} unobserved, ${am.windowsWritten} windows written`);
        break;
      }

      case 'hubs': {
        for (const h of await hubFunders(db, int(values['min-fanout'], 20))) console.log(`${h.funder}  ${h.fanout}`);
        break;
      }

      case 'facts': {
        const wallet = normalizeAddress(rest[0] ?? '');
        const asOf = values['as-of'] ? Number(values['as-of']) : await latestActivity(db);
        const snapshot = await sparkSnapshotFor(db, asOf);
        const [facts] = await loadWalletFacts(db, { wallets: [wallet], asOf, sparkSnapshotId: snapshot });
        console.log(JSON.stringify(facts, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
        break;
      }

      case 'resolve': {
        const { set, launch, facts, template } = await resolveFromArgs(db, values.launch);
        console.log(`Launch ${set.launchId} (${launch.lane}/${launch.pairClass}), template ${template}, ${facts.length} profiles`);
        console.log(`Policy ${set.policyHash}`);
        console.log(`Merkle ${set.merkleRoot}`);
        console.log(`Allocated ${(Number((set.allocated * 10_000n) / set.slice) / 100).toFixed(2)}% to ${set.recipients.length} wallets`);
        for (const b of set.buckets) {
          console.log(`  bucket ${b.id.padEnd(18)} candidates ${String(b.candidates).padStart(4)}  recipients ${String(b.recipients).padStart(4)}`);
        }
        for (const w of set.warnings) console.log(`  ! ${w}`);
        console.log('\nTop 10:');
        for (const r of set.recipients.slice(0, 10)) {
          const why = r.reasons.slice(0, 3).map((x) => `${x.code} ${x.contrib >= 0 ? '+' : ''}${x.contrib.toFixed(3)}`);
          console.log(`  ${r.wallet}  ${(r.amount / E18).toString().padStart(8)}  score ${r.score.toFixed(3)}  ${why.join(', ')}`);
        }
        if (values.out) {
          writeFileSync(values.out, allocationToCsv(set));
          console.log(`\nWrote ${values.out}`);
        }
        if (values['drop-out']) {
          const [tokenRow] = await db.query<{ token: string }>('SELECT token FROM launches WHERE id = $1', [launch.launchId]);
          const token = values.token ?? tokenRow?.token;
          if (!token) throw new Error('--drop-out needs --token for an ad-hoc launch');
          const [t, root, policyHash, total, period, sink] = createDropArgs(set, { token: normalizeAddress(token), sink: BURN_SINK });
          const drop = {
            createDrop: { token: t, merkleRoot: root, policyHash, total: total.toString(), claimPeriodSec: Number(period), sink },
            claimMany: claimBatches(set).map((b) => ({ accounts: b.accounts, amounts: b.amounts.map(String), proofs: b.proofs })),
          };
          writeFileSync(values['drop-out'], JSON.stringify(drop, null, 2));
          console.log(`Wrote ${values['drop-out']} (${drop.claimMany.length} claim batch(es))`);
        }
        break;
      }

      case 'evaluate': {
        const asOf = values['as-of'] ? Number(values['as-of']) : await latestActivity(db);
        const labels = await loadSimLabels(db);
        if (!labels.size) throw new Error('No simulator labels found. Run `scout simulate` first.');
        const config = await configWithHubs(db, values['ignore-hubs']);
        const wallets = await listProfileWallets(db, asOf);
        const facts = await loadWalletFacts(db, { wallets, asOf, sparkSnapshotId: await sparkSnapshotFor(db, asOf) });
        const report = evaluate({
          facts,
          evidence: await loadEvidenceFacts(db, { asOf }),
          labels,
          launch: { launchId: 'eval', lane: 'utility', pairClass: 'stock', creator: normalizeAddress('0x000000000000000000000000000000000000dead'), asOf },
          template: templateArg(),
          slice: 1_000_000n * E18,
          config,
        });
        console.log(renderReport(report));
        break;
      }

      case 'showcase-drop': {
        const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
        if (!values.rpc || !key) throw new Error('--rpc and the DEPLOYER_PRIVATE_KEY environment variable are required');
        values.template ??= 'hold_or_die';
        values['ignore-hubs'] ??= '20';
        const launchId =
          values.launch ??
          (
            await db.query<{ id: string }>(
              `SELECT id FROM launches l WHERE graduated_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scout_drops d WHERE d.launch_id = l.id)
               ORDER BY graduated_at DESC, id LIMIT 1`,
            )
          )[0]?.id;
        if (!launchId) throw new Error('No graduated launch to drop for. Run `scout simulate` first, or pass --launch.');
        const { set, template } = await resolveFromArgs(db, launchId);
        if (!set.recipients.length) throw new Error(`Template ${template} selects nobody for ${launchId}`);

        // Claim batches carry many Merkle proofs; gas estimation for them can take a while on some nodes.
        const transport = http(values.rpc, { timeout: 120_000 });
        const pub = createPublicClient({ transport });
        const chainId = await pub.getChainId();
        const chain =
          chainId === robinhoodTestnet.id
            ? robinhoodTestnet
            : { ...robinhoodTestnet, id: chainId, name: `chain-${chainId}`, blockExplorers: undefined, rpcUrls: { default: { http: [values.rpc] } } };
        const account = privateKeyToAccount(key);
        const wallet = createWalletClient({ transport, chain, account });
        const balance = await pub.getBalance({ address: account.address });
        console.log(`${chain.name}: ${launchId}, template ${template}, ${set.recipients.length} recipients, from ${account.address} (${Number(balance) / 1e18} ETH)`);

        const result = await runShowcaseDrop({
          pub,
          wallet,
          set,
          template,
          scoutDrop: values.scoutdrop ? normalizeAddress(values.scoutdrop) : undefined,
          token: values.token ? normalizeAddress(values.token) : undefined,
          log: (line) => console.log(`  ${line}`),
        });
        const out = values.out ?? fileURLToPath(new URL('../../web/lib/onchain-drop.json', import.meta.url));
        writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
        console.log(`Wrote ${out}`);
        if (result.explorer) console.log(`ScoutDrop: ${result.explorer}/address/${result.scoutDrop}`);
        console.log(`Index it with: pnpm scout ingest-drops --rpc ${values.rpc} --contract ${result.scoutDrop} --from-block ${result.fromBlock}`);
        break;
      }

      case 'token-status': {
        if (!values.rpc || !values.token) throw new Error('--rpc and --token are required');
        const pub = createPublicClient({ transport: http(values.rpc, { timeout: 60_000 }) });
        const token = normalizeAddress(values.token);
        const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
        const holder = values.holder ? normalizeAddress(values.holder) : key ? (privateKeyToAccount(key).address.toLowerCase() as Address) : undefined;
        if (!holder) throw new Error('--holder or DEPLOYER_PRIVATE_KEY is required');
        const read = <T,>(functionName: 'name' | 'symbol' | 'totalSupply', args: [] = []) =>
          pub.readContract({ address: token, abi: erc20Abi, functionName, args }) as Promise<T>;
        const [name, symbol, supply, balance] = await Promise.all([
          read<string>('name'),
          read<string>('symbol'),
          read<bigint>('totalSupply'),
          pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] }),
        ]);
        const open = await transfersOpen(pub, token, holder, '0x000000000000000000000000000000000000beef');
        console.log(`${name} ($${symbol}) ${token}`);
        console.log(`  supply ${Number(supply / E18).toLocaleString('en-US')}, ${holder} holds ${Number(balance / E18).toLocaleString('en-US')}`);
        console.log(`  transfers ${open ? 'OPEN' : 'LOCKED'}`);
        if (!open) process.exitCode = 2;
        break;
      }

      default:
        console.log(USAGE);
        process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
