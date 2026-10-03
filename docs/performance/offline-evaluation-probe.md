# Offline evaluation probe

VERIFIED: The installed Scalus evaluator can evaluate this project's STT V3 mint.
The production evaluator remains unchanged.

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
Spend, withdrawal, and governance transactions remain untested by this probe.

VERIFIED: The first rejection experiment changed the mint redeemer and expected rejection.
That expectation was wrong: `code/smart-contract/validators/stt_mint_tests.ak:17` states that mint ignores the redeemer.
Scalus accepted that transaction. The corrected probe changes the validated state output datum instead.

VERIFIED: The API comes from the installed `@meshsdk/core-cst/dist/index.d.ts`, class `OfflineEvaluatorScalus`.
The implementation accepts explicit cost models and resolves missing outputs through its fetcher.
The [Mesh offline evaluator documentation](https://meshjs.dev/providers/offline-evaluator) describes the separate `core-csl` evaluator.
The probe uses the installed Scalus implementation's signature.

## Least confident decisions

1. INFERRED: Local evaluation may reduce build latency. Remote comparison remains necessary before a production switch.
2. INFERRED: This mint result may transfer to other actions. Each action needs its own compatibility and budget comparison.
