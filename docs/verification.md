# Verification

A pre-launch pass over every process in Graduation Scout, run against the simulated world (seed 42) and the real
ScoutDrop on Robinhood Chain testnet. Each check was written independently of the code it checks where possible, and
every bug found was fixed with a test that would have caught it.

Totals after the pass: 124 unit and integration tests plus 7 browser tests, all passing.

## What was checked

| Process | How | Result |
|---|---|---|
| Templates (all 5) | Resolved at early, middle and late graduations; each payout checked against hand-written versions of the template's rules, exclusions, wallet and cluster caps, totals, determinism and Merkle proofs | **Fixed 2** (below), then pass |
| Sybil detection | Every template at all 43 simulated graduations; false positives counted at each one | **Fixed** (below); 0 honest wallets penalised at any graduation |
| Sign-up and linking | Wrong signer, replayed nonce, expired message, unknown nonce, tampered wallet line, extra text, cross-purpose message, one-sided link, link chains with valid signatures | Pass |
| Policy locks | Non-creator, second lock, lock after graduation, payout path | **Fixed 2** (below) |
| ScoutDrop contract | Line-by-line review; tests for wrong amounts, foreign proofs, double claims, unknown drop, deadline, sweep to sink once, fee-on-transfer, over-promising roots, bad parameters, batch length | Pass; **fixed** a keeper issue (below) |
| Indexing the real drop | `ingest-drops` against Robinhood Chain testnet for drop #1 | Pass: 1 drop, 184 claims, 185 transfers; totals, root and policy hash match the record exactly |
| Builder and exports | Saved policy hash = preview hash; claims export root and proofs verify; CSV has every recipient; for every template plus a custom policy | Pass; **fixed** preview timing (below) |
| Score consistency | A wallet's profile score equals its score in a payout | Pass |
| API input | 56 malformed requests: bad addresses, huge and negative numbers, invalid JSON, SQL-like strings, 10,000 buckets, 200,000-entry allowlists, 5 MB bodies | **Fixed** 500s (below); now all 4xx with clear messages |
| Pages | Every page with valid and invalid input, in a browser, on the production build | **Fixed** crashes (below) |
| End to end | Browser suite: sign-up with a real signature, alt linking, builder and CSV export, aftermath, tour, phone layout | Pass |

## Bugs found and fixed

1. **SPARK snapshot invisible at graduation.** The simulated SPARK snapshot was taken at the end of the season, after
   every graduation, so SPARK Core paid nobody and every SPARK bucket was empty. Now taken at season start.
2. **Farms paid early in the season.** Clustering only looked at signed-up wallets, so a farm with one signed-up
   wallet looked like a newcomer. Clustering now uses every indexed wallet's public funding and early buys as evidence
   (never scored or paid), and compares early buys from 3 instead of 5. Farm share under Hold or Die: 1.06% → 0.46%.
3. **Policies could be locked after graduation**, letting a creator preview winners and lock the policy that favours
   them. Locks are now refused once a launch has graduated.
4. **Payouts ignored locked policies.** `resolve` and `showcase-drop` used `--template` regardless. They now use the
   creator's locked policy, refuse a different template, and resolve as of graduation.
5. **One self-claim could revert a whole keeper batch** (`claimMany` is all-or-nothing). The keeper now skips wallets
   that already claimed and is safe to re-run; `createDrop` is dry-run first so a taxed or locked token fails with no gas.
6. **Builder previews of graduated launches used "now"**, while the keeper uses the graduation time. They now match.
7. **500 errors** from `/api/preview` and `/api/export` for a missing or malformed launch. Now 400.
8. **Pages crashed on bad input** ("This page couldn't load") for an invalid wallet or unknown launch: in the
   production build the page and the service had separate copies of the error class. Errors are now recognised by name.
9. **Misleading copy.** The launch page for the on-chain demo drop promised an aftermath that can never fill in (its
   token is a demo token nobody trades). Corrected.
10. **Expired auth nonces were never deleted.** They are now removed when a new one is issued.

## Known limits

- **Brand-new farm wallets.** A farm wallet with fewer than 3 buys and no shared funder has nothing to link it by and
  can be paid like any newcomer (0.44–1.75% of tokens across templates in the simulated season).
- **No rate limiting** on the API. Requests are cheap and validated, but a public deployment should sit behind the
  host's rate limiting.
- **Smart-contract wallets** (ERC-1271) cannot sign up yet; only regular wallets can.
- **Fee-on-transfer and rebasing tokens** cannot be dropped through ScoutDrop by design; the keeper detects this before
  spending gas.
- **Simulated evaluation.** Scoring is evaluated on a simulated world, where the ground truth is known. Real vibe/vibe
  launches and trades are indexed live from Robinhood Chain testnet (decoders tested against recorded real receipts),
  and the on-chain drop is real.
