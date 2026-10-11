# Graduation Scout

**Live demo:** https://graduation-scout.vercel.app (guided tour: https://graduation-scout.vercel.app/?tour=1)

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
apps/web           Next.js app + JSON API: opt-in, profiles, policy builder, export, policy locks
packages/contracts ScoutDrop: Merkle airdrop contract (Solidity), ABI, claim-batch helpers, test chain
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
pnpm scout simulate                                    # simulated world: 450 wallets, 80 launches, 4 sybil farms, drops measured by aftermath
pnpm scout aftermath                                   # measure drops whose windows have ended (run on a schedule)
pnpm scout hubs                                        # funders that funded many wallets (exchange hot wallets)
pnpm scout evaluate --ignore-hubs 20                   # score every profile against the simulator's ground truth
pnpm scout resolve --launch sim-0010 --template hold_or_die --ignore-hubs 20 --out alloc.csv
pnpm scout facts 0x…                                   # what Scout knows about one wallet
pnpm scout resolve --launch sim-0010 --template hold_or_die --drop-out drop.json   # ScoutDrop args + claim batches with proofs
```

### Web app

```bash
pnpm scout simulate      # once, if the database is empty
pnpm web                 # builds the packages, then http://localhost:3000
```

| Page | What it does |
|---|---|
| `/` | Live counts and how Scout works |
| `/join` | Connect a browser wallet, sign to opt in. Link an alt: the alt signs, you switch accounts, the primary signs the same message |
| `/profile/<wallet>` | Score, every reason with its contribution, H/Q/A/D/Y components, which templates the wallet matches, Scout drop history, detected wallet links. Rescore for any template, lane and pair |
| `/builder` | Pick a template and launch, edit buckets, filters, caps and excludes, and see the resolved allocation update live. Download the CSV or policy JSON, save the policy (content hash), or lock it to a launch with the creator's signature |
| `/launches` | Indexed launches, their creators, locked policies and Scout drops |
| `/launches/<id>` | The public Aftermath card: share still held and held / trimmed / mostly sold / dumped counts after 1h, 24h, 7d and 30d, and every recipient's numbers |

Signing is plain `personal_sign` on messages with a server nonce, valid for 10 minutes and usable once. No transactions and
no network switching. Smart-contract wallets (ERC-1271) aren't supported yet.

**API** (JSON; token amounts are decimal strings in raw units):

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/stats`, `/api/launches`, `/api/templates` | |
| GET | `/api/profiles/:wallet` | `?template=&lane=&pair=` |
| POST | `/api/auth/nonce` | → `{ nonce, issuedAt }` to build a message with `buildMessage` from `@scout/core` |
| POST | `/api/profiles` | `{ message, signature }` opt in |
| POST | `/api/links` | `{ message, signature, primarySignature }` |
| POST | `/api/preview` | `{ policy, launch: { launchId } \| { lane, pairClass, creator }, slice, topN? }` |
| POST | `/api/export` | same as preview → CSV |
| POST | `/api/policies` · GET `/api/policies/:hash` | `{ policy }` → `{ hash }` |
| POST | `/api/locks` | `{ message, signature }` from the launch creator |
| GET | `/api/launches/:id/aftermath` | per-window summary and per-recipient sold % |

| Env var | Default | |
|---|---|---|
| `DATABASE_URL` | unset | Postgres; PGlite when unset |
| `SCOUT_PGLITE_DIR` | `<repo>/.data/pglite` | Shared by the CLI and the web app |
| `SCOUT_IGNORE_HUBS_MIN_FANOUT` | `20` | Funders of this many wallets are ignored for sybil links; `0` disables |
| `SCOUT_SIMULATE` | unset | `1` seeds the simulated world into an empty database (demos only) |

Browser tests: `pnpm e2e` builds the app and drives it in Chromium with an injected test wallet. They cover opt-in, linking,
profiles, the builder's validation and CSV export, and the phone layout.
Set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright's own browser isn't installed.

### Design

The web app is "silver noir": cool near-black, platinum type and one liquid-chrome accent. It uses hairline structure instead of glow, and keeps colour for data only: mint for holding, rose for dumping.

