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
//
// A CARDANO_PROVIDER_URL that is not an http(s) URL is rejected instead of
// being passed to Mesh: Mesh would silently treat it as a Blockfrost project
// id and aim at a host derived from its first seven characters.
import { BlockfrostProvider } from "@meshsdk/core";

/** True when the value parses as an http(s) URL a provider can target. */
function isHttpUrl(value) {
  // Mesh branches to its project-id handling on a case-sensitive prefix
  // check, so an uppercase scheme must be rejected here, not normalized.
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the chain connection from the environment.
 *
 * `network` names the slot config to use for validity ranges. A DevKit devnet
 * starts at the current wall clock with preprod-shaped slot length, so preprod's
 * config is the right one there too — the scripts only ever use it to turn
 * `Date.now()` into an enclosing slot.
 *
 * `env` defaults to `process.env`; tests pass an object instead.
 */
export function resolveProvider(env = process.env) {
  const devnetUrl = env.CARDANO_PROVIDER_URL?.trim();
  if (devnetUrl) {
    if (!isHttpUrl(devnetUrl)) {
      throw new Error(
        `CARDANO_PROVIDER_URL ${JSON.stringify(devnetUrl)} is not a usable ` +
          'provider URL: expected an http(s) URL such as ' +
          '"http://localhost:8080/api/v1/".',
      );
    }
    return {
      provider: new BlockfrostProvider(devnetUrl),
      network: "preprod",
      networkId: 0,
      isDevnet: true,
    };
  }

  const blockfrostApiKey = env.BLOCKFROST_API_KEY;
  if (!blockfrostApiKey) {
    throw new Error(
      "Missing BLOCKFROST_API_KEY (see .env.example), or set CARDANO_PROVIDER_URL " +
        "to a local devnet — `pnpm devnet:up` prints the URL.",
    );
  }
  // Mesh derives the Blockfrost host from the key's own prefix, so a preview-
  // or mainnet-prefixed key would target a ledger that none of the printed
  // links, addresses, or "preprod" metadata describe. The scripts document
  // preprod only, so anything else fails fast instead of lying quietly.
  if (!blockfrostApiKey.startsWith("preprod")) {
    throw new Error(
      "BLOCKFROST_API_KEY must be a preprod-prefixed project key: the scripts " +
        "target the preprod test network (see .env.example). Use a preprod key " +
        "or point CARDANO_PROVIDER_URL at a local devnet.",
    );
  }

  return {
    provider: new BlockfrostProvider(blockfrostApiKey),
    network: "preprod",
    networkId: 0,
    isDevnet: false,
  };
}
