# Fix loop: triage, fix, verify, publish

Fix loop task · [Milestone 4](../milestone-4-testnet-feedback.md)

Source evidence as of 2026-09-26, `origin/main` (`d3b5a2391e6f58836752ec40e39eec4139f8d886`).
The source references below establish implementation. Live checks and drills retain their own evidence requirements.

Correction: the earlier unchecked list omitted published triage and linked fixes.
The snapshot closes the recorded batch, not the ongoing feedback process.

## Completed

- [x] Publish categorized feedback and fix links. `docs/testnet-feedback.md` contains 49 distinct issue IDs across its category tables. The fixed categories contain 2 + 21 + 13 + 10 = 46 issues. The other categories contain one deferred issue and two non-bugs. This counts the document, not the live tracker.
- [x] Record the external tester cases and their fixes. `docs/testnet-feedback.md:55-61` records #561/#562 and #565/#568-#571.
- [x] Complete the live retest for #561. Complete by 2026-09-26. This replaces the earlier pending retest status.

## Remaining work and verification

- [ ] Continue weekly triage and update the published summary as reports arrive.
- [ ] Check that each fixed issue links both its PR and a deployed retest or reporter confirmation. A merged fix alone does not establish the original verification requirement.
- [ ] Check frontend and contract CI evidence for each relevant fix. CI results for each PR still need review.
- [ ] Compare the published summary with the live tracker on final submission day. The 2026-09-22 snapshot is historical evidence.
