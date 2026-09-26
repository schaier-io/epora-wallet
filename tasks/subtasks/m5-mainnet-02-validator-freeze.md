# Mainnet: final validator review + frozen hashes

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md)

Once a wallet exists on mainnet, its validators are immutable for that wallet. Whatever ships is what users live with — review first, then freeze.

## Steps

- [ ] Re-read whitepaper §7 (Security Analysis) and §9.2 (Threats mitigated in practice) against the attack-regression suite — every claimed mitigation has a test that still passes.
- [x] No open contract-labelled issues; anything open gets fixed or explicitly accepted in writing.
- [x] Freeze parameters; `aiken build` with the pinned compiler (v1.1.23, matching `aiken.toml`) → `pnpm sync:blueprint` → commit.
- [ ] Tag the release commit; record the final validator hashes from `plutus.json` here and in the milestone evidence.

## Done when

- Hashes recorded against a tagged commit.
- Full Aiken suite + fuzz green on exactly that commit.
- Anything not fixed is a written, dated acceptance — no silent leftovers.

## Record

Checked on 2026-09-25 at release commit `af80c6fc`. The evidence is in
[Release freeze: validator blueprint](../../docs/mainnet-beta-release.md#release-freeze-validator-blueprint).

- STT validator: `0dac00be80879dcf585cdb9d0acf6e0ecf52c417ded30d8b72d0ebf1`
- STT reference store: `fc20070d1e5379403add6acbf77b233b2f8240821c187b398525de28`
- Wallet validator, before parameters: `5f8f25f5b598548b224efba3082ffbdd33f46ec58274282b63d0d701`
- `plutus.json` SHA-256: `89c81cd914348611e79034cfa804d940924693fe9d90b5763df2aa2ea89c5424`

The rebuild was byte-identical to the committed blueprint and to the dApp
mirror, so there was nothing to commit. No issue was open.

Correction: step 3 first named compiler v1.1.22. `aiken.toml` at `af80c6fc`
pins `compiler = "v1.1.23"`, and the rebuild used v1.1.23.

Open: the release commit has no tag.
