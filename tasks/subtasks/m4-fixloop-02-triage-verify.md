# Fix loop: triage, fix, verify, publish

Fix loop task · [Milestone 4](../milestone-4-testnet-feedback.md)

VERIFIED by source inspection on 2026-09-26 at `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
No tests or deployment drills were run for this task update.

Correction: the earlier unchecked list omitted published triage and linked fixes.
The snapshot closes the recorded batch, not the ongoing feedback process.

## Completed

- [x] Publish categorized feedback and fix links. VERIFIED: `docs/testnet-feedback.md` contains 49 distinct issue IDs across its category tables. The fixed categories contain 2 + 21 + 13 + 10 = 46 issues. The other categories contain one deferred issue and two non-bugs. This counts the document, not the live tracker.
- [x] Record the external tester cases and their fixes. REPORTED: `docs/testnet-feedback.md:55-61` records #561/#562 and #565/#568-#571.
- [x] Complete the live retest for #561. REPORTED: Sandro confirmed completion on 2026-09-26. This replaces the earlier pending retest status.

## Remaining work and verification

- [ ] Continue weekly triage and update the published summary as reports arrive.
- [ ] Check that each fixed issue links both its PR and a deployed retest or reporter confirmation. A merged fix alone does not establish the original verification requirement.
- [ ] Check frontend and contract CI evidence for each relevant fix. This task update did not inspect every PR's checks.
- [ ] Compare the published summary with the live tracker on final submission day. The 2026-09-22 snapshot is historical evidence.
