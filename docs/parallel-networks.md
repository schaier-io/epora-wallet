# Parallel Mainnet and Preprod deployments

REPORTED: The operator will configure Vercel. This change supplies a visitor
switch between two deployments; it does not change the active network in place.

VERIFIED from source: `src/lib/cardano-network.ts` selects the network at build
time. `src/lib/network-deployments.ts` reads the two public origins. The switch
opens the other network's `/user` page without wallet IDs, proposal IDs, query
parameters, or fragments. Missing destinations appear as unavailable.

## Vercel setup

Create two projects from the same release commit. Use `code/dApp` as each
project's root and Node 24. Give each project a different hostname and its own
database. Two ports on one hostname do not isolate cookies.

VERIFIED: `code/dApp/vercel.json` enables automatic Git deployments only for
`main`. A feature-branch push alone will not deploy these projects.

Example hostnames below preserve the existing Preprod domain. They are proposed
configuration, not evidence that the Mainnet hostname is deployed.

| Variable | Mainnet project | Preprod project |
| --- | --- | --- |
| `NEXT_PUBLIC_CARDANO_NETWORK` | `mainnet` | `preprod` |
| `NEXT_PUBLIC_SITE_URL` | `https://mainnet.epora.io` | `https://epora.io` |
| `NEXT_PUBLIC_MAINNET_URL` | `https://mainnet.epora.io` | `https://mainnet.epora.io` |
| `NEXT_PUBLIC_PREPROD_URL` | `https://epora.io` | `https://epora.io` |
| Provider secret | `BLOCKFROST_MAINNET_PROJECT_ID` | `BLOCKFROST_PREPROD_PROJECT_ID` |

1. Configure a separate `DATABASE_URL` and apply reviewed migrations to each
   project's database. Do not reuse the Preprod database for Mainnet.
2. Generate distinct `PROPOSAL_AUTH_SECRET` and `STT_SYNC_SECRET` values for each
   deployment. Set that project's `CRON_SECRET` to its `STT_SYNC_SECRET`.
3. Leave `KOIOS_URL` unset to use the selected network's default. Leave
   `SHARED_STT_REFERENCE` unset until a reference on that network is verified.
   Do not copy a Preprod reference into Mainnet. Configure WalletConnect domain
   permissions for both hosts if mobile pairing is enabled.
4. Deploy both projects. Confirm each reports its intended network and has a
   healthy database/indexer. Set both public switch URLs only when both targets
   are ready, then rebuild both deployments. These variables are not runtime
   toggles. Complete the remaining mainnet release checks before public launch.
5. Check the switch before consent and after entry on each host. The destination
   must show the correct network and its own consent state. Switch the external
   wallet to the destination network before signing; the site cannot change an
   extension's selected network for the user.

The URL parser accepts HTTPS origins only, except HTTP loopback origins for
local verification. It rejects paths, credentials, queries, fragments, and two
destinations on the same hostname. Keep auth cookies host-only; do not add a
parent-domain cookie shared by the two deployments.

## Local verification

VERIFIED: Focused switch, gate, and navigation component tests returned
`Test Files 3 passed (3)` and `Tests 18 passed (18)`. Destination, landmark,
and breakpoint unit tests returned `tests 18`, `pass 18`, `fail 0`.
TypeScript, targeted ESLint, and both network-specific
Webpack production builds exited `0` under Node 24. The translation script
ran through the installed pnpm runtime and also exited `0`.

VERIFIED: With the previous gate and header source in an isolated copy, the
new assertions returned `2 failed | 13 passed (15)`, exit `1`. Restoring the
current source leaves the local preview unchanged.

VERIFIED: Browser clicks opened `http://localhost:3018/user` from Mainnet,
then `http://127.0.0.1:3017/user` from Preprod. Each showed its network warning
and five unchecked acknowledgements, with Terms first. No terms were accepted
and no transaction was signed. Component tests cover the switch after entry;
the browser check covered the consent screen only.

## Release limits

INFERRED: Source checks do not prove that Vercel secrets, provider accounts,
DNS, migrations, cron, or actual Mainnet transactions work. The operator must
verify these settings. The switch does not deploy contracts or move funds.
See [mainnet beta release preparation](mainnet-beta-release.md) for contract,
privacy, and legal review conditions.
