# Permission Wallet Frontend

The reference web interface for the permission-based wallet — the off-chain half
of the design described in the [whitepaper](../../whitepaper/whitepaper.pdf)
(see its *Implementation* section). Next.js + React; transaction building,
balancing, and submission go through MeshJS against the Cardano Preprod network.

The on-chain validators this app drives live in
[code/smart-contract](../smart-contract/README.md).
Their compiled blueprint (`plutus.json`) is mirrored into this app — by
`pnpm run sync:blueprint` locally, and by the blueprint-autosync CI workflow on
push.

The primary guided route is `/user`; `/user/proposals` hosts the multi-signature
proposal workspace, and `/` is the public project entry page.

## What it covers

- CIP-30 wallet connect and signing for detected browser wallets
- WalletConnect/CIP-45 pairing and session setup; transaction signing through
  WalletConnect is still deferred
- Wallet creation: minting the state-thread token (STT) with its initial
  configuration, deploying the shared STT reference script, and funding the
  wallet
- The STT spend transitions: operator actions, `RenewProofOfLife`,
  `UseAllowance`, `UseBeneficiary`, `PayStreamingPayment` (streaming payments
  surface in the UI as scheduled payments), and `Consolidate`
- Wallet script actions: `wallet.spend`, `wallet.withdraw`, plus expert flows
  for `wallet.publish` and `wallet.propose` (governance certificates and
  proposals; not yet exercised in the manual feature walkthrough)
- Proof-of-life renewal folded into the send and refresh-timer flows, since
  keeping the dead-man-switch alive is the off-chain builder's responsibility
  (see the contracts README's "Role Model & Trust Boundaries")
- The stake-credential diagnostic that finds wallet funds resting at an
  unintended ("Frankenstein") stake credential and offers to sweep them back —
  see [src/lib/discovery/](src/lib/discovery/README.md)
- Experimental staking/governance surfaces backed by server-side chain routes
- Transaction preview before signing/submitting
- Server-side Blockfrost and Koios proxies (no third-party API key reaches the
  browser)
- Tailwind + shadcn-style UI components + Lucide icons

## Deferred

- A flow for the wallet's `vote` entrypoint (the validator supports it; no UI yet)
- Public, versioned API/spec for outside developers
- End-to-end WalletConnect transaction signing

## Setup

```bash
cd code/dApp
cp .env.example .env.local
corepack enable
pnpm install
# in CI/frozen mode, use:
# pnpm install --frozen-lockfile
pnpm run prisma:generate
pnpm run prisma:push
pnpm run sync:blueprint
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

- `BLOCKFROST_PREPROD_PROJECT_ID`: Blockfrost API key for preprod.
- `DATABASE_URL`: Prisma connection string. Local development defaults to
  `postgresql://postgres@localhost:5432/wallet`; make sure the `wallet` database
  exists locally.
- `STT_SYNC_SECRET`: Shared secret for the protected background STT sync route.
- `PROPOSAL_AUTH_SECRET`: HMAC secret for proposal sign-in nonces and session
  cookies; required in production.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Optional Reown/WalletConnect project
  id for mobile pairing.
- `KOIOS_URL`: Optional server-side override for the Koios endpoint used by the
  credential-UTxO discovery proxy (`/api/koios/credential-utxos`); defaults to
  the public per-network instance.

## Day-to-day scripts

- `pnpm run dev` / `pnpm run build` / `pnpm run start` — the usual Next.js trio.
- `pnpm run lint` and `pnpm run typecheck` — ESLint (zero warnings allowed) and
  `tsc --noEmit`.
- `pnpm test` — full suite. Uses the same PostgreSQL database with an isolated
  `stt_test` schema, so it does not touch the app's default schema.
- `pnpm run test:unit` — just the pure contract/workspace unit tests; no
  database needed.
- `pnpm run test:components` — vitest + jsdom component/DOM tests and the
  builder integration tests (mocked chain I/O); no database or network.
- `pnpm run test:e2e` — TRUE end-to-end on preprod (build → sign → submit with a
  real funded wallet + real Blockfrost). Self-skips unless both env vars are set:
  `BLOCKFROST_PREPROD_PROJECT_ID` and `E2E_PREPROD_MNEMONIC` (a space-separated
  mnemonic of a **dedicated, faucet-funded** preprod wallet — each run spends a
  little tADA). Never part of `pnpm test`; run it manually or via the nightly CI
  job (`.github/workflows/dapp-e2e.yml`, gated on repo secrets).
- `pnpm run sync:blueprint` — re-mirror the contract blueprint after an
  `aiken build` in the contracts package.

## Notes

- The app is preprod-focused and expects wallet network ID `0`.
- Contract artifact source is `code/smart-contract/plutus.json`
  (relative to the repo root), copied into the app at
  `src/lib/contracts/plutus.json`.
- Vocabulary follows the contracts package: the UI's "scheduled payments" are
  the contract's streaming payments; the on-chain action names (`UseAllowance`,
  `PayStreamingPayment`, …) are the canonical ones.
