# Fix loop: triage, fix, verify, publish

Fix loop task · [Milestone 4](../milestone-4-testnet-feedback.md) · intake from [m4-fixloop-01](m4-fixloop-01-intake.md)

The loop itself: reports become labeled issues, fixes become verified closes, and the published summary stays honest.

## Steps

- [ ] Weekly triage: label, dedupe, mark what's in milestone scope.
- [ ] One branch per issue; the PR links the issue; frontend + contracts CI green before merge.
- [ ] Close with verification: the reporter confirms, or we re-run the failing path on the deployed URL and attach the tx hash or screenshot. "Fixed in code" without a re-test doesn't close.
- [ ] Keep the published feedback summary (the milestone's Catalyst evidence) current per category as items move — not reconstructed at review time.

## Done when

- Zero unlabelled reports at milestone review.
- Every `fixed` issue links its PR and its verification.
- The summary doc matches the issue tracker on the day it's submitted.
