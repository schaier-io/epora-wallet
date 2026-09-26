# Parallel Mainnet and Preprod deployments

The operator will configure Vercel. This change supplies a visitor
switch between two deployments; it does not change the active network in place.

Source configuration: `src/lib/cardano-network.ts` selects the network at build
time. `src/lib/network-deployments.ts` reads the two public origins. The switch
opens the other network's `/user` page without wallet IDs, proposal IDs, query
parameters, or fragments. It lists the current network and each network with a
configured URL. It stays hidden until you set the other network's URL. It
appears on the consent screen, on the legal pages, and in the Connect wallet
dialog while no wallet is connected.

## Vercel setup

Create two projects from the same release commit. Use `code/dApp` as each
project's root and Node 24. Give each project a different hostname and its own
database. Two ports on one hostname do not isolate cookies.

`code/dApp/vercel.json` enables automatic Git deployments only for
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
5. On each host, check the switch on the consent screen, on a legal page, and in
   the Connect wallet dialog with no wallet connected. The destination must show
   the correct network and its own consent state. Switch the external wallet to
   the destination network before signing; the site cannot change an extension's
   selected network for the user.

The URL parser accepts HTTPS origins only, except HTTP loopback origins for
local verification. It rejects paths, credentials, queries, fragments, and two
destinations on the same hostname. `next build` runs the parser, so a rejected
value fails the build and names the variable. Keep auth cookies host-only; do
not add a parent-domain cookie shared by the two deployments.

## Local verification

Measured on 2026-09-23 on Node v24.21.0 at `b4bb95ef`, with the stack rebased
onto `dev` at `5d936c45`: the dApp CI verify, build and file-length commands
exited `0`, with `pnpm test:unit` in place of the Postgres-backed `pnpm test`.
`pnpm test:components` returned `Test Files 186 passed (186)` and
`Tests 1741 passed (1741)`. `pnpm test:unit` returned `tests 1823`,
`pass 1798`, `fail 0` and `skipped 25`. The skipped tests need
Postgres, which this run did not start. The default Turbopack `pnpm build`
passed, and `pnpm bundle-budget:check` checked 9 routes. `pnpm typecheck`,
`pnpm lint`, `pnpm i18n:check`, `pnpm openapi:check`, the entrypoint budget,
the user-flow helpers and the file-length guard also exited `0`. The run
skipped `pnpm install --frozen-lockfile`. The stack changes neither
`code/dApp/package.json` nor `code/dApp/pnpm-lock.yaml`.

Checked at `b4bb95ef`: `pnpm build` with
`NEXT_PUBLIC_MAINNET_URL=mainnet.epora.io` exited `1` with
`NEXT_PUBLIC_MAINNET_URL must be an HTTPS origin`. With
`https://mainnet.example`, it exited `0`. At `33182cb7`, before the build
check, the same schemeless value passed `pnpm build` with exit `0`. `next start`
then returned `500` for `/`, `/user`, `/terms`, `/privacy` and `/legal`, with
`TypeError: Invalid URL` in the server log. `/robots.txt` returned `200`.

Checked at `b4bb95ef` with local dev servers and a throwaway headless
browser, 375 and 1280 pixels wide unless noted. The browser accepted the terms
locally; no wallet was connected and no transaction was signed.

- Preprod with only `NEXT_PUBLIC_MAINNET_URL=http://127.0.0.1:3017`: the
  consent screen and the Connect wallet dialog showed Preprod as current and
  Mainnet as a link to `http://127.0.0.1:3017/user`. The server-rendered
  `/terms`, `/privacy` and `/legal` pages each held one switch. After
  acceptance, nothing sat above the app header and the page showed no other
  switch. The dialog's Network section read "Each network is a separate site.
  After you switch, set your wallet to that network and connect there."
- Mainnet with only `NEXT_PUBLIC_PREPROD_URL=http://127.0.0.1:3018`: the
  consent screen and the dialog showed Mainnet as current and Preprod as a
  link to `http://127.0.0.1:3018/user`. The three legal pages each held one
  switch. After acceptance, nothing sat above the app header and the page
  showed no other switch.
- Preprod with neither URL, 375 pixels wide: the consent screen, the three
  legal pages and the dialog showed no switch.

Measured on `/terms` with only `NEXT_PUBLIC_MAINNET_URL` set, at 320, 375,
430, 640 and 1280 pixels wide. On the code of `a73b9d76`, the "Back to Epora
Wallet" link started beside the switch, and at 320 and 375 pixels it wrapped
below it. At `b4bb95ef`, after `06522ad4` made the switch block-level, the link
sat below the switch at all five widths. On the consent screen and in the
Connect wallet dialog, the switch box and its gaps did not change at 375 or
1280 pixels.

Checked at `b4bb95ef`: six mutants of the source each failed the dialog,
header or legal-page tests. They hard-coded the dialog condition to Preprod,
dropped its connected-wallet check, dropped its configured-network check,
removed the dialog section, restored the header strip from before the move,
or removed the switch from the legal pages. Each dialog mutant returned
`Tests 2 failed | 12 passed (14)`. The header mutant returned
`Tests 1 failed | 2 passed (3)`. The legal-page mutant returned
`Tests 1 failed | 14 passed (15)`. With
`NEXT_PUBLIC_CARDANO_NETWORK=mainnet`, the dialog tests from `51491cbe`
returned `Tests 2 failed | 10 passed (12)`. The current tests set the network
themselves. With that value, all 14 dialog tests and the new header test pass.

The following results were recorded for the first switch revision, `cf8ffadc`.
That was before networks without a URL were hidden and before the switch moved
into the dialog. These results are retained as historical evidence.

- Focused switch, gate, and navigation component tests returned
  `Test Files 3 passed (3)` and `Tests 18 passed (18)`. Destination,
  landmark, and breakpoint unit tests returned `tests 18`, `pass 18`,
  `fail 0`.
- TypeScript, targeted ESLint, and both network-specific Webpack production
  builds exited `0` under Node 24.
- With the previous gate and header source in an isolated copy, the new
  assertions returned `2 failed | 13 passed (15)`, exit `1`. Restoring the
  current source left the local preview unchanged.
- Browser clicks opened `http://localhost:3018/user` from Mainnet, then
  `http://127.0.0.1:3017/user` from Preprod. Each showed its network warning
  and five unchecked acknowledgements, with Terms first. No terms were
  accepted and no transaction was signed. That check covered the consent
  screen only.

GitHub Actions run `35793274917` at `cf8ffadc` passed its
`pnpm i18n:check` step. Its build job failed at `pnpm bundle-budget:check`.

Correction: an earlier version of this section said component tests cover
the switch after entry. That switch sat in the app header, which no longer has
one. After entry, the switch now sits in the Connect wallet dialog while no
wallet is connected.

Correction: an earlier version of this section said the translation script
exited `0`. That held for `cf8ffadc`, as the CI run above shows. A later
styling commit started a class string with a bare `flex `, which the i18n
static coverage scan reads as copy. At `da01c070`, before
`737bf4e3` fixed the class order, `pnpm i18n:check` exited `1` on
`network-switch.tsx:8`.

## Release limits

Source checks do not prove that Vercel secrets, provider accounts,
DNS, migrations, cron, or actual Mainnet transactions work. The operator must
verify these settings. The switch does not deploy contracts or move funds.
See [mainnet beta release preparation](mainnet-beta-release.md) for contract,
privacy, and legal review conditions.
