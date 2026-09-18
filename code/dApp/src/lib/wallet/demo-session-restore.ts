// Decision for the demo session WalletProvider tries to restore after a reload.
// Discovery hides the demo wallet whenever real extension wallets are installed
// (see `withDemoWalletFallback`), so a saved demo session can never rejoin the
// list once that scan settles. Naming the outcome keeps the restore effect from
// waiting forever on a wallet that will never appear.

export type SavedDemoSessionDecision = "wait" | "restore" | "abandon";

export function decideSavedDemoSessionRestore(input: {
  /** True once the first extension scan has settled, found wallets or not. */
  walletsLoaded: boolean;
  /** True when the discovered wallet list currently offers the demo wallet. */
  demoWalletDiscovered: boolean;
}): SavedDemoSessionDecision {
  if (!input.walletsLoaded) {
    return "wait";
  }
  return input.demoWalletDiscovered ? "restore" : "abandon";
}
