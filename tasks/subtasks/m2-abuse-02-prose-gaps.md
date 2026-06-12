# Abuse writeup: prose for tested-but-unwritten attacks

Reviewer-docs task · [Milestone 2](../milestone-2-smart-contract.md) · Catalyst criterion: "abuse vectors are spelled out and shown not to work"

Input: the tests-without-prose gap list from [m2-abuse-01](m2-abuse-01-crossmap.md). Constraint: the whitepaper is the canonical security doc and stays free of test names and volatile counts — test linkage lives only in the map ([m2-abuse-04](m2-abuse-04-publish.md) decides where the map lives). So a gap is filled at one of two levels, not both.

## Steps

- [ ] For each flagged test, write its map row in plain words: the attack story, the validator rule that rejects it, the reproducing test name.
- [ ] Only if the attack *class* is genuinely absent from the whitepaper (not merely unnamed): add it as a *Security Analysis* invariant item (house style: asset, invariant, enforcement), cross-references by section name, no test names or counts.
- [ ] If the whitepaper changed: rebuild the PDF with Tectonic per [whitepaper/README.md](../../whitepaper/README.md) and confirm a clean build.
- [ ] Keep design rationale whitepaper-side; the map stays a pointer table, not a second design doc.

## Done when

- The tests-without-prose list is empty: every attack-log test has a plain-words map row, and any new whitepaper invariant builds clean with no test names or volatile counts.
