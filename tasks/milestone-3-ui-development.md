# Milestone 3 — Development of UI

Off-chain: the transaction-building layer, the web UI, an API others can build against, and docs. Whitepaper §11 (Implementation).

References: [Whitepaper](../whitepaper/whitepaper.pdf) · [`code/dApp`](../code/dApp)

## Development tasks

### Platform

- [x] [App & data](subtasks/m3-plat-01-app-data.md) — Next.js app, Mesh, Postgres + Prisma STT cache, providers.
- [x] [Contract binding](subtasks/m3-plat-02-contract-binding.md) — blueprint load/parameterize, datum + `SttAction` encode/decode, value encoding, form derivation (test-backed).
- [x] [Transaction engine](subtasks/m3-plat-03-tx-engine.md) — generic STT-spend build path, submit, fee/UTxO/witness internals.
- [x] [Chain data & indexing](subtasks/m3-plat-04-chain-data.md) — server-side fetchers (no API key in the browser, §11), STT detection, cache (indexer/lookup, tested).
- [x] [Wallet connection](subtasks/m3-plat-05-wallet-connection.md) — CIP-30 via Mesh (connect + sign); WalletConnect/CIP-45 pairing + session (§11).

### By feature

- [x] [Wallet creation & funding](subtasks/m3-feat-01-create-fund.md) (§4.4) — mint, lock funds, deploy reference script; receiving needs no datum.
- [x] [Owners, allowances & multi-sig](subtasks/m3-feat-02-owners-allowances.md) (§5.1) — governance builder (users/caps), allowance + access-removal derivation, user editor, operator spend.
- [x] [Dead-man-switch](subtasks/m3-feat-03-dead-man-switch.md) (§5.2) — proof-of-life timing editor; renewal via the shared engine.
- [x] [Beneficiary recovery](subtasks/m3-feat-04-beneficiary.md) (§5.3) — weighted-share derivation, beneficiary editor.
- [x] [Streaming payments](subtasks/m3-feat-05-streaming.md) (§5.4) — payout derivation, streaming editors.
- [x] [Self-custody & stake control](subtasks/m3-feat-06-stake-control.md) (§4.5, §11) — set-stake-credential + consolidate builders, wallet withdraw, stake-pool finder, stake diagnostic (orphan detection + sweep prompt).

### Workspace & design

- [x] [Workspace UI](subtasks/m3-ws-01-workspace-ui.md) — connect, state overview, guided action flow with pre-sign review, activity timeline, editors.
- [x] [Design system](subtasks/m3-ws-02-design-system.md) — tokens/type/motion, shadcn + React-Bits primitives, asset copy.

### API

- [x] [Routes](subtasks/m3-plat-06-routes.md) — Mesh proxy, STT sync, STT lookup.
- [ ] **Public, versioned API + spec for outside developers** — the routes exist; make them a stable, documented, abuse-safe surface.
  - [ ] [Hoist shared request/response schemas into `src/lib/api/`](subtasks/m3-api-01-shared-schemas.md)
  - [ ] [Pin the v1 surface, add `/api/v1/` routes](subtasks/m3-api-02-v1-routes.md)
  - [ ] [Rate-limit the public routes (sync-trigger cap)](subtasks/m3-api-03-rate-limits.md)
  - [ ] [OpenAPI 3.1 spec, served at `/api/v1/openapi.json`](subtasks/m3-api-04-openapi.md)
  - [ ] [Spec round-trip tests in CI](subtasks/m3-api-05-spec-tests.md)
  - [ ] [Developer docs — curl examples + versioning policy](subtasks/m3-api-06-dev-docs.md)

### Polish

- [ ] **Route signing through WalletConnect** — pairing/session works; signing still always goes through CIP-30.
  - [ ] [Extract the signer interface from `signAndSubmitTx`](subtasks/m3-wc-01-signer-interface.md)
  - [ ] [Session-backed signer over `cardano_signTx`](subtasks/m3-wc-02-walletconnect-signer.md)
  - [ ] [Active-signer selection + show which signer signs](subtasks/m3-wc-03-active-signer.md)
  - [ ] [`signData` for proposals login — implement or state the limit](subtasks/m3-wc-04-signdata.md)
  - [ ] [Real-device pass + compatibility matrix](subtasks/m3-wc-05-device-pass.md)
- [ ] **Empty/error/loading consistency pass** — every surface, explicit states, nothing swallowed.
  - [ ] [State inventory + the presentation rules](subtasks/m3-ui-01-state-inventory.md)
  - [ ] [Surface the silent catches](subtasks/m3-ui-02-silent-catches.md)
  - [ ] [Error presentation + bound the mint poll](subtasks/m3-ui-03-error-presentation.md)
  - [ ] [Zero states + loading accessibility](subtasks/m3-ui-04-empty-loading.md)
- [ ] **Wallet-signature login (bearer token) for the expensive routes + signed terms acceptance** — generalise the proposals nonce → `signData` → HMAC-session pattern into app-wide auth, gate the provider-quota-burning routes behind it, and persist the wallet's signed acceptance of the terms.
  - [ ] [Generalise wallet login into a bearer token gating the expensive routes](subtasks/m3-auth-01-wallet-login.md)
  - [ ] [Persist the signed terms-and-conditions acceptance](subtasks/m3-auth-02-terms-acceptance.md)
- [ ] **Manual walk of every whitepaper feature** — 17-row script on preprod, tx hash per row; doubles as the demo-video script.
  - [ ] [Test wallets + timing setup (delegation first, short deadline)](subtasks/m3-walk-01-setup.md)
  - [ ] [Run the script, record hashes in `walkthrough-results.md`](subtasks/m3-walk-02-run.md)

## Non-development tasks

- [x] Design + product docs. (DESIGN.md, PRODUCT.md, CONTEXT-MAP.md existed during development; pruned in the June repo cleanup.)
- [ ] Off-chain code docs — dev guide to builders, contract binding, discovery.
- [ ] Demo video — whitepaper features working in the app.

## Acceptance criteria (Catalyst)

- A video of the prototype doing what the whitepaper describes
- An API + spec for external developers
- Code documentation

## Evidence

- The demo video
- Link to the repo
