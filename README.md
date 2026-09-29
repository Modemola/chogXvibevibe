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
packages/core      Pure engine: scoring, sybil clustering, policy language, resolver, Merkle  ← milestone 1
packages/db        Postgres schema + migrations                                               (milestone 2)
packages/sources   Data sources: SPARK on Base, simulated vibe/vibe, real vibe/vibe testnet  (milestone 2)
apps/indexer       Worker that fills the database from sources                              (milestone 2)
apps/web           Next.js: profiles, policy builder, previews, Aftermath pages             (milestone 3)
contracts          ScoutSender / claim contract                                             (milestone 5)
```

## Development

```bash
pnpm install
pnpm test        # all packages
pnpm typecheck
pnpm build
```

Node 22+, pnpm 10.

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
stock_pair_markets graduated_positions held_substance_days_max created_launches shipped_substance created_rug
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

- [x] **Milestone 1: core engine** (`@scout/core`), 51 tests
- [ ] Milestone 2: data layer (Postgres, SPARK snapshot, simulated vibe/vibe source)
- [ ] Milestone 3: API + web app (opt-in, profiles, policy builder, preview, export)
- [ ] Milestone 4: Aftermath jobs + pages
- [ ] Milestone 5: ScoutSender contract + real vibe/vibe testnet source
