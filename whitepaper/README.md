# Whitepaper

LaTeX source for the project whitepaper, plus its exported PDF — read it at
[whitepaper.pdf](whitepaper.pdf). Source files are kept here so future
contributors can update the document when needed.

The whitepaper is the principal deliverable of **Milestone 1 (Setup, Whitepaper,
Planning)** of the Catalyst Fund 11 proposal *"(Dead-man-switch) Permission-Based
Wallet"*, and has since been kept in step with the implementation: it documents
the design that the contracts and frontend in this repository actually ship, not
an aspirational one.

## What's inside

After an introduction and EUTXO background, the document states the design goals
and threat model, then builds the system up:

- **System Architecture** — features-as-configuration, the state-thread token
  (STT) and the two-validator handshake, why enforcement is split across two
  contracts, datum-free receiving, and stake-credential pinning.
- **Permission and Recovery Model** — owners, per-day allowances, weighted
  multi-signature, the proof-of-life dead-man-switch, weighted-share beneficiary
  recovery, and streaming payments with permission-less settlement.
- **Formal Model** — the state space, transitions, and enforced invariants
  stated as theorems with proof sketches, mirroring the Aiken types and on-chain
  checks.
- **Security Analysis** — asset-based: each protocol asset, the invariant
  defended for it, and how the validators enforce it. Each invariant is backed
  by a regression test in the contract suite that reproduces the attack.
- **Limitations and Trust Assumptions** — what the design deliberately does not
  protect against, stated plainly.
- **Use Cases, Related Work, Implementation** — concrete configurations
  (inheritance, vesting, shared treasuries), prior art, and the
  contracts/frontend stack.

Content is grounded in the Catalyst proposal (problem, solution, and the
five-milestone plan), the on-chain validators and their test suite under
[code/smart-contract/](../code/smart-contract/README.md),
and the reference frontend under [code/dApp/](../code/dApp/README.md).
When the implementation changes in a way the document describes, the whitepaper
is updated alongside.

## Files

| File | Purpose |
|---|---|
| `whitepaper.tex` | Main document (the whitepaper). |
| `preamble.tex` | Packages, brand palette, glossary entries, custom boxes. |
| `references.bib` | Bibliography (BibTeX, IEEEtran style). |
| `images/` | Logo used on the title page. |
| `whitepaper.pdf` | The committed build output. |

## Status

**v1.0, aligned with the Preprod prototype.** The Milestone 1 whitepaper
deliverable is complete: abstract, introduction, general functionality, the
permission system and its possible permissions, and example use-cases. The
document remains a living reference and is updated alongside the contract and
frontend milestones; external-review language and release polish will follow
before a mainnet beta.

## Building the PDF

The document uses KOMA-Script (`scrartcl`), `glossaries-extra` (via
`\printunsrtglossaries`, which needs **no** external `makeglossaries` step),
TikZ, the brand palette, the logo in `images/`, and a BibTeX bibliography in
IEEEtran style.

**Recommended — [Tectonic](https://tectonic-typesetting.github.io/) (~50 MB, no full TeX install):**

```bash
tectonic whitepaper.tex
```

Tectonic fetches only the packages it needs on first run and runs the
bibliography pass internally. This is how the committed `whitepaper.pdf` is
produced (`brew install tectonic` on macOS).

**Alternative — a full TeX distribution (TeX Live / MacTeX / MiKTeX):**

```bash
latexmk -pdf whitepaper.tex
```

You don't strictly need a local toolchain for small edits: the
[whitepaper-autosync workflow](../.github/workflows/whitepaper-autosync.yml)
rebuilds the PDF with Tectonic on every push that touches this folder and
commits the regenerated `whitepaper.pdf` back to the branch when it changed.
Intermediate build artifacts (`.aux`, `.bbl`, `.log`, …) are ignored via
`.gitignore`; only the source and the PDF are tracked.

### Design decisions — please do not revert

These are intentional:

1. **The logo appears only on the title page.** The running page header is a
   text wordmark with no logo image — an opaque logo tile on the white header
   reads as a bordered box. Do not add `\includegraphics` to the header/footer.
2. **One brand bar per page, maximum.** Title page: the single teal line capping
   the navy header band (no footer rule, no rule under the subtitle). Interior
   pages: the single teal header separator line (no footer separator).
3. **`images/logo.png`** is a navy `#001331` tile whose outer frame is recolored
   to exact navy so it dissolves into the title band with no light edge. If you
   regenerate it, keep the background `#001331` or make it fully transparent.
4. **The navy title band overshoots the page corners by 3 mm** so it bleeds past
   the paper edge (no white hairline at the top).
