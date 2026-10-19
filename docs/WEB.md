# The website

```bash
pnpm scout simulate      # once, if the database is empty
pnpm web                 # builds the packages, then http://localhost:3000
```

## Pages

| Page | What it does |
|---|---|
| `/` | Live counts, how Scout works and the guided tour (`/?tour=1`) |
| `/join` | Connect a browser wallet and sign to opt in. To link an alt, the alt signs, you switch accounts, and the main wallet signs the same message |
| `/profile/<wallet>` | The score, every reason and what it added, the five components, the recipes the wallet matches, its Scout drops, its Chogs and any detected wallet links. Rescore for any recipe, lane and pair |
| `/builder` | Pick a recipe and a launch, edit buckets, filters, caps and excludes, and watch the allocation resolve live. Download the CSV, the claims with proofs or the policy, save the policy by its hash, or lock it to a launch with the creator's signature |
| `/launches` | Live vibe/vibe launches and the simulated world, with creators, locked policies and Scout drops |
| `/launches/<id>` | The aftermath card: the share still held and how many held, trimmed, mostly sold or dumped after 1 hour, 24 hours, 7 days and 30 days, with every recipient's numbers. Live launches show Scout's read of their buyers |
| `/chog` | The Chog integration and every signed up Chog holder |

Signing is plain `personal_sign` on messages with a server nonce, valid for 10 minutes and usable once. There are no
transactions and no network switching. Smart contract wallets (ERC-1271) aren't supported yet.

## JSON API

Token amounts are decimal strings in raw units.

| Method | Path | Body or query |
|---|---|---|
| GET | `/api/stats`, `/api/launches`, `/api/templates` | |
| GET | `/api/profiles/:wallet` | `?template=&lane=&pair=` |
| POST | `/api/auth/nonce` | returns `{ nonce, issuedAt }` to build a message with `buildMessage` from `@scout/core` |
| POST | `/api/profiles` | `{ message, signature }` to opt in |
| POST | `/api/links` | `{ message, signature, primarySignature }` |
| POST | `/api/preview` | `{ policy, launch: { launchId } \| { lane, pairClass, creator }, slice, topN? }` |
| POST | `/api/export` | same as preview, returns CSV |
| POST | `/api/policies` · GET `/api/policies/:hash` | `{ policy }` returns `{ hash }` |
| POST | `/api/locks` | `{ message, signature }` from the launch creator |
| GET | `/api/launches/:id/aftermath` | summary per window and sold share per recipient |
| GET | `/api/live`, `/api/live/:id` · POST `/api/live/sync` | live vibe/vibe launches and the bounded sync |

## Settings

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | unset | Postgres. PGlite when unset |
| `SCOUT_PGLITE_DIR` | `<repo>/.data/pglite` | Shared by the CLI and the site |
| `SCOUT_IGNORE_HUBS_MIN_FANOUT` | `20` | Funders of this many wallets are ignored for sybil links. `0` turns it off |
| `SCOUT_SIMULATE` | unset | `1` seeds the simulated world into an empty database (demos only) |
| `SCOUT_LIVE` | on | `0` turns off live vibe/vibe syncing |
| `SCOUT_CHOG` | on | `0` turns off Chog reads from Monad |
| `SCOUT_CHOG_RPC` | `https://rpc.monad.xyz` | Monad RPC for Chog reads |

## Browser tests

`pnpm e2e` builds the site and drives it in Chromium with an injected test wallet. It covers sign up, linking,
profiles, the builder's validation and CSV export, the aftermath card, the tour, the phone layout and the Chog page.
Set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright's own browser isn't installed.

## Design

The site is "silver noir": cool near black, platinum type and one liquid chrome accent. Structure comes from
hairlines rather than glow, and colour is kept for data: mint for holding, rose for dumping.

- **Hero:** a real time liquid mercury orb (React Three Fiber). A custom shader reflects a procedural photo studio
  that turns with the pointer. Under the headline, a decode line reads real wallets from the database and resolves
  each into its Scout verdict.
- **The Sieve:** a scroll pinned canvas that tells the product in four moves. Wallets arrive, farms cluster in rose
  and fall away, the survivors become the leaves of a Merkle tree that draws up to its root, and then they drop into
  aftermath columns coloured by who held.
- **Type and structure:** an editorial serif display with chrome italic accents, mono uppercase labels, hairline
  grids and chrome pill buttons.
- **Motion:** word reveals, counters, charts that draw themselves, page transitions, a command palette (⌘K) and a
  floating nav.
- **Fallbacks:** a CSS chrome orb without WebGL or with reduced motion, phone layouts with a thumb bar, and self
  hosted fonts.
