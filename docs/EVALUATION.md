# Evaluation on the simulated world

Scout is evaluated on a simulated season where every wallet's behaviour is known: builders, diamond hands, stock pair
natives, whales, newcomers, trenchers, dumpers, ruggers and four wallet farms. The simulator is not calibrated to
real vibe/vibe data. It is a world that contains the behaviours Scout has to tell apart.

## At the end of the season

`pnpm scout evaluate --ignore-hubs 20`, Custom recipe, seed 42, 373 opted in profiles:

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

The staggered farm avoids clustering but still receives nothing, because it dumps every drop. The end to end test
(`apps/indexer/test/pipeline.test.ts`) keeps these properties in place.

## At every graduation

The table above is measured at the end of the season. Real drops are resolved at each launch's graduation, when
fewer people have signed up and farms have less history, so every recipe is also resolved at all 43 simulated
graduations:

| Recipe | Launches where a farm wallet is paid | Share of all tokens to farms |
|---|---|---|
| Hold or Die | 11 of 43 | 0.46% |
| Custom | 11 of 43 | 0.44% |
| Builder Lane | 11 of 43 | 0.77% |
| Stock Pair Natives | 11 of 43 | 0.94% |
| SPARK Core | 14 of 43 | 1.75% |

No honest wallet carries a sybil penalty at any of the 43 graduations. The farm wallets that still get paid have
made fewer than three buys and share no funder with each other, so there is nothing yet to link them by and they
look like any newcomer.

Sybil links use every indexed wallet's public funding and early buys as evidence, not only signed up profiles, so a
farm is caught even when only one of its wallets has signed up. Wallets that never opted in are never scored or
paid. `apps/indexer/test/templates.test.ts` checks each recipe at early, middle and late graduations against
handwritten versions of its rules.

## Chog Holders

The same test gives a fifth of the simulated profiles a Chog Genesis with three histories: held long before the first
graduation, first seen just before the middle one, and first seen after the last one. At every graduation it checks
that only Chogs held by then are paid as Chogs, and that only Chogs held for 30 days or more are paid as long time
Chogs.

With 248 simulated Chog holders, 30+ day holders averaged 5,000 tokens and newer holders 3,772. Per wallet caps still
apply: with only a few holders, every Chog reaches the cap from the first bucket and the long hold extra appears once
there are more holders than the cap lets the first bucket fill.
