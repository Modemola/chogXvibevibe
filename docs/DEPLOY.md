# Deploying to Vercel

1. Import the repository and set **Root Directory** to `apps/web` (Project, Settings, Build and Deployment). Leave
   "Include files outside the root directory" on. `apps/web/vercel.json` builds the workspace packages first.
2. Without `DATABASE_URL`, each server instance runs an in memory database holding the simulated world. The build
   stores that world as a snapshot (`apps/web/scripts/snapshot.mjs`), so a cold instance is ready in about a second.
   The demo works, but sign ups and links don't persist.
3. For persistence, add a Postgres `DATABASE_URL` (Neon, Render, Supabase or any other Postgres; append
   `?sslmode=require` if the host needs SSL), then seed it once from your machine:

   ```bash
   DATABASE_URL=… pnpm scout migrate
   DATABASE_URL=… pnpm scout simulate
   ```

The site applies new database migrations on start, so later deploys need no manual step.

Live vibe/vibe syncing and Chog reads work out of the box. Turn them off with `SCOUT_LIVE=0` and `SCOUT_CHOG=0`.
