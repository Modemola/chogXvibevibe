# Data: vibe/vibe, aftermath and SPARK

## Live vibe/vibe data

Scout reads vibe/vibe straight from Robinhood Chain testnet. The contracts are not published, so the events were
decoded from known transactions (the $SCOUT launch, real buys and sells, a graduation). The decoders are tested
against those recorded receipts and cross checked with the token transfers in each one
(`packages/sources/src/vibevibe.ts`, `packages/sources/test/vibevibe.test.ts`).

| Event | Contract | Gives Scout |
|---|---|---|
| Launch | factory `0xe794…fea0` | launch number, creator, token, bonding pool, name, symbol, pair (ETH, a tokenised stock, or VIBEVIBE), tax, the 4 ETH target |
| Launch buy, buy, sell | each bonding pool | the buyer or seller (not the router), tokens, pair token amount |
| Graduation | each bonding pool | the graduation time. Liquidity then moves to Uniswap v4 |

```bash
pnpm scout ingest-vibevibe --rpc https://rpc.testnet.chain.robinhood.com   # from just before $SCOUT to now
```

The first run indexed 331 launches, 4,769 trades and 94 graduations in under a minute. The website keeps itself
current: a page visit triggers at most one bounded sync a minute (`/api/live/sync`; `SCOUT_LIVE=0` turns it off).
Real launches are stored as `vv-<number>` next to the simulated world and appear under **Live** on the launches page.

Each live launch gets **Scout's read**: how many wallets bought before graduation, how many sold 80% or more within
an hour of their first buy, how many trade in lockstep with other wallets, and how many signed up. These are counts
only. Wallets that never opted in are never listed. Real wallets that sign up are scored on their real trades.

Limits: vibe/vibe has no lanes, so live launches are treated as `meme` with no lane bonus. Plain ETH transfers leave
no event, so the shared funder signal is not available for live wallets yet (copied buys are). Trades after graduation
happen on Uniswap v4 and are not indexed yet.

## Aftermath

After a drop, `scout aftermath` measures what every recipient did, from token `Transfer`s alone, at 1 hour, 24 hours,
7 days and 30 days. Those numbers become the hold and dump history in every later score.

- **Sold by window W** is the balance right after the drop minus the lowest balance up to `receivedAt + W`, capped at
  the amount received. Buying back later doesn't undo a sale, and selling tokens held before the drop counts, because
  tokens are fungible.
- **The holder is the recipient plus its declared linked wallets.** Moving tokens between them isn't selling.
- **Moving tokens into a listed hold contract isn't selling**: lockers and staking vaults, kept in the
  `hold_contracts` table and reviewed by the operator. Any other outflow is.
- **Windows close at the indexer's head** (the newest indexed transfer), not the wall clock, so indexer lag can't
  make a dumper look like a holder.
- A drop whose receiving transfer isn't indexed is reported as unobserved and left unmeasured, never guessed.
- The job is idempotent and only touches drops with a window due. Run it every few minutes.

The simulator emits real drop and sell transfers. The end to end test checks that the job recovers the sold share the
simulator intended, window by window, for thousands of windows.

## SPARK snapshot

```bash
pnpm scout spark-snapshot --rpc https://mainnet.base.org --from-block <SPARK deploy block> --to-block latest
```

This replays every SPARK `Transfer` log into balances, shrinking the block range on its own when the RPC refuses a
query. The SPARK address (`0x0fb07c88bc6d195c196279523957c004eb868248`) comes from the project notes, so check it
before relying on a snapshot.
