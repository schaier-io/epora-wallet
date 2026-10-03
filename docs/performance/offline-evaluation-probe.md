# Offline evaluation probe

VERIFIED: The installed Scalus evaluator can evaluate this project's STT V3 mint.
The working tree now uses a browser worker for draft evaluation.
Final evaluation still uses the remote provider. Live parity remains unmeasured.

## Reproduce

Run from `code/dApp`:

```sh
node_modules/.bin/vitest run src/lib/mesh/transactions/offline-evaluation.test.tsx
```

VERIFIED: The final run returned `Tests 4 passed (4)`.
The test builds real unsigned project transactions with synthetic UTxOs.
It supplies explicit SDK cost models and all input and reference outputs.
It does not use credentials, submit transactions, or request chain data.
The probe prints each evaluation time and its complete budget.

VERIFIED: Both draft and final evaluations returned:

```json
[{"tag":"MINT","index":0,"budget":{"mem":470102,"steps":147666434}}]
```

VERIFIED: The project builder also completed both passes with Scalus as its evaluator.
The test checks that the resulting transaction budgets cover these measured costs.

VERIFIED: Missing reference output and invalid state output datum reject evaluation.
The invalid state datum is integer `99`, which replaces the valid state structure.
The unchanged fixture succeeds.

## Timing evidence

VERIFIED: Three repeat validation processes produced these times on `darwin-arm64` with Node `v26.7.0` and Vitest `5.0.0`:

| Process | First evaluation (ms) | Median of seven warm evaluations (ms) | Warm range (ms) |
| --- | ---: | ---: | ---: |
| 1 | 42.80 | 9.75 | 8.44 to 15.13 |
| 2 | 39.30 | 9.03 | 8.25 to 12.43 |
| 3 | 42.01 | 9.64 | 8.32 to 12.52 |

VERIFIED: Each process evaluated the draft four times, then the final transaction four times.
The first evaluation excludes dependency import and transaction construction.
These numbers measure local execution and input encoding for this fixture.
They do not measure browser work, total build time, or a remote evaluator.

## Limits and correction

VERIFIED: The test uses `DEFAULT_V1_COST_MODEL_LIST`, `DEFAULT_V2_COST_MODEL_LIST`, and `DEFAULT_V3_COST_MODEL_LIST`.
These SDK defaults do not attest the current chain parameters.
No remote budget parity, remote latency, or current parameter parity was measured.
Correction: the first probe covered mint only. The added action suite now covers
state updates, wallet spending, withdrawals, delegation certificates, and DRep votes.

VERIFIED: The first rejection experiment changed the mint redeemer and expected rejection.
That expectation was wrong: `code/smart-contract/validators/stt_mint_tests.ak:17` states that mint ignores the redeemer.
Scalus accepted that transaction. The corrected probe changes the validated state output datum instead.

VERIFIED: The API comes from the installed `@meshsdk/core-cst/dist/index.d.ts`, class `OfflineEvaluatorScalus`.
The implementation accepts explicit cost models and resolves missing outputs through its fetcher.
The [Mesh offline evaluator documentation](https://meshjs.dev/providers/offline-evaluator) describes the separate `core-csl` evaluator.
The probe uses the installed Scalus implementation's signature.

## Draft implementation evidence

VERIFIED: The focused run returned `Test Files 5 passed (5); Tests 48 passed (48)`.
Command: `node_modules/.bin/vitest run src/lib/mesh/transactions/internals/local-evaluation-worker.test.tsx src/lib/mesh/transactions/internals/local-draft-evaluation.test.tsx src/lib/mesh/transactions/hybrid-evaluation.integration.test.tsx src/lib/mesh/transactions/offline-evaluation.test.tsx src/lib/mesh/transactions/offline-evaluation-actions.test.tsx`.
These tests use synthetic inputs and explicit SDK models. They cannot prove live chain budget parity.

VERIFIED: With only `build-parameter-fetcher.ts` restored to HEAD, five new hybrid tests failed.
Restoring the implementation returned `Tests 15 passed (15)` for the hybrid and input-context suites.
The unchanged baseline also reproduced the same 24 existing failures in the spend and streaming integration suites.
Those failures remain outside this change.

VERIFIED: The full Node suite returned `pass 1911; fail 0; skipped 26`.
The full Vitest suite returned `24 failed | 2069 passed (2093)` before the three added worker-reuse tests.
The focused final run includes those three tests.

VERIFIED: The wrapper only attempts local evaluation in browser builds with `ServerFetcher`.
It requires raw provider cost models and complete spending, collateral, and reference input outputs.
Missing context, worker errors, and unsupported chained transactions use remote evaluation.
Cancellation stops the worker and prevents fallback. The final pass always uses the remote provider.
The worker serializes requests, reuses its runtime, and closes after 30 seconds without a request.

VERIFIED: Scalus returns `VOTING` for a vote budget. Mesh expects `VOTE`.
The worker response reader converts this tag before the builder applies budgets.
The hybrid vote test checks both budgets and the vote validator in the result.

REPORTED: The browser probe ran through the actual Next Turbopack worker bundle.
A separate worker per request returned mint budget `mem=470102; steps=147666434`.
Its first request took 1494.4 ms. Later requests took 721.0 ms and 670.9 ms.
REPORTED: Reusing one worker returned the same mint budget for all six requests.
The first request took 686.8 ms. Later requests took 146.7, 331.1, 13.3, 322.0, and 11.0 ms.
These development-browser measurements include worker startup and module loading.
They prompted worker reuse. They do not establish a production speed improvement.

VERIFIED: Automatic approval review rejected live Blockfrost access with the stored preprod credential.
Live budget parity and remote timing remain unmeasured pending explicit credential approval.
No transaction was signed or submitted by these tests.

VERIFIED: `tsc --noEmit --incremental false` exited 0 after the temporary browser probe was removed.
Scoped ESLint exited 0. The source length check returned `783 source files checked, none over 750 lines`.
The bundle check returned `9 routes checked, all within their first-load JS budgets`.
Route first-load sizes were 883 to 892 KB. This check excludes deferred worker download and startup.

REPORTED: The production Next build completed after removing a stale generated probe route validator.
The local build temporarily expanded `turbopack.root` to resolve the existing dependency symlink.
That configuration change and the test routes were removed afterward.

## Least confident decisions

1. INFERRED: A warm worker may reduce draft build latency. Live remote timing remains necessary before shipping.
2. INFERRED: The first worker startup may cost more than remote evaluation. Production browser measurements remain necessary.
