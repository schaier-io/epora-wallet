# Auth: persist the signed terms-and-conditions acceptance

Auth task · [Milestone 3](../milestone-3-ui-development.md)

When a user signs in via [wallet login](m3-auth-01-wallet-login.md), capture their
acceptance of the terms as a wallet signature so we have durable, verifiable proof
of *who* agreed to *which* version *when* — not just a checkbox click.

Bind the signed payload to the terms content, not a bare nonce: include a hash of
the exact terms text (so the wording can't be disputed later), the terms version,
the wallet address, and a timestamp. Reuse the `signData` handshake from the login
nonce so it's the same single signature the user already gives at confirm time.

Storage goes in Postgres via Prisma alongside the STT cache
([schema.prisma](../../code/dApp/prisma/schema.prisma)).

## Steps

- [ ] Pin the terms text under version control; compute a stable content hash for it.
- [ ] Include `{ termsVersion, termsHash, address, issuedAt }` in the payload the
      wallet signs at sign-in (extend the login nonce rather than a second prompt).
- [ ] Verify the signature server-side against the connecting key before accepting.
- [ ] Add a Prisma model storing: payment key hash, address, terms version, terms
      hash, the full signature + signed payload (the CIP-30 key/signature pair),
      and accepted-at. One row per (key, version); don't re-prompt if a valid row
      already exists for the current version.
- [ ] Re-prompt only when the terms version changes.
- [ ] Test: signature verifies, a tampered payload is rejected, and a stored row
      round-trips.

## Done when

- A signed-in wallet has a stored, signature-verifiable record of which terms
  version it accepted, recoverable later; bumping the version re-prompts.
