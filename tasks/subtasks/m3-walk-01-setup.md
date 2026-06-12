# Walkthrough: test wallets + timing setup

Feature walkthrough task · [Milestone 3](../milestone-3-ui-development.md)

Two rows of the [walkthrough script](m3-walk-02-run.md) have long lead times — set them up first, run everything else while they ripen.

## Steps

- [ ] Create the main test wallet through the app on preprod; fund it from the faucet. Throwaway keys, nothing reused.
- [ ] Create a second wallet with a short proof-of-life increment, so the deadline can lapse within a test session — that's the only way to exercise beneficiary withdrawal (script row 9) without waiting weeks.
- [ ] Set the stake credential and delegate on the main wallet immediately (script row 13). Preprod epochs are 5 days and rewards arrive epochs after delegation — row 14 (claim rewards) only works much later. Start the clock now.

## Done when

- Both wallets exist on preprod and are funded.
- Delegation is submitted and the date is noted, so it's clear when row 14 becomes runnable.
- The short-deadline wallet's lapse time is written down.
