# API: rate-limit the public routes

Public API task · [Milestone 3](../milestone-3-ui-development.md)

`lookup` is not a plain cache read: when the cache is stale it triggers Koios/Blockfrost syncs ([lookup.ts](../../code/dApp/src/lib/stt-cache/lookup.ts)). Unthrottled, a public `lookup` flood becomes a provider-quota flood.

## Steps

- [ ] Per-IP limiter on `/api/v1/*` — a token bucket utility is enough; if hosting lands on a multi-instance platform, back it with Postgres instead of memory.
- [ ] Two tiers: a loose cap for cache reads, a much tighter cap on the sync-triggering path (cap how often any requester can cause a chain fetch).
- [ ] Return `429` with `Retry-After`; limits tunable via env.
- [ ] Document the limits in the spec.

## Done when

- A flood test gets 429s, and a mock chain client shows no sync amplification past the tight cap.
- Limits appear in the OpenAPI spec.
