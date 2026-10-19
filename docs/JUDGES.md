# Trying Graduation Scout in five minutes

Everything below is on the live site. There is no login and no password, and most of it needs no wallet at all.

**Live site:** <https://graduation-scout.vercel.app>

## 1. Take the tour

<https://graduation-scout.vercel.app/?tour=1> walks through the whole product in about two minutes: the problem, the
score, how farms are caught, the builder and the on chain payout. It has its own controls, so you can pause or skip.

## 2. See the Chog integration

<https://graduation-scout.vercel.app/chog> explains the Chog passport, the score boosts and the Chog Holders recipe,
and lists every signed up wallet that holds a Chog.

## 3. Watch Scout read a Chog holder from Monad

Paste a wallet that holds a Chog Genesis into the search box at the top of any page, or open this real holder's
profile:

<https://graduation-scout.vercel.app/profile/0x84113421a8a564b594ee9ae78c875310332d7023?template=chog_holders>

Scout reads that wallet's Chog Genesis NFTs and $CHOG balance from Monad mainnet when the page loads (it holds 59
Chogs). The profile shows:

- a **Chog holder** chip with the count;
- the score with every reason that went into it, including **Holds a Chog Genesis NFT**;
- the recipes the wallet qualifies for, with the Chog Holders recipe matching through its `chogs` bucket.

Try your own wallet the same way.

## 4. Design a drop

<https://graduation-scout.vercel.app/builder?template=chog_holders>

Pick a launch and change any rule. The list of recipients, the amounts and the reasons resolve again as you type.
Download the recipients as CSV, the claims with Merkle proofs, or the policy as JSON.

## 5. Look at real vibe/vibe data

<https://graduation-scout.vercel.app/launches> lists real launches read from Robinhood Chain testnet. Open
**$SCOUT** (launch #8422), our own token, to see how many of its buyers sold within an hour and the drop Scout paid
when it graduated.

## 6. Check the payout on chain

$SCOUT graduated on 9 October 2026 and ScoutDrop paid 8,930,000 SCOUT to 183 wallets:

<https://explorer.testnet.chain.robinhood.com/tx/0xf13bd23a93964ec9ab7aded3773a573adfbe3c89ef6ef71ed82d45554018699c>

The Merkle root and policy hash in that transaction match the list Scout published.
[ONCHAIN.md](ONCHAIN.md) explains how to resolve again it yourself.

## 7. Join (optional)

<https://graduation-scout.vercel.app/join> asks for one wallet signature. It costs nothing, sends no transaction and
works on any network, so there is no need to add Robinhood Chain or Monad to your wallet. On a phone, open the site
inside your wallet app's browser.

## Contract addresses

| | Chain | Address |
|---|---|---|
| ScoutDrop | Robinhood Chain testnet (46630) | [`0xb78c43e7df50a30d93f33b24de3554c9c286aa13`](https://explorer.testnet.chain.robinhood.com/address/0xb78c43e7df50a30d93f33b24de3554c9c286aa13) |
| $SCOUT | Robinhood Chain testnet (46630) | [`0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de`](https://explorer.testnet.chain.robinhood.com/address/0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de) |
| Chog Genesis (read only) | Monad (143) | [`0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`](https://monadscan.com/address/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763) |
| $CHOG (read only) | Monad (143) | [`0x350035555e10d9afaf1566aaebfced5ba6c27777`](https://monadscan.com/address/0x350035555e10d9afaf1566aaebfced5ba6c27777) |

## Checking the claims in code

| Claim | Where it is tested |
|---|---|
| Every recipe pays only the wallets its rules allow, within caps, with valid proofs | `apps/indexer/test/templates.test.ts` |
| A Chog first seen after graduation never counts | `apps/indexer/test/templates.test.ts`, `packages/core/test/resolve.test.ts` |
| Adding Chog changed no other recipe's allocations or Merkle roots | Regression run in [VERIFICATION.md](VERIFICATION.md) |
| A wallet's profile score equals its score in a payout | `apps/web/test/service.test.ts` |
| The vibe/vibe decoders match real transactions | `packages/sources/test/vibevibe.test.ts` |
| ScoutDrop rejects wrong amounts, foreign proofs and double claims | `packages/contracts/test` |