- **Hero:** a real-time liquid mercury orb (React Three Fiber). A custom shader reflects a procedural photo studio (softbox, strip lights, horizon, a travelling highlight) that turns with the pointer. Behind it sit a masked hairline grid and silver dust that parts around the cursor. Under the headline, a decode line reads real wallets from the database and resolves each into its Scout verdict.
- **The Sieve:** a scroll-pinned canvas that tells the product in four moves. Wallet dots arrive, farms cluster in rose and fall away, survivors become the leaves of a Merkle tree that draws up to its root, then they drop into aftermath columns coloured by who held.
- **Structure and type:** editorial serif display with chrome-italic accents, mono uppercase labels, hairline bento grids and stats bands, and chrome pill buttons with a travelling highlight.
- **Motion throughout:** word reveals, count-ups, self-drawing charts, page transitions, a ⌘K palette and a floating nav.
- **Graceful fallbacks:** a CSS chrome orb without WebGL or with reduced motion, phone layouts with a thumb bar, and self-hosted fonts.

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
builder             22       0.501                12.0%
diamond             76       0.474                40.9%
stock_native        37       0.393                17.7%
whale               10       0.340                 6.2%
newbie              68       0.250                12.7%
trencher            73       0.221                 8.0%
dumper              38      -0.137                 2.5%
rugger              12      -0.226                 0.0%
farm                37      -0.890                 0.0%

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

### At every graduation

The table above is measured at the end of the season. Drops are resolved at each launch's graduation, when fewer
people have signed up and farms have less history, so every template is also resolved at all 43 simulated graduations:

| Template | Launches where a farm wallet is paid | Share of all tokens to farms |
|---|---|---|
| Hold or Die | 11 of 43 | 0.46% |
| Custom | 11 of 43 | 0.44% |
| Builder Lane | 11 of 43 | 0.77% |
| Stock Pair Natives | 11 of 43 | 0.94% |
| SPARK Core | 14 of 43 | 1.75% |

No honest wallet carries a sybil penalty at any of the 43 graduations. The farm wallets that still get paid have made
fewer than three buys and share no funder with each other: there is nothing yet to link them by, so they look like any
newcomer. Sybil links use every indexed wallet's public funding and early buys as evidence, not only signed-up
profiles, so a farm is caught even when only one of its wallets has signed up; wallets that never opted in are never
scored or paid. `apps/indexer/test/templates.test.ts` checks each template at early, middle and late graduations
against hand-written versions of its rules.

## Aftermath

After a drop, `scout aftermath` measures what every recipient did, from token `Transfer`s alone, at 1h, 24h, 7d and 30d.
Those numbers become the H (hold) and D (dump) history in every later score.

- **Sold by window W** = balance right after the drop − lowest balance up to `receivedAt + W`, capped at the amount received.
  Buying back later doesn't undo a sale, and selling tokens held before the drop counts (they're fungible).
- **The holder is the recipient plus its declared linked wallets.** Moving tokens between them isn't selling.
- **Moving tokens into a listed hold contract isn't selling** (lockers, staking vaults; table `hold_contracts`, reviewed by the operator).
  Any other outflow is.
- **Windows close at the indexer's head** (the newest indexed transfer), not the wall clock, so indexer lag can't make a dumper look like a holder.
- A drop whose receiving transfer isn't indexed is reported as unobserved and left unmeasured, never guessed.
- The job is idempotent and only touches drops with a window due. Run it every few minutes.

The simulator emits real drop and sell transfers. The end-to-end test checks that the job recovers the sold percentage
the simulator intended, window by window, for every recipient without linked wallets (thousands of windows).

## On-chain: ScoutDrop

[`packages/contracts/contracts/ScoutDrop.sol`](packages/contracts/contracts/ScoutDrop.sol) holds a launch's graduation
airdrop and pays it out against the Merkle root Scout produced.

- **`createDrop(token, merkleRoot, policyHash, total, claimPeriod, sink)`**: the creator deposits exactly the allocated
  total. Fee-on-transfer deposits revert, because an underfunded drop can't pay everyone.
  `policyHash` commits to the Scout policy, so anyone can re-resolve and check the list.
- **`claim` / `claimMany`**: anyone can submit claims, and tokens always go to the recipient. A keeper can push the
  whole list at graduation (about 70k gas per claim, batches of 100).
- **`sweep`**: no cancel. After the claim period (1–365 days), unclaimed tokens go to the `sink` fixed at creation
  (a burn address by default), and anyone can trigger it.
- Each drop pays out at most its own deposit, so drops sharing a token can't touch each other's funds.
- Leaves are OpenZeppelin `StandardMerkleTree` `(address, uint256)`, exactly what `@scout/core` builds.

It compiles with solc-js (0.8.28, Shanghai target, runs on Arbitrum Orbit chains such as Robinhood Chain) and is tested
on an in-process EVM (Ganache), so nothing needs downloading. **Not audited.** Get an audit before real value goes through it.

