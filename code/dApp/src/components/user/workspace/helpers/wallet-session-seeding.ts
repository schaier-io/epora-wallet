import type { DetectedSttToken } from "@/lib/mesh/detection";

type SeededConfig = {
  walletPolicyId?: string | null;
  walletAssetNameHex?: string | null;
};

export type WalletToSeedParams = {
  detectedTokens: readonly DetectedSttToken[];
  /** The wallet the URL or a click already named, if any. */
  selectedUnit: string;
  /** The wallet to fall back to when nothing is named yet. */
  defaultUnit: string | null;
  config: SeededConfig;
};

/**
 * Which detected wallet still needs its forms seeded, or null when there is nothing to do.
 *
 * Two routes open a wallet and only one of them used to seed anything. A click runs
 * `applyDetectedToken`, which writes the wallet's policy id and asset name into config. A
 * link carrying `?wallet=<unit>` writes the unit straight into the selection, and the
 * session effect read that selection as "already open" and returned. Config kept its empty
 * asset name, so `lockingContractAtom` could not derive the wallet address and answered
 * "Choose a smart wallet first" on a wallet the picker was showing as Opened.
 *
 * So "already open" is not "a unit is selected". It is "config already describes this
 * wallet", which is true after either route and false after neither.
 */
export function resolveWalletToSeed(params: WalletToSeedParams): DetectedSttToken | null {
  const openWalletUnit = params.selectedUnit || params.defaultUnit;

  if (!openWalletUnit) {
    return null;
  }

  const token = params.detectedTokens.find((candidate) => candidate.unit === openWalletUnit);

  if (!token) {
    return null;
  }

  // Seeding also resets every per-action draft, so re-running it on a wallet that is already
  // open would throw away whatever the user has typed since.
  const seeded =
    params.config.walletPolicyId === token.policyId &&
    params.config.walletAssetNameHex === token.assetNameHex;

  return seeded ? null : token;
}
