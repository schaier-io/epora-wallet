# Onboarding: faucet pointer and preflight hints

Onboarding task · [Milestone 4](../milestone-4-testnet-feedback.md)

Source evidence as of 2026-09-26, `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
The source references below establish implementation. Live checks and drills retain their own evidence requirements.

Correction: the earlier claim that the app had no faucet guidance was stale.
Some requested placements and live tester checks remain open.

## Completed

- [x] Link the faucet before testnet entry. `code/dApp/src/components/layout/risk-disclaimer-gate.tsx:16-33` displays the testnet faucet link.
- [x] Link the faucet when the send view has no funds. `code/dApp/src/components/user/workspace/config-sttspend-view.tsx:466-469` renders `PreprodFaucetHint` for an empty wallet.
- [x] Offer wallet installation links when no extension is detected. `code/dApp/src/components/layout/wallet-panel.tsx:361-378` links Lace, Eternl, and Vespr.
- [x] Give network-specific action guidance. `code/dApp/src/components/user/workspace/workspace-flow-handlers.ts:142-143` rejects a wrong network. `code/dApp/src/components/user/proposals/use-proposal-orchestration.ts:269-273` names the required network before signing.

## Remaining work and verification

- [ ] Check the dedicated onboarding and Add funds placements requested originally. The verified consent and send-view links do not prove those placements exist.
- [ ] Watch a fresh tester reach a funded wallet using only in-app guidance.
- [ ] Record the live wrong-network message and a successful retry after switching networks.
