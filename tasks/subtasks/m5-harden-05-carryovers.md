# Hardening: testnet carry-overs

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

The M4 fix loop parks out-of-scope items under the `next` label. Mainnet is where "next" comes due — each one gets fixed or gets a written reason, none get forgotten.

## Steps

- [x] Review the `next`-labelled issues. 2026-09-26: `gh issue list --state all --label next --limit 100` returned one record, issue #392, state `CLOSED`. The response did not reach its 100-record cap.
- [x] Record the deferral. 2026-09-26: WalletConnect signing and real-device testing are deferred beyond closeout. See [categorized feedback](../../docs/testnet-feedback.md#next). Closed as deferred, not implemented.

## Done when

- Zero `next` issues without either a linked fix or a dated justification.
