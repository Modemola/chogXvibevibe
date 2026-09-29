# Graduation Scout

Explainable airdrop allocation for [vibe/vibe](https://vibevibe.fun) graduations on Robinhood Chain.

When a vibe/vibe token graduates, its creator can airdrop a slice of supply to "the right people".
Scout decides who those people are, shows why, and then watches what they do with it:

1. **Profiles**: wallets opt in. Linked alts count as one person.
2. **Policies**: the creator picks a template or writes rules (buckets, filters, caps, excludes).
3. **Resolution**: policy × profiles → an Allocation Set with amounts, reasons and a Merkle root.
4. **Aftermath**: 1h / 24h / 7d / 30d after the drop, who held and who dumped. That feeds the next score.

Independent builder project; not affiliated with vibe/vibe or Spark Labs.

## Repo layout

```
packages/core      Pure engine: scoring, sybil clustering, policy language, resolver, Merkle
packages/db        Postgres schema, migrations, idempotent writers, WalletFacts loader
packages/sources   Data sources: ERC-20 holder snapshots (SPARK on Base), simulated vibe/vibe world
apps/indexer       `scout` CLI: migrate, simulate, snapshot, resolve, evaluate
apps/web           Next.js: profiles, policy builder, previews, Aftermath pages             (milestone 3)
contracts          ScoutSender / claim contract                                             (milestone 5)
```

Data flows one way. A source emits normalized records (`packages/db/src/records.ts`),
the writer stores them, the loader turns them into `WalletFacts` as of a point in time, and the core engine scores those.
Swapping the simulated world for the real vibe/vibe testnet means writing one more source; nothing downstream changes.

## Development

```bash
pnpm install
pnpm test        # all packages (core, db on in-process Postgres, sources, end-to-end)
pnpm typecheck
pnpm build
```

Node 22+, pnpm 10. The database is Postgres. Set `DATABASE_URL` to use a server; without it the CLI and
tests use [PGlite](https://pglite.dev) (Postgres compiled to WASM, in-process), so nothing needs installing.
Both produce identical results.

### Try it

```bash
pnpm scout simulate                                    # simulated world: 450 wallets, 80 launches, 4 sybil farms
pnpm scout hubs                                        # funders that funded many wallets (exchange hot wallets)
pnpm scout evaluate --ignore-hubs 20                   # score every profile against the simulator's ground truth
pnpm scout resolve --launch sim-0010 --template hold_or_die --ignore-hubs 20 --out alloc.csv
pnpm scout facts 0x…                                   # what Scout knows about one wallet
```

### SPARK snapshot (real data)

```bash
pnpm scout spark-snapshot --rpc https://mainnet.base.org --from-block <SPARK deploy block> --to-block latest
```

This replays every SPARK `Transfer` log into balances, shrinking the block range automatically when the RPC refuses a
query. The SPARK address (`0x0fb07c88bc6d195c196279523957c004eb868248`) comes from the project notes, so verify it
before relying on a snapshot. The RPC host has to be reachable from wherever you run it.

## Evaluation on the simulated world

`pnpm scout evaluate --ignore-hubs 20`, `custom` template, seed 42, 373 opted-in profiles:

```
persona        wallets  mean score  share of allocation
builder             22       0.477                12.1%
diamond             76       0.461                41.2%
stock_native        37       0.393                18.9%
whale               10       0.370                 6.2%
newbie              68       0.246                11.5%
trencher            73       0.231                 6.9%
dumper              38      -0.037                 3.1%
rugger              12      -0.076                 0.0%
farm                37      -0.813                 0.0%

farm               members  flagged
naive-0                  6        6      same funder, identical buys
split_funding-1         11       11      different funders, identical buys
staggered-2              9        0      different funders, buys hours apart: not detected
naive-3                 11       11

False positives: 0 of 336 non-farm wallets (8 before ignoring the 3 exchange hot wallets)
```

The staggered farm evades clustering but still gets nothing, because it dumps every drop.
The simulator is not calibrated to real vibe/vibe data; it's a world containing the behaviours Scout has to tell apart.
The end-to-end test (`apps/indexer/test/pipeline.test.ts`) locks these properties in.

## Scoring model

For wallet `w` and launch `L`:

```
S(w, L) = αH + βQ + γA − δD − εY
```

| Term | Meaning | Range | Built from |
|---|---|---|---|
| **H** hold quality | Did they keep past airdrops and graduated positions? | 0..1 | Retention at the latest elapsed window of each Scout drop, graduated-position hold time, recency-decayed, shrunk toward a prior for thin history |
| **Q** market quality | Do they trade substance, and does it fit this launch? | 0..1 | Lane mix (utility/RWA/vibecoded > art > meme, stock-pair bonus) + affinity with `L`'s lane and pair class |
| **A** alignment | Are they part of the ecosystem? | −1..1 | SPARK tier, charged Viber + level, guild standing, shipped products; a flagged rug subtracts |
| **D** dump score | Do they sell airdrops fast? | 0..1 | Per drop: 1h sell dominates, then 24h, then 7d. Recency-decayed with a clean-history pseudo-count, so one sin fades and repeated dumping doesn't |
| **Y** sybil | Are they one of many wallets run by the same person? | 0..1 | Undeclared cluster size (same funder within 30 min, funded by another profile, identical early-buy sequences) |

Every number in the model is in [`packages/core/src/config.ts`](packages/core/src/config.ts) and versioned.
Each allocation records the scoring version, config hash and policy hash, so anyone can re-derive it.

Every score comes with reason codes whose contributions add up to the score, e.g.

```
holder   0.456  HOLD_SCOUT_DROPS +0.178  SPARK_200K +0.140  HOLD_PRIOR +0.078  MARKET_PRIOR +0.060
dumper  -0.218  DUMP_HISTORY -0.331  DUMPED_1H_LAST_DROP -0.218  SPARK_1M +0.200  …
```

## Policies

A policy is JSON. Filters are short strings over published wallet fields:

```json
{
  "version": 1,
  "template": "hold_or_die",
  "buckets": [
    { "id": "holders",  "weightBps": 5000, "filter": "scout_drops_received >= 1 AND dump_score < 0.25 AND hold_quality >= 0.5" },
    { "id": "spark",    "weightBps": 3000, "filter": "spark_tier >= 1 AND dump_score < 0.5" },
    { "id": "friends",  "weightBps": 2000, "allowlist": ["0x…"] }
  ],
  "caps": { "perWalletBps": 50, "perClusterBps": 80 },
  "excludes": ["sybil_score >= 0.8", "last_drop_sold_1h >= 0.8"],
  "fallbackBucket": "holders"
}
```

**Filter fields:** `score hold_quality market_quality alignment dump_score sybil_score spark_tier spark_balance
viber_level viber_charged guild_member guild_ids scout_drops_received last_drop_sold_1h markets_traded
stock_pair_markets stock_pair_share graduated_positions held_substance_days_max created_launches shipped_substance created_rug
cluster_size in_creator_cluster`

**Operators:** `== != > >= < <=`, `HAS` for lists (`guild_ids HAS 'alpha'`), `AND OR NOT`, parentheses.
A bare boolean field means `== true`.

**Templates:** SPARK Core, Hold or Die, Builder Lane, Stock Pair Natives, Custom.

### Resolution rules

- The creator and every wallet clustered with them are always excluded, even if allowlisted (with a warning).
- Buckets fill in order. A bucket splits its share by score (or equally for allowlists) with proportional water-filling.
- Caps are per wallet and per cluster, across all buckets. Linked wallets share one cluster cap.
- What a bucket can't place spills into the next bucket, then into `fallbackBucket`, then is reported as `unallocated`.
  Unallocated supply goes back to the launch, never to the creator.
- Allowlisted wallets that haven't opted in receive only from their allowlist bucket.
- Amounts are exact integers; allocated + unallocated always equals the slice.
- Output is deterministic for a given `asOf`, regardless of input order.
- The Merkle tree is OpenZeppelin `StandardMerkleTree` over `(address, uint256)`, verifiable on-chain with `MerkleProof`.

## Status

- [x] **Milestone 1: core engine** (`@scout/core`)
- [x] **Milestone 2: data layer**: Postgres schema, SPARK snapshotter, simulated world, `scout` CLI, evaluation
- [ ] Milestone 3: API + web app (opt-in, profiles, policy builder, preview, export)
- [ ] Milestone 4: Aftermath jobs + pages
- [ ] Milestone 5: ScoutSender contract + real vibe/vibe testnet source
