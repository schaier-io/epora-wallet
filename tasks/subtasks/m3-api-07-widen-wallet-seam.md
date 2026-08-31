# API: widen the transaction seam off BrowserWallet

Public API task · [Milestone 3](../milestone-3-ui-development.md) · decisions in [the decision record](m3-api-00-decisions.md)

This is the enabling refactor for the whole transaction API. It lands alone, with
no behaviour change, so the regression surface stays clean. Same reasoning as
[the signer interface task](m3-wc-01-signer-interface.md), and the two should
probably be reviewed together.

## Why it is small

VERIFIED on 2026-08-31. All nine builder files that accept a Mesh `BrowserWallet`
reach it through one function, `setupTransaction` at
[`internals/core.ts:56`](../../code/dApp/src/lib/mesh/transactions/internals/core.ts).
`grep -rln setupTransaction src/lib/mesh/transactions/*.ts` lists exactly those
nine: `consolidate-utxos`, `deploy-shared-reference`, `mint-state-token`,
`set-intended-stake-credential`, `lock-funds`, `wallet-governance`,
`wallet-spend`, `stt-spend` and `wallet-withdraw`.

The surface actually used is four methods, all in
[`internals/utxo.ts`](../../code/dApp/src/lib/mesh/transactions/internals/utxo.ts):
`getUtxos`, `getChangeAddress`, `getUsedAddresses` and `getUnusedAddresses`.
Nothing else on `BrowserWallet` is touched by the build path.

There is a second seam in the same function. `setupTransaction` constructs
`new ServerFetcher()` itself, and that class calls `fetch("/api/mesh")`
([`server-fetcher.ts:31`](../../code/dApp/src/lib/mesh/server-fetcher.ts)). On the
server that would call our own HTTP proxy in a loop, so the fetcher has to be
injectable as well.

## Steps

- [x] Define `WalletSource` with those four methods. Mesh's `BrowserWallet`
      satisfies it structurally, so no browser call site changes.
- [x] Change `setupTransaction`, `resolveWalletUtxos` and `resolveChangeAddress`
      to take `WalletSource` instead of `BrowserWallet`.
- [x] Make the fetcher a parameter of `setupTransaction`, defaulting to
      `new ServerFetcher()` so every existing caller behaves exactly as before.
- [x] Change the nine builder signatures to `WalletSource`. Do not change their
      bodies.
- [x] Confirm no file under `src/lib/mesh/transactions/` imports `BrowserWallet`
      any more, apart from `submit.ts`, which is the signer's business and is
      handled by [the signer interface task](m3-wc-01-signer-interface.md).

## Done when

- `grep -rn BrowserWallet src/lib/mesh/transactions/` returns only `submit.ts`.
- `pnpm test`, `pnpm test:components` and `pnpm typecheck` are green with no test
  edits, because nothing about the browser path changed.
- A manual regression pass on preprod: mint a wallet and run one operator spend,
  and confirm both behave as before.

## What landed, and the one thing that did not

The seam is widened and the browser path is untouched. Two types now carry it,
both in [`tx-context.ts`](../../code/dApp/src/lib/mesh/tx-context.ts):

- `WalletSource` is `Pick<BrowserWallet, "getUtxos" | "getChangeAddress" |
  "getUsedAddresses" | "getUnusedAddresses">`. Deriving it from `BrowserWallet`
  rather than hand-writing four signatures means a CIP-30 wallet satisfies it by
  construction and cannot drift away from it.
- `TxFetcher` is `IFetcher & IEvaluator`, with two deliberate adjustments.
  `fetchProtocolParameters` takes an optional epoch, because every build here
  wants the current parameters and calls it with no argument, which is what both
  concrete providers accept. `get` returns `unknown` rather than IFetcher's
  `any`, which is what `ServerFetcher` returned and what the `isRecord`
  validation in the cost-model refresh assumes.

A second hardcoded fetcher turned up in the budget path:
`buildTransactionWithReestimatedLimits` constructed its own `ServerFetcher` for
`refreshScriptDataHashWithLiveCostModels`. It is now an injectable parameter
with the same browser default.

**Not done, on purpose.** The nine builders still take only a wallet. They do
not accept a `TxFetcher` and do not forward one to `setupTransaction` or to
`buildTransactionWithReestimatedLimits`, so a server-side build would still
reach the browser's `/api/mesh` proxy through those defaults. Threading it moved
to [the server wallet source](m3-api-08-server-wallet-source.md), where the
implementation that needs it lives. This ticket stayed a pure no-behaviour-change
refactor so its regression surface is clean, which is what it promised.

**Outstanding.** The preprod regression pass in "Done when" has not been run. It
needs a funded preprod wallet and a human signing in a browser extension.