```bash
pnpm --filter @scout/contracts build                                                # compile + types
DEPLOYER_PRIVATE_KEY=0x… node packages/contracts/scripts/deploy.mjs --rpc <url>    # deploy
pnpm scout ingest-drops --rpc <url> --contract <address> --from-block <deploy block>  # index, then aftermath
```

`ingest-drops` reads `DropCreated`, `Claimed` and `Swept`, links each drop to a launch by token, follows that token's
transfers from a per-token cursor, and records every claim as a Scout drop at the amount actually received.
Then it runs aftermath. `apps/indexer/test/onchain.test.ts` runs the whole loop on a local chain:
resolve → fund → keeper claims → recipients dump, trim, stake or hold → ingest → aftermath measures each one correctly.

The builder's **Download claims + proofs** button (and `POST /api/export?format=claims`) gives the same data for the web flow.

### Showcase drop on Robinhood Chain testnet

`showcase-drop` runs a resolved drop for real: it deploys ScoutDrop and a demo ERC-20 standing in for the launch token
(or reuses `--scoutdrop` / `--token`), funds the drop with the allocated total, and pushes every claim in batches of 50.
It writes every address and transaction to `apps/web/lib/onchain-drop.json`; once that is committed, the home page
shows an on-chain proof panel and the launch page a badge, each linking to the explorer.

```bash
pnpm scout simulate                       # the same simulated world the website uses
DEPLOYER_PRIVATE_KEY=0x… pnpm scout showcase-drop --rpc https://rpc.testnet.chain.robinhood.com
```

