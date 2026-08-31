import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";
import { deserializeAddress } from "@meshsdk/core";

// The app targets preprod only (`NETWORK` in transactions/internals/constants,
// `STT_CACHE_NETWORK` in lib/stt-cache/domain). Testnet payment addresses carry
// the `addr_test` HRP, so a mainnet `addr1...` is rejected here rather than
// resolved against the wrong chain.
const PREPROD_ADDRESS_PREFIX = "addr_test1";

/** A caller-supplied address the server cannot build from. Routes map it to 400. */
export class ServerWalletAddressError extends Error {}

/**
 * Validate a build request's address before it costs any provider quota.
 *
 * Runs entirely offline: a bech32 decode for the shape and an HRP check for the
 * network. Both failures are the caller's, so they must not reach Blockfrost.
 */
export function assertServerWalletAddress(value: string) {
  const address = value.trim();

  if (address.length === 0) {
    throw new ServerWalletAddressError("A Cardano address is required.");
  }

  if (!address.startsWith(PREPROD_ADDRESS_PREFIX)) {
    throw new ServerWalletAddressError(
      `Address "${address}" is not a preprod address. Expected a \`${PREPROD_ADDRESS_PREFIX}...\` payment address.`
    );
  }

  try {
    deserializeAddress(address);
  } catch {
    throw new ServerWalletAddressError(
      `Address "${address}" is not a valid Cardano address.`
    );
  }

  return address;
}

/**
 * A `WalletSource` built from an address alone, for server-side builds where
 * there is no connected wallet and no signing key.
 *
 * `getUtxos` returns empty on purpose. `resolveWalletUtxos` then falls back to
 * `fetcher.fetchAddressUTxOs` over the addresses below — the path the browser
 * already uses when a wallet reports nothing, and the reason this needs no new
 * UTxO-fetching code.
 *
 * Provider cost per build is fixed, and the caller cannot inflate it. Every
 * method reports the same address, so the fallback dedupes to one candidate and
 * therefore one address fetch per `setupTransaction`. The budget loop in
 * `buildTransactionWithReestimatedLimits` calls `prepareTx` exactly twice
 * (draft, then re-estimated final), so a build makes two address fetches. There
 * is no retry loop and no caller-controlled multiplier.
 *
 * Collateral needs no special handling: `setupTransaction` stubs the CIP-30
 * `getCollateral` to `[]` and always takes the manual path, which selects the
 * smallest pure-ADA UTxO worth at least `MIN_COLLATERAL_LOVELACE` out of the
 * resolved set. That selection reads the UTxO array, never the wallet, so an
 * address-fetched set behaves identically to a wallet-reported one.
 */
export function createAddressWalletSource(address: string): WalletSource {
  const walletAddress = assertServerWalletAddress(address);

  return {
    getUtxos: async () => [],
    getChangeAddress: async () => walletAddress,
    getUsedAddresses: async () => [walletAddress],
    getUnusedAddresses: async () => []
  };
}

/**
 * Chain access for a server-side build: Blockfrost directly, rather than the
 * browser's `/api/mesh` proxy, which exists only to keep the project id out of
 * the client and would make the server call itself over HTTP.
 */
export function createServerTxFetcher(): TxFetcher {
  return getBlockfrostProvider();
}
