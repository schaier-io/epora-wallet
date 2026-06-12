# Mainnet: final validator review + frozen hashes

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md)

Once a wallet exists on mainnet, its validators are immutable for that wallet. Whatever ships is what users live with — review first, then freeze.

## Steps

- [ ] Re-read whitepaper §7 (Security Analysis) and §9.2 (Threats mitigated in practice) against the attack-regression suite — every claimed mitigation has a test that still passes.
- [ ] No open contract-labelled issues; anything open gets fixed or explicitly accepted in writing.
- [ ] Freeze parameters; `aiken build` with the pinned compiler (v1.1.22, matching `aiken.toml`) → `pnpm sync:blueprint` → commit.
- [ ] Tag the release commit; record the final validator hashes from `plutus.json` here and in the milestone evidence.

## Done when

- Hashes recorded against a tagged commit.
- Full Aiken suite + fuzz green on exactly that commit.
- Anything not fixed is a written, dated acceptance — no silent leftovers.
