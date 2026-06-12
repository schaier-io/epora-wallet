# Milestone 5 — Mainnet Beta & Closeout

Go live on mainnet as a beta (not externally audited, and we say so), keep fixing, talk to wallet teams if interested, wrap up with the closeout report + video.

## Development tasks

- [ ] **Mainnet deploy** — preprod is hardcoded today; make the network a config, then a careful small-funds rollout flagged as unaudited beta.
  - [ ] [Network as configuration (`CARDANO_NETWORK`, grep audit)](subtasks/m5-mainnet-01-network-config.md)
  - [ ] [Final validator review + frozen hashes](subtasks/m5-mainnet-02-validator-freeze.md)
  - [ ] [Production environment + separate database](subtasks/m5-mainnet-03-prod-env.md)
  - [ ] [Beta / unaudited notice, not dismissible](subtasks/m5-mainnet-04-beta-banner.md)
  - [ ] [Reference store + small-funds smoke, recorded](subtasks/m5-mainnet-05-store-smoke.md)
- [ ] **Hardening** — notice problems before users report them; survive losing the cache DB.
  - [ ] [Health endpoint + alerting, tested by stopping the cron](subtasks/m5-harden-01-health-alerts.md)
  - [ ] [Backups + restore drill + from-zero re-index, timed](subtasks/m5-harden-02-backups-drill.md)
  - [ ] [Mainnet economics table (fees, min-ADA, consolidation under 16 KB)](subtasks/m5-harden-03-economics.md)
  - [ ] [Abuse caps — sync triggers, proposal bounds, pruning](subtasks/m5-harden-04-abuse-caps.md)
  - [ ] [Sweep the `next`-labelled testnet carry-overs](subtasks/m5-harden-05-carryovers.md)

## Non-development tasks

- [ ] Announce beta + clear "unaudited" notice in UI and docs.
- [ ] Keep sorting feedback/bugs.
- [ ] Wallet-integration thread + talk to interested devs.
- [ ] Closeout report + video.

## Acceptance criteria (Catalyst)

- A working mainnet prototype
- Feedback / bugs, categorized
- Some communication with wallet developers (if they or the community ask for it)
- The closeout report and video

## Evidence

- Link to the mainnet prototype
- Link to the categorized feedback
- Link to the wallet-integration discussion
- Link to the closeout report
- Link to the closeout video
