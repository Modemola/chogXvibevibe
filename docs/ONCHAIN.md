# On chain: ScoutDrop

[`packages/contracts/contracts/ScoutDrop.sol`](../packages/contracts/contracts/ScoutDrop.sol) holds a launch's
graduation airdrop and pays it out against the Merkle root Scout produced.

- **`createDrop(token, merkleRoot, policyHash, total, claimPeriod, sink)`**: the creator deposits exactly the
  allocated total. Deposits of fee on transfer tokens revert, because an underfunded drop can't pay everyone.
  `policyHash` commits to the Scout policy, so anyone can resolve it again and check the list.
- **`claim` and `claimMany`**: anyone can submit claims, and tokens always go to the recipient. A keeper can push the
  whole list at graduation, at about 70k gas per claim in batches of 100.
- **`sweep`**: there is no cancel. After the claim period (1 to 365 days), unclaimed tokens go to the `sink` fixed at
  creation, a burn address by default, and anyone can trigger it.
- Each drop pays out at most its own deposit, so drops of the same token can't touch each other's funds.
- Leaves are OpenZeppelin `StandardMerkleTree` `(address, uint256)`, exactly what `@scout/core` builds.

It compiles with solc 0.8.28 for the Shanghai target, which runs on Arbitrum Orbit chains such as Robinhood Chain, and
is tested on an in process EVM (Ganache), so nothing needs downloading. **It is not audited.** Get an audit before
real value goes through it.

```bash
pnpm --filter @scout/contracts build                                                  # compile and generate types
DEPLOYER_PRIVATE_KEY=0x… node packages/contracts/scripts/deploy.mjs --rpc <url>      # deploy
pnpm scout ingest-drops --rpc <url> --contract <address> --from-block <deploy block>  # index, then aftermath
```

`ingest-drops` reads `DropCreated`, `Claimed` and `Swept`, links each drop to a launch by its token, follows that
token's transfers from a cursor per token, and records every claim as a Scout drop at the amount actually received.
Then it runs the aftermath. `apps/indexer/test/onchain.test.ts` runs the whole loop on a local chain: resolve, fund,
the keeper claims, recipients dump, trim, stake or hold, ingest, and the aftermath measures each one correctly.

The builder's **Download claims + proofs** button, and `POST /api/export?format=claims`, give the same data for the
web flow.

## The showcase drop

`showcase-drop` runs a resolved drop for real. It deploys ScoutDrop and a demo ERC-20 standing in for the launch token
(or reuses `--scoutdrop` and `--token`), funds the drop with the allocated total, and pushes every claim in batches
of 50. It writes every address and transaction to `apps/web/lib/onchain-drop.json`, which the home page and the
launch page link to the explorer.

```bash
pnpm scout simulate
DEPLOYER_PRIVATE_KEY=0x… pnpm scout showcase-drop --rpc https://rpc.testnet.chain.robinhood.com
```

Robinhood Chain testnet is chain 46630, with an explorer at <https://explorer.testnet.chain.robinhood.com>. The
command defaults to the Hold or Die recipe and the most recently graduated launch without a Scout drop. Use a
throwaway key with testnet ETH only. A run with about 180 recipients needs roughly 16M gas in total.

Drop #1 paid a Hold or Die drop for the simulated launch `sim-0012` to 184 recipients on
[`0xb78c…aa13`](https://explorer.testnet.chain.robinhood.com/address/0xb78c43e7df50a30d93f33b24de3554c9c286aa13),
with every claim pushed.

## $SCOUT, our own token

Graduation Scout has its own token, launched on vibe/vibe testnet like any creator's: **$SCOUT** at
`0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de`, launch #8422, with a supply of 1,000,000,000. The drop wallet bought
10,000,000 SCOUT at launch to fund its drop. vibe/vibe locks transfers until a token graduates, so the drop had to
wait.

**$SCOUT graduated on 9 October 2026 at 18:52 UTC** (block 131787178). Scout resolved Hold or Die for launch `vv-8422`
as of that moment, and ScoutDrop paid **8,930,000 SCOUT to 183 wallets** in drop #2 on the same contract
([createDrop transaction](https://explorer.testnet.chain.robinhood.com/tx/0xf13bd23a93964ec9ab7aded3773a573adfbe3c89ef6ef71ed82d45554018699c)).
Every recipient was checked on chain afterwards: all 183 claimed, each balance is at least its allocation, and an
independent second resolution gives the same Merkle root and policy hash as the ones sealed on chain. The recipients are
Scout's simulated profiles, because real wallets had not signed up yet.

```bash
pnpm scout token-status --rpc https://rpc.testnet.chain.robinhood.com --token 0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de
DEPLOYER_PRIVATE_KEY=0x… pnpm scout showcase-drop --rpc https://rpc.testnet.chain.robinhood.com --launch vv-8422 \
  --scoutdrop 0xb78c43e7df50a30d93f33b24de3554c9c286aa13 --token 0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de \
  --slice 10000000 --out "$PWD/apps/web/lib/scout-drop.json"
```

The drop record is `apps/web/lib/scout-drop.json`. The home page's $SCOUT panel and the live launch page show it.
