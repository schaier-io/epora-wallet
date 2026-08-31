# API: developer docs

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the spec](m3-api-04-openapi.md)

The spec is the contract. The README is the on-ramp. Catalyst acceptance
criterion 3 is "documentation of code", and this file plus the off-chain dev
guide are what answer it for the off-chain half.

## Steps

- [ ] Write `docs/api/README.md`: one curl example per endpoint with realistic
      parameters, a pagination walkthrough showing a cursor going in and coming
      back out, and the error shape.
- [ ] Document the transaction-build flow end to end: post an action, receive an
      unsigned transaction with its preview, fee estimate and warnings, sign it
      with your own wallet, submit it. Say plainly that the server never holds a
      key and never signs.
- [ ] State the versioning policy (decision 11): v1 describes the current shape,
      and the compatibility promise begins with the Milestone 5 mainnet beta.
      Do not promise a freeze this milestone cannot keep.
- [ ] State the rate limits and what a `429` means.
- [ ] Say which routes are deliberately not public and why: `mesh`, `stt/sync`,
      `koios/credential-utxos` and `proposals`.
- [ ] Link it from the repository README and from the spec's `info.description`.

## Done when

- Someone outside the project finds a wallet, reads its state and activity, and
  builds one unsigned transaction, using only this README and the spec. Have one
  person actually do it. Do not assume it reads clearly.