Robinhood Chain testnet is chain 46630 (explorer: https://explorer.testnet.chain.robinhood.com). The command defaults to
the Hold or Die template and the most recently graduated launch without a Scout drop. Use a throwaway key with testnet
ETH only; a run with ~180 recipients needs roughly 16M gas in total.

### $SCOUT, our own token

Graduation Scout has its own token, launched on vibe/vibe testnet like any creator's:
**$SCOUT** (Graduation Scout) at `0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de`, launch #8422, 1,000,000,000 supply.
The drop wallet bought 10,000,000 SCOUT at launch to fund its Scout drop; vibe/vibe locks transfers until a token
graduates, so the drop had to wait.

**$SCOUT graduated on 2026-10-09 at 18:52 UTC** (block 131787178). Scout resolved Hold or Die for launch `vv-8422`
as of that moment, and ScoutDrop paid **8,930,000 SCOUT to 183 wallets** in drop #2 on the same contract as drop #1
(createDrop `0xf13bd23a93964ec9ab7aded3773a573adfbe3c89ef6ef71ed82d45554018699c`). Every recipient was checked
on-chain afterwards: all 183 claimed, each balance at least its allocation, and an independent re-resolution gives
the same Merkle root and policy hash as the ones sealed on-chain. The recipients are Scout's simulated profiles
(real wallets have not signed up yet), so the tokens went to the addresses of the simulated world.

```bash
pnpm scout token-status --rpc https://rpc.testnet.chain.robinhood.com --token 0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de
DEPLOYER_PRIVATE_KEY=0x… pnpm scout showcase-drop --rpc https://rpc.testnet.chain.robinhood.com --launch vv-8422 \
  --scoutdrop 0xb78c43e7df50a30d93f33b24de3554c9c286aa13 --token 0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de \
  --slice 10000000 --out "$PWD/apps/web/lib/scout-drop.json"
```

The drop record is `apps/web/lib/scout-drop.json`; the home page's $SCOUT panel and the live launch page show it.

## Live: real vibe/vibe data

Scout reads vibe/vibe straight from Robinhood Chain testnet. The contracts are not published, so the events were
decoded from known transactions (the $SCOUT launch, real buys and sells, a graduation) and the decoders are tested
against those recorded receipts, cross-checked with the token transfers in each one
(`packages/sources/src/vibevibe.ts`, `packages/sources/test/vibevibe.test.ts`).

| Event | Contract | Gives Scout |
|---|---|---|
| Launch | factory `0xe794…fea0` | launch number, creator, token, bonding pool, name, symbol, pair (ETH, a tokenised stock, or VIBEVIBE), tax, 4 ETH target |
| Launch buy, buy, sell | each bonding pool | buyer or seller (not the router), tokens, pair-token amount |
| Graduation | each bonding pool | graduation time; liquidity then moves to Uniswap v4 |

```bash
pnpm scout ingest-vibevibe --rpc https://rpc.testnet.chain.robinhood.com   # from just before $SCOUT to now
```

The first run indexed 331 launches, 4,769 trades and 94 graduations in under a minute. The website keeps itself
current: a page visit triggers at most one bounded sync a minute (`/api/live/sync`; `SCOUT_LIVE=0` turns it off).
Real launches are stored as `vv-<number>` next to the simulated world and appear under **Live** on the launches
page. Each one gets **Scout's read**: how many wallets bought before graduation, how many sold 80% or more within an
hour of their first buy, how many trade in lockstep with other wallets, and how many signed up. These are counts
only: wallets that never opted in are never listed. Real wallets that sign up are scored on their real trades.

Limits: vibe/vibe has no lanes, so live launches are treated as `meme` (no lane bonus); plain ETH transfers leave no
event, so the shared-funder signal is not available for live wallets yet (copied buys are); trades after graduation
happen on Uniswap v4 and are not indexed yet.

## Chog: vibe/vibe × Chog (Chogathon)

Chog Genesis NFTs and $CHOG live on Monad mainnet; vibe/vibe trading lives on Robinhood Chain testnet. A wallet
has the same address on both, so Scout reads Monad for the wallet a user signs up with. Nothing is bridged and
nothing is signed on Monad.

- **Chog passport.** On sign-up and on profile views (at most every 10 minutes per wallet), Scout reads
  `balanceOf` on Chog Genesis ([`0xc96d…3763`](https://monadscan.com/address/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763))
  and $CHOG ([`0x3500…7777`](https://monadscan.com/address/0x350035555e10d9afaf1566aaebfced5ba6c27777)) through
  Multicall3 and stores it in `chog_status`. If Monad is slow or down, pages carry on with the last reading.
- **Score.** Holding a Chog adds `CHOG_HOLDER` (+0.10 alignment); holding one for 30+ days adds `CHOG_LONG_HOLD` (+0.05).
- **Filters.** `chog_holder`, `chog_count`, `chog_held_days`, `chog_balance` (whole $CHOG).
- **Chog Holders recipe.** 60% to Chog holders who don't dump, 25% more to 30+ day holders, 15% to proven drop
  holders; farms and last-drop dumpers excluded.
- **Page.** `/chog` lists signed-up holders and links the recipe into the builder.
- **CLI.** `pnpm scout sync-chog [wallet ...]` refreshes holdings for given wallets or every signed-up wallet.

"Held since" is when Scout first saw the wallet holding a Chog (the public Monad RPC limits log queries to 100
blocks, so transfer history isn't replayed). Set `SCOUT_CHOG=0` to turn lookups off, or `SCOUT_CHOG_RPC` to use
another Monad RPC. Adding Chog changed no existing recipe: all five resolve to identical allocations and Merkle roots.

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
| **Y** sybil | Are they one of many wallets run by the same person? | 0..1 | Undeclared cluster size (same funder within 30 min, funded by another profile, identical early-buy sequences of 3+ buys), with every indexed wallet as evidence |

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

A full pre-launch verification pass, with every bug it found and the known limits, is in
[docs/verification.md](docs/verification.md).

- [x] **Milestone 1: core engine** (`@scout/core`)
- [x] **Milestone 2: data layer**: Postgres schema, SPARK snapshotter, simulated world, `scout` CLI, evaluation
- [x] **Milestone 3: API + web app**: signed opt-in and linking, profiles, policy builder with live preview, export, policy locks
- [x] **Milestone 4: Aftermath**: transfer-based measurement job, per-launch Aftermath cards, API
- [x] **Milestone 5a: ScoutDrop contract**, chain ingest, drop files, deploy script
- [x] **Milestone 5b: live on Robinhood Chain testnet**: ScoutDrop at
  [`0xb78c…aa13`](https://explorer.testnet.chain.robinhood.com/address/0xb78c43e7df50a30d93f33b24de3554c9c286aa13)
  paid a Hold or Die drop for `sim-0012` to 184 recipients (drop #1, every claim pushed, nothing left unclaimed)
- [ ] Milestone 6: index real vibe/vibe launches (needs vibe/vibe's contracts once published)

## Deploying to Vercel

1. Import the repo and set **Root Directory** to `apps/web` (Project → Settings → Build and Deployment). Leave
   "Include files outside the root directory" on; `apps/web/vercel.json` builds the workspace packages first.
2. Without `DATABASE_URL`, each server instance runs an in-memory database holding the simulated world. The build
   stores that world as a snapshot (`apps/web/scripts/snapshot.mjs`), so a cold instance is ready in about a second.
   The demo works, but opt-ins and links don't persist.
3. For persistence, add a Postgres `DATABASE_URL` (Neon, Render, Supabase or any other Postgres; append
   `?sslmode=require` if the host needs SSL), then seed it once from your machine:
   `DATABASE_URL=… pnpm scout migrate && DATABASE_URL=… pnpm scout simulate`.
