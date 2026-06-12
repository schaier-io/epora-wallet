# Platform: app & data (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Implementation*

## What landed

- [x] Next.js (App Router) app under [src/app](../../code/dApp/src/app): landing, `/user` workspace, `/user/proposals`.
- [x] Providers in [src/providers](../../code/dApp/src/providers): wallet (CIP-30 state + atoms), WalletConnect, toasts.
- [x] Postgres via Prisma 7 with the `pg` driver adapter; schema + migrations in [prisma/](../../code/dApp/prisma), client generated into `src/generated/prisma`.
- [x] Mesh 1.9 (`@meshsdk/core` / `core-cst`) pinned exactly; state via jotai.

## Verified by

- `pnpm test` — node test runner against a scratch `stt_test` schema; `pnpm lint` at `--max-warnings=0` (CI is authoritative).
