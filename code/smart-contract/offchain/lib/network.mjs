// Provider/network selection for the off-chain scripts.
//
// The scripts used to hard-code `new BlockfrostProvider(BLOCKFROST_API_KEY)`
// against preprod, which meant the only way to exercise them was a real testnet
// round-trip with a funded key. Mesh's BlockfrostProvider also accepts a full
// base URL, and Yaci DevKit's Yaci Store speaks the Blockfrost API — so pointing
// CARDANO_PROVIDER_URL at a local devnet runs the same scripts, unmodified,
// against a network that starts in seconds and needs no faucet.
//
//   BLOCKFROST_API_KEY=...                      -> preprod (the default)
//   CARDANO_PROVIDER_URL=http://localhost:8080/api/v1/  -> local devnet
import { BlockfrostProvider } from "@meshsdk/core";

/**
 * Resolve the chain connection from the environment.
 *
 * `network` names the slot config to use for validity ranges. A DevKit devnet
 * starts at the current wall clock with preprod-shaped slot length, so preprod's
 * config is the right one there too — the scripts only ever use it to turn
 * `Date.now()` into an enclosing slot.
 */
export function resolveProvider() {
  const devnetUrl = process.env.CARDANO_PROVIDER_URL;
  if (devnetUrl) {
    return {
      provider: new BlockfrostProvider(devnetUrl),
      network: "preprod",
      networkId: 0,
      isDevnet: true,
    };
  }

  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
  if (!blockfrostApiKey) {
    throw new Error(
      "Missing BLOCKFROST_API_KEY (see .env.example), or set CARDANO_PROVIDER_URL " +
        "to a local devnet — `pnpm devnet:up` prints the URL.",
    );
  }

  return {
    provider: new BlockfrostProvider(blockfrostApiKey),
    network: "preprod",
    networkId: 0,
    isDevnet: false,
  };
}
