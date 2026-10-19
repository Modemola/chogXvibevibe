# Chog: vibe/vibe × Chog

Chog Genesis NFTs and $CHOG live on Monad mainnet. vibe/vibe trading lives on Robinhood Chain testnet. A wallet has
the same address on both, so Scout reads Monad for the wallet a member signs up with. Nothing is bridged and nothing
is signed on Monad.

## The passport

On sign up and on profile views, at most once every 10 minutes per wallet, Scout reads `balanceOf` on Chog Genesis
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

## Filters

`chog_holder`, `chog_count`, `chog_held_days` and `chog_balance` (whole $CHOG) can be used in any policy.

## The Chog Holders recipe

| Bucket | Share | Who |
|---|---|---|
| `chogs` | 60% | Chog holders who don't dump (`chog_holder AND dump_score < 0.5`) |
| `long_chogs` | 25% | Chogs held for 30 days or more (`chog_held_days >= 30 AND dump_score < 0.5`) |
| `holders` | 15% | Proven holders of earlier Scout drops |

Farms, rug creators and wallets that sold most of their last drop within an hour are excluded. Per wallet caps still
apply, so with few holders every Chog reaches the cap from the first bucket and the long hold extra appears once there
are enough holders. [EVALUATION.md](EVALUATION.md#chog-holders) has the numbers.

## Where to see it

- **`/chog`** explains the integration, lists signed up holders and opens the recipe in the builder.
- **Profiles** show a Chog chip, the Chog count, the date first seen and the $CHOG balance.
- **The builder** has the Chog Holders recipe.

## Running it

```bash
pnpm scout sync-chog [wallet …]   # refresh the given wallets, or every signed-up wallet
```

`SCOUT_CHOG=0` turns lookups off. `SCOUT_CHOG_RPC` points them at another Monad RPC.

Adding Chog changed no other recipe: all five existing recipes resolve to identical allocations and Merkle roots,
checked against a baseline taken before the Chog work.
