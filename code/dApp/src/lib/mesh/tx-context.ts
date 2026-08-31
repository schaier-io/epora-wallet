import type { IEvaluator, IFetcher, Protocol } from "@meshsdk/common";
import type { BrowserWallet } from "@meshsdk/core";

// What the transaction builders actually take from a wallet: four read methods
// and no signing. Deriving it from BrowserWallet with Pick means a CIP-30 wallet
// satisfies it by construction, so the browser path cannot drift away from it,
// while a server-side source built from an address alone can satisfy it too.
//
// Signing stays out on purpose. It belongs to signAndSubmitTx, not to a build.
export type WalletSource = Pick<
  BrowserWallet,
  "getUtxos" | "getChangeAddress" | "getUsedAddresses" | "getUnusedAddresses"
>;

// Chain access a build needs: reads, plus script evaluation for the execution
// budget. ServerFetcher satisfies it in the browser; a Blockfrost provider
// satisfies it on the server.
//
// fetchProtocolParameters is widened on purpose. Mesh's IFetcher declares the
// epoch as required, but every build here wants the current parameters and
// calls it with no argument, which is what both concrete providers accept.
// Narrowing to IFetcher would force an epoch number the build does not have.
// get() is narrowed rather than widened: IFetcher types it as Promise<any>,
// which defeats the isRecord validation the cost-model refresh already does.
// Promise<unknown> is what ServerFetcher returns and what the callers assume.
export type TxFetcher = Omit<IFetcher, "fetchProtocolParameters" | "get"> &
  IEvaluator & {
    fetchProtocolParameters(epoch?: number): Promise<Protocol>;
    get(url: string): Promise<unknown>;
  };
