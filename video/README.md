# Graduation Scout: the launch film

A 3:00 motion-graphics film (1920×1080, 60 fps) and a 30-second vertical teaser (1080×1920), built in code with
[Remotion](https://www.remotion.dev). Every frame is a pure function of time, so renders are deterministic.

The film reuses the website's design: the silver-noir tokens, Instrument Serif / Inter Tight / JetBrains Mono, and the
mercury orb shader from `apps/web/components/three/HeroScene.tsx` (here driven by frame time instead of a render loop).

## Run it

```bash
cd video
pnpm install --ignore-workspace
node scripts/score.mjs                     # synthesise public/score.wav (about 40 s)
pnpm studio                                # preview in the browser
node scripts/render.mjs Film out/graduation-scout-film.mp4
node scripts/render.mjs Teaser out/graduation-scout-teaser-vertical.mp4
node scripts/still.mjs Film out/stills 7 30 50   # stills at given seconds
```

Rendering uses Playwright's headless Chromium with SwiftShader (`gl: 'swangle'`), so it runs on machines without a
GPU. Renders go to `out/`, which is not committed.

## Structure

| Time | Scene | File |
| --- | --- | --- |
| 0:00 | Cold open: a droplet becomes the mercury orb; title | `src/scenes/Open.tsx` |
| 0:15 | The problem: the orb shatters into wallets; farms cluster; dumpers flee; the price collapses | `src/scenes/Problem.tsx` |
| 0:40 | The idea: time freezes into a grid; Opt-in · Explainable · Accountable; a wallet signs | `src/scenes/Idea.tsx` |
| 1:05 | The score: the formula builds; reason codes stack into each wallet's exact score | `src/scenes/Score.tsx` |
| 1:35 | Sybil defence: pull back from the cluster; exchange hubs ignored; farms fall through the sieve | `src/scenes/Sybil.tsx` |
| 1:55 | Creators design the drop: the live builder in a glass frame; the policy hash locks | `src/scenes/Builder.tsx` |
| 2:15 | On-chain, for real: Merkle tree → ScoutDrop on Robinhood Chain testnet → 184 wallets paid | `src/scenes/OnChain.tsx` |
| 2:35 | Aftermath: recipients drain or hold over 1h → 30d; the curve becomes the flywheel | `src/scenes/Aftermath.tsx` |
| 2:50 | Close: everything collapses into the orb; end card | `src/scenes/Close.tsx` |

Scenes 2 and 3 share one particle world (`src/world.ts`), so the freeze in scene 3 starts exactly where scene 2 ends.
Other scene changes are match cuts too: the dive into the signed wallet becomes the score scene's ring, and the dumper's
cluster becomes the first node group of the sybil scene. The retention curve becomes the flywheel, which collapses
into the orb.

## Where the numbers come from

Nothing on screen is invented.

- `src/data/holder.json`, `dumper.json`: `/api/profiles/<wallet>?template=hold_or_die` for the guided tour's holder and
  dumper (simulated world, seed 42). Their reasons sum exactly to their scores (0.584 and −1.651).
- `src/data/aftermath.json`: `/api/launches/sim-0010/aftermath` (simulated launch, 50 recipients).
- `src/data/onchain.json`: the real ScoutDrop run on Robinhood Chain testnet (`apps/web/lib/onchain-drop.json`) plus
  each transaction's receipt (block, gas, status, timestamp) read from `https://rpc.testnet.chain.robinhood.com`.
- `public/shots/builder-full.png`: the policy builder, captured from the app at 2×.
- Evaluation figures (0 of 336 honest wallets flagged, 0% to farms) are from the README's simulated evaluation.

Scoring data is labelled "simulated" wherever it appears. The film does not claim any integration with or
endorsement from vibe/vibe.

## Sound

`scripts/score.mjs` synthesises a quiet ambient score:
- low pads that change chord with each scene;
- soft sub pulses on scene changes;
- glassy bells on key moments (droplet, title, signature, policy lock, all wallets paid, end card);
- a swell into the on-chain scene;
- a moment of silence before the final line.

There is no voiceover. To use your own music, replace `public/score.wav` and re-render.
