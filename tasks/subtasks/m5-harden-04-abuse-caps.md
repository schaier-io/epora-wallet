# Hardening: abuse caps re-check

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

With real value behind the app, the cheap-to-ignore abuse paths stop being cheap: provider-quota burn via lookup, and unbounded rows in the proposals table.

## Steps

- [ ] Re-verify the [M3 rate limits](m3-api-03-rate-limits.md) hold on the mainnet deployment, especially the sync-trigger cap — mainnet Koios/Blockfrost quotas are the ones that hurt.
- [x] Bound open proposals per creator and wallet, with a clear quota error. At `main` commit `d3b5a239`: `code/dApp/src/lib/proposals/limits.ts:11-12` sets 25 active proposals and 100 creations per day. `create-record.ts:81-107` enforces them. The earlier claim that creation had no cap was stale. Mainnet load testing remains separate.
- [ ] Prune cancelled and long-submitted proposals — on-create cleanup or a periodic job, either is fine; pick one and note it.

## Done when

- A flood test against mainnet shows caps holding without provider amplification.
- The proposal bound is enforced by a test; pruning demonstrably removes stale rows.
