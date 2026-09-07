# Validator optimization measurements

This report records the optimization stack before beneficiary-exit removal. Its tables are historical snapshots.
The linked artifacts follow the current branch and can differ from these recorded results.
For current measurements, see the [contract README](../code/smart-contract/README.md#execution-cost-gate).

VERIFIED on 2026-09-07. Baseline commit: `cd5b89e11919b0f9613d3ea4e522a476503e8432`.
After means the three source changes in this stack. The compiler is `aiken v1.1.23+8949565`.

## Native execution

VERIFIED: native Aiken simulations produced the following paired STT and wallet costs.
The transaction shapes, asset counts, State shapes, and State/Value hashes stayed unchanged.
These offline fixtures do not establish live network parameters or costs for other transaction shapes.

| Scenario | Memory before | Memory after | Change | CPU before | CPU after | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Streaming payout | 8,548,941 | 8,528,938 | -0.23% | 2,836,505,529 | 2,833,735,509 | -0.10% |
| Consolidation | 5,486,880 | 5,472,632 | -0.26% | 1,882,005,132 | 1,878,420,637 | -0.19% |
| 2 beneficiaries | 1,654,629 | 1,543,137 | -6.74% | 584,870,576 | 553,397,811 | -5.38% |
| 15 beneficiaries | 7,933,668 | 7,149,426 | -9.88% | 3,096,483,940 | 2,872,685,223 | -7.23% |

VERIFIED evidence: `node scripts/check-entrypoint-budget.mjs` and `node scripts/check-beneficiary-distribution-native.mjs`.
The commands ran in `code/smart-contract` before and after the changes.
Payout and Consolidation records are in [manifest.json](../code/smart-contract/fixtures/entrypoint-budget/manifest.json).
Beneficiary scenarios are in [the native checker](../code/dApp/scripts/check-beneficiary-distribution-native.ts).

## Each change

VERIFIED: each row compares its layer with the preceding layer, using the named native fixture.

| Change and fixture | Memory before | Memory after | CPU before | CPU after |
| --- | ---: | ---: | ---: | ---: |
| Payout matching, streaming payout | 8,548,941 | 8,540,158 | 2,836,505,529 | 2,836,485,835 |
| Share construction, 15 beneficiaries | 7,933,668 | 7,158,918 | 3,096,483,940 | 2,874,809,380 |
| Wallet collection, Consolidation | 5,486,880 | 5,472,632 | 1,882,005,132 | 1,878,420,637 |

VERIFIED: payout matching checks the full address before tag decoding and checks asset quantity after tag equality.
Beneficiary distribution uses `foldr` with the existing divisibility and exact-value checks.
Wallet collection combines filtering and accumulation. It retains payment-credential grouping and the first-value shortcut.

## Script and transaction bytes

VERIFIED: script bytes use `compiledCode.length / 2`, before wallet parameter application.

| Stage | STT bytes | Wallet bytes | Unsigned payout bytes |
| --- | ---: | ---: | ---: |
| Before | 14,266 | 9,375 | 16,046 |
| After payout matching | 14,273 | 9,375 | 16,046 |
| After share construction | 14,273 | 9,368 | 16,039 |
| After wallet collection | 14,273 | 9,376 | 16,047 |

VERIFIED: the combined scripts add 8 bytes. The payout fixture retains its 106-byte witness allowance.
Its transaction plus that allowance changes from 16,152 to 16,153 bytes.
The remaining margin below the repository ceiling is 231 bytes.
No fixture was resized and no size or execution ceiling was relaxed.

## Dense distribution test

VERIFIED: the existing dense wallet distribution test produced these results.
This is a synthetic unit-test measurement. It includes fixture work and is not a serialized transaction measurement.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Memory | 7,085,977 | 2,930,573 | -58.64% |
| CPU | 2,155,340,293 | 955,576,582 | -55.66% |

VERIFIED evidence: `beneficiary_distribution_tests.dense_divisible_input_has_no_asset_count_cap_wallet` in [budgets.json](../code/smart-contract/budgets.json).
The baseline record is the same path at the baseline commit.

## Alternatives measured

VERIFIED: moving the expected payout tag outside the scan alone added 3 STT bytes and 300 native payout memory units.
The retained address-first version uses fewer memory and CPU units for that fixture.

VERIFIED: direct `assets.reduce` produced a 9,315-byte wallet script after the payout change.
Its 15-beneficiary fixture used 7,448,310 memory units and 2,962,454,408 CPU units.
The selected `foldr` used 7,158,918 memory units and 2,874,809,380 CPU units at that stage.
The selected version is one source-line change and favors that fixture over the smaller script.

VERIFIED: the `foldl2` wallet variant used 5,482,788 memory units and 1,878,792,148 CPU units for Consolidation.
Its wallet script was 9,396 bytes. The retained conditional `foldl` was cheaper in both metrics and smaller.

## Validation

VERIFIED: final `pnpm verify` exited with code `0`.
Aiken reported `"total": 737, "passed": 737, "failed": 0`, including 700 unit tests and 37 property tests.
The off-chain runner reported `ℹ pass 33` and `ℹ fail 0`.
The budget, native simulation, toolchain, vocabulary, trace, and formatting checks passed in that command.

VERIFIED: the baseline `pnpm verify` passed with Aiken `737 passed, 0 failed` and off-chain `33 passed, 0 failed`.
Both beneficiary variants passed the selected module with `39 passed, 0 failed`.
Each retained layer ran the full Aiken suite through `check-budgets.mjs --update`.
Its output was `check-budgets: recorded 700 unit tests, 27 transactions, and 11 scripts into budgets.json`.
Those 700 entries are cost records, not the full Aiken test count.

REPORTED: an independent final review of the three source diffs returned `No actionable findings in the three changed files.`
That review did not run tests or establish live-chain behavior.

VERIFIED: an intermediate off-chain run failed because the isolated workspace lacked a dependency link.
Restoring local dependency links resolved that setup error. The rerun reported `33 passed, 0 failed`.
