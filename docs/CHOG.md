# Chog: vibe/vibe × Chog

Chog Genesis NFTs and $CHOG live on Monad mainnet. vibe/vibe trading lives on Robinhood Chain testnet. A wallet has
the same address on both, so Scout reads Monad for the wallet a member signs up with. Nothing is bridged and nothing
is signed on Monad.

## The passport

Every profile carries a Chog Passport: the wallet's own Chog Genesis NFTs, with their real art and numbers, read from
Monad. The first Chog becomes the wallet's avatar on its profile and in the holder list on `/chog`.

Chog Genesis is not enumerable, so Scout reads `ownerOf` and `tokenURI` for all 1,969 tokens through Multicall3 (250
tokens per call, about two seconds) and stores the result in `chog_tokens`, at most once every six hours. A scan is
saved only when every token was read. The art comes from the collection's own IPFS folder.

The balances: on sign up and on profile views, at most once every 10 minutes per wallet, Scout reads `balanceOf` on Chog Genesis
([`0xc96d…3763`](https://monadscan.com/address/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763)) and $CHOG
([`0x3500…7777`](https://monadscan.com/address/0x350035555e10d9afaf1566aaebfced5ba6c27777)) through Multicall3 and
stores the reading in `chog_status`. If Monad is slow or down, pages carry on with the last reading.

"Held since" is the first time Scout saw the wallet holding a Chog. The public Monad RPC limits log queries to 100
blocks, so transfer history isn't replayed. A Chog first seen after a launch graduates never counts for that launch.

## The score

| Reason | Effect | When |
|---|---|---|
| `CHOG_HOLDER` | +0.10 alignment | Holds at least one Chog Genesis |
| `CHOG_LONG_HOLD` | +0.05 alignment | Has held a Chog for 30 days or more |
| `CHOG_TOKEN_1K` | +0.03 alignment | Holds 1,000 $CHOG or more |
| `CHOG_TOKEN_100K` | +0.06 alignment | Holds 100,000 $CHOG or more (replaces the 1K tier) |

The $CHOG balance is the latest reading, so it counts as of now rather than as of the launch.

## Filters

`chog_holder`, `chog_count`, `chog_held_days` and `chog_balance` (whole $CHOG) can be used in any policy.

## The Chog Holders recipe

| Bucket | Share | Who |
|---|---|---|
| `chogs` | 50% | Chog holders who don't dump (`chog_holder AND dump_score < 0.5`) |
| `long_chogs` | 20% | Chogs held for 30 days or more (`chog_held_days >= 30 AND dump_score < 0.5`) |
| `chog_token` | 15% | $CHOG holders who don't dump (`chog_balance >= 1000 AND dump_score < 0.5`) |
| `holders` | 15% | Proven holders of earlier Scout drops |

Farms, rug creators and wallets that sold most of their last drop within an hour are excluded. Per wallet caps still
apply, so with few holders every Chog reaches the cap from the first bucket and the long hold extra appears once there
are enough holders. [EVALUATION.md](EVALUATION.md#chog-holders) has the numbers.

## Where to see it

- **`/chog`** explains the integration, lists signed up holders and opens the recipe in the builder.
- **Profiles** show the Chog Passport (every Chog the wallet holds, with its art), the Chog as avatar, a Chog chip,
  the date first seen and the $CHOG balance.
- **The builder** has the Chog Holders recipe.

## Running it

```bash
pnpm scout sync-chog [wallet …]   # refresh the given wallets, or every signed-up wallet, and the passport scan
```

`SCOUT_CHOG=0` turns lookups off. `SCOUT_CHOG_RPC` points them at another Monad RPC.

Adding Chog changed no other recipe: all five existing recipes resolve to identical allocations and Merkle roots,
checked against a baseline taken before the Chog work.
