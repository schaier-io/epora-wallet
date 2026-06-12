# Testnet deploy: smoke pass + recorded evidence

Testnet deploy task · [Milestone 4](../milestone-4-testnet-feedback.md) · after the other deploy subtasks

The deployment exists when a stranger can use it and the milestone evidence is written down, not before.

## Steps

- [ ] On the public URL, with a fresh browser profile: create a wallet → fund it → one operator spend. Keep the tx hashes.
- [ ] Have a second person (different machine, different CIP-30 wallet) repeat it — catches anything that only worked because of the developer's setup.
- [ ] Write the evidence into [the milestone file](../milestone-4-testnet-feedback.md): app URL, validator hashes from `plutus.json`, reference store address, smoke tx hashes.

## Done when

- Both smoke passes succeeded on the public URL.
- The milestone file carries URL + hashes — the Catalyst evidence links resolve.
