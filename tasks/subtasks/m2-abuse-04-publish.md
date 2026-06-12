# Abuse writeup: publish the reviewer map

Reviewer-docs task · [Milestone 2](../milestone-2-smart-contract.md) · Catalyst criterion: "abuse vectors are spelled out and shown not to work"

The map's home. The contracts [README](../../code/smart-contract/README.md) "Security documentation" section points at the whitepaper sections by name but carries no per-test linkage; its "Role Model & Trust Boundaries" section already names `security_intentional__*` tests, so test names in the README are established practice. The README is ~290 lines — a 30-some-row table fits under the 750 cap, but if it dominates the file, a sibling doc (e.g. `SECURITY.md` next to the README) linked from that section is the alternative. Not the whitepaper, and not a re-created `docs/` tree.

## Steps

- [ ] Place the finished two-way map (README security section, or sibling doc linked from it) with a short reviewer preamble: how to read it in both directions (prose → test, test → prose) and that `aiken check` runs the whole suite.
- [ ] Rows name tests verbatim so the map is grep-verifiable against the suite — a renamed or deleted test shows up as a dead row; note that property in the preamble.
- [ ] Keep hard-coded totals out of the surrounding prose (counts rot; the rows are the count).
- [ ] Update [Milestone 2](../milestone-2-smart-contract.md): check the writeup boxes and add the map link under Evidence.

## Done when

- A reviewer can answer the Catalyst criterion from one link, in both directions.
- Every test named in the map exists verbatim in the suite (spot-check by grep).
