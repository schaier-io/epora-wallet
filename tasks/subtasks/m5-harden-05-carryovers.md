# Hardening: testnet carry-overs

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

The M4 fix loop parks out-of-scope items under the `next` label. Mainnet is where "next" comes due — each one gets fixed or gets a written reason, none get forgotten.

## Steps

- [ ] Sweep every `next`-labelled issue from the testnet phase.
- [ ] Each becomes: fixed (normal [fix-loop rules](m4-fixloop-02-triage-verify.md), contract changes per the [redeploy rules](m4-fixloop-03-contract-redeploys.md)), or re-justified with a dated comment saying why it can wait past closeout.

## Done when

- Zero `next` issues without either a linked fix or a dated justification.
