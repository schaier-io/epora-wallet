# Mainnet: beta / unaudited notice

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md)

The proposal commits to going live as a beta and saying so. No external audit has happened; the user must see that before funds move, every time — not in a dismissed-once dialog.

## Completion evidence (2026-09-26)

Checked on `main` at `d3b5a239`: `code/dApp/src/components/layout/beta-notice.tsx` keeps the mainnet notice visible and omits its dismiss button.
`code/dApp/src/app/layout.tsx` renders it; the README's beta-risk section states that no security audit is complete.
The live mainnet browser displayed the unaudited-beta risk acknowledgement before wallet connection.
This closes the implementation task. The earlier requirement for no Preprod notice was inaccurate: Preprod intentionally has a dismissible test-network notice.

## Steps

- [x] Implement the persistent mainnet banner with beta and unaudited-risk wording, without a dismiss button.
- [x] Document beta risks in the README. Public announcement evidence remains a separate Milestone 5 task.
- [x] Key the notice to network configuration: mainnet is not dismissible; Preprod has a test-network notice.

## Done when

- Mainnet notice implementation is network-aware and not dismissible.
- README documents the same beta and unaudited risks.
