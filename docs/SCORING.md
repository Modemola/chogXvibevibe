# Scoring and policies

## The score

For a wallet `w` and a launch `L`:

```
S(w, L) = αH + βQ + γA − δD − εY
```

| Term | Question | Range | Built from |
|---|---|---|---|
| **H** hold quality | Did they keep past airdrops and graduated positions? | 0 to 1 | What share of each Scout drop they still held at its latest measured window, how long they held graduated positions, weighted toward recent drops and pulled toward a prior when history is thin |
| **Q** market quality | Do they trade launches with substance, and does this launch fit them? | 0 to 1 | Lane mix (utility, RWA and vibe-coded above art, art above meme, a bonus for stock pairs) and how well their history matches this launch's lane and pair |
| **A** alignment | Are they part of the ecosystem? | −1 to 1 | SPARK tier, a charged Viber and its level, guild standing, shipped products, Chog Genesis held (and held for 30 days or more). A flagged rug subtracts |
| **D** dump score | Do they sell airdrops fast? | 0 to 1 | Per drop, selling within the first hour weighs most, then 24 hours, then 7 days. Recent drops weigh more, and a clean history counts in their favour, so one slip fades and repeated dumping does not |
| **Y** sybil | Are they one of many wallets run by one person? | 0 to 1 | The size of an undeclared cluster: wallets funded by the same address within 30 minutes, funded by another profile, or making the same early buys in the same order (3 or more), using every indexed wallet as evidence |

The weights α to ε belong to each recipe. Every constant in the model lives in
[`packages/core/src/config.ts`](../packages/core/src/config.ts) and is versioned. Each allocation records the
scoring version, the config hash and the policy hash, so anyone can derive it again.

Every score comes with reason codes whose contributions add up to the score:

```
holder   0.456  HOLD_SCOUT_DROPS +0.178  SPARK_200K +0.140  HOLD_PRIOR +0.078  MARKET_PRIOR +0.060
dumper  -0.218  DUMP_HISTORY -0.331  DUMPED_1H_LAST_DROP -0.218  SPARK_1M +0.200
```

## Policies

A policy is JSON. Filters are short expressions over published wallet fields:

```json
{
  "version": 1,
  "template": "hold_or_die",
  "buckets": [
    { "id": "holders", "weightBps": 5000, "filter": "scout_drops_received >= 1 AND dump_score < 0.25 AND hold_quality >= 0.5" },
    { "id": "spark",   "weightBps": 3000, "filter": "spark_tier >= 1 AND dump_score < 0.5" },
    { "id": "friends", "weightBps": 2000, "allowlist": ["0x…"] }
  ],
  "caps": { "perWalletBps": 50, "perClusterBps": 80 },
  "excludes": ["sybil_score >= 0.8", "last_drop_sold_1h >= 0.8"],
  "fallbackBucket": "holders"
}
```

**Fields:** `score hold_quality market_quality alignment dump_score sybil_score spark_tier spark_balance viber_level
viber_charged guild_member guild_ids scout_drops_received last_drop_sold_1h markets_traded stock_pair_markets
stock_pair_share graduated_positions held_substance_days_max created_launches shipped_substance created_rug
cluster_size in_creator_cluster chog_holder chog_count chog_held_days chog_balance`

**Operators:** `== != > >= < <=`, `HAS` for lists (`guild_ids HAS 'alpha'`), `AND OR NOT` and parentheses. A bare
boolean field means `== true`.

**Recipes:** SPARK Core, Hold or Die, Builder Lane, Stock Pair Natives, Chog Holders and Custom.

## How a policy resolves

- The creator and every wallet clustered with them are always excluded, even when allowlisted (with a warning).
- Buckets fill in order. Each bucket splits its share by score (or equally, for allowlists) by proportional water
  filling.
- Caps apply per wallet and per cluster, across all buckets. Linked wallets share one cluster cap.
- What a bucket can't place moves to the next bucket, then to `fallbackBucket`, and what is left is reported as
  unallocated. Unallocated supply goes back to the launch, never to the creator.
- Allowlisted wallets that have not opted in receive only from their own allowlist bucket.
- Amounts are exact integers, and allocated plus unallocated always equals the slice.
- The result is the same for a given `asOf` whatever order the wallets arrive in.
- The Merkle tree is OpenZeppelin's `StandardMerkleTree` over `(address, uint256)`, verifiable on chain with
  `MerkleProof`.
