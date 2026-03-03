# Vercel: Migrations and Seed

## Build flow

On every Vercel deploy, the build runs `pnpm run vercel-build` (see `vercel.json`), which executes in order:

1. **prisma generate**
2. **prisma migrate deploy** — migrations run on every deploy
3. **prisma db seed** — runs **only** when the environment variable `RUN_SEED` is truthy
4. **next build**

The conditional seed step is implemented in `scripts/vercel-build.cjs` (Node, cross-platform). No shell-specific logic is used.

## Environment variable: RUN_SEED

- **Truthy values** (case-insensitive, trimmed): `1`, `true`, `yes`, `on`
- If `RUN_SEED` is unset or not truthy, the build logs: *"RUN_SEED is not true -> skipping prisma db seed."* and does not run the seed.

## Recommended operational flow

- **Production (and Preview)**: Leave `RUN_SEED` **unset** (or set to `false`) so normal deploys do not run the seed. This avoids overwriting system catalogs on every deploy.

- **When system catalogs change** (permissions, vendor roles, plans):
  1. In Vercel → **Settings → Environment Variables**, set `RUN_SEED=true` for the target environment (e.g. Production).
  2. Trigger a redeploy (e.g. push to the production branch or “Redeploy” in the dashboard).
  3. After a successful deploy, **unset** `RUN_SEED` or set it to `false` so future deploys do not run the seed again.

## STRICT_SEED (seed script behavior)

The Prisma seed script (`prisma/seed.cjs`) runs in **strict mode** by default (`STRICT_SEED` is true when unset). In strict mode, any validation or consistency failure (e.g. invalid permission scope, missing permission codes for vendor roles) will **throw** and cause the seed step to fail, which **fails the deploy**. Fix the data in the seed file (e.g. `PERMISSIONS` / `VENDOR_ROLES` arrays) and redeploy. To allow non-fatal warnings during seed, set `STRICT_SEED=false` in the same environment where you set `RUN_SEED=true` (use with care).
