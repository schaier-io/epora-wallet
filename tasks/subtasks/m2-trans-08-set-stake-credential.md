# Transition: set intended stake credential (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Pinning the stake credential*

## What landed

- [x] `SetIntendedStakeCredential(Option<Credential>)` — admin/multisig only; exactly one `State` field changes (`state_unchanged_except_intended_stake_credential`); no wallet spend ([spend_handlers](../../code/smart-contract/lib/stt/spend_handlers.ak) `eval_set_intended_stake_credential`).
- [x] Isolated from `UpdateState` so a config edit can never re-target delegation; every other action must preserve the field (central gate in `eval_spend` — see [the handshake](m2-arch-02-handshake.md)).

## Verified by

- Attack-log `attack_set_intended_stake_credential_requires_authority`, `attack_non_set_action_cannot_change_intended_stake_credential`; control `security_intentional__admin_can_set_intended_stake_credential`.
