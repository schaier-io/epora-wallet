import { getAssetQuantityByUnit } from "./asset-amounts";
import { isAsset } from "./guards";
import { type AssetSelectionOption } from "@/components/user/workspace/types";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { countAdminUsersInStateForm, stateFormFromDatum } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { type Asset } from "@/lib/types/contracts";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { type UTxO } from "@meshsdk/core";

export function shortenAddress(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  if (value.length <= 22) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

export function buildCardanoscanTransactionUrl(hash: string) {
  return `https://preprod.cardanoscan.io/transaction/${hash}`;
}

export function buildCardanoscanAddressUrl(address: string) {
  return `https://preprod.cardanoscan.io/address/${address}`;
}

function formatAssetQuantityForUi(asset: { unit: string; quantity: string }) {
  if (asset.unit === "lovelace") {
    return `${formatLovelaceAsAda(asset.quantity)} ₳`;
  }

  return `${asset.quantity} ${resolveAssetIdentity(asset.unit).symbol}`;
}

// AssetKind, classifyAssetKind, getAssetKindLabel, getAssetIcon, and
// formatAssetQuantityDisplay now live in ./locked-assets-panel.tsx alongside
// the panel that consumed them.

export function buildAssetSelectionOptions(assets: Asset[]): AssetSelectionOption[] {
  return [...assets]
    .sort((left, right) => {
      if (left.unit === "lovelace") return -1;
      if (right.unit === "lovelace") return 1;
      const leftId = resolveAssetIdentity(left.unit);
      const rightId = resolveAssetIdentity(right.unit);
      // Known assets sort ahead of unknown ones.
      const leftKnown = leftId.knownMeta ? 0 : 1;
      const rightKnown = rightId.knownMeta ? 0 : 1;
      if (leftKnown !== rightKnown) return leftKnown - rightKnown;
      return leftId.symbol.localeCompare(rightId.symbol);
    })
    .map((asset) => {
      const identity = resolveAssetIdentity(asset.unit);
      const displayQuantity =
        asset.unit === "lovelace" ? formatLovelaceAsAda(asset.quantity) : asset.quantity;
      const label = identity.knownMeta
        ? `${identity.symbol} · ${identity.knownMeta.name}`
        : identity.symbol;
      return {
        unit: asset.unit,
        label,
        availableLabel: `${displayQuantity} ${identity.symbol} available`,
        searchableText: `${identity.symbol} ${identity.name} ${asset.unit} ${asset.quantity}`.toLowerCase(),
        maxQuantity: asset.quantity
      };
    });
}

export function formatAmountSummary(amount: Array<{ unit: string; quantity: string }>) {
  return amount.map((asset) => formatAssetQuantityForUi(asset)).join(", ");
}

export function formatReceiptAmountSummary(
  amount: Array<{ unit: string; quantity: string }>,
  fallback = "No amount added yet"
) {
  const summary = formatAmountSummary(
    amount.filter((asset) => asset.unit.trim() && asset.quantity.trim())
  );

  return summary || fallback;
}

export function formatSignedAmountSummary(amount: Array<{ unit: string; quantity: string }>) {
  return amount
    .map((asset) => {
      const quantity = BigInt(asset.quantity);
      const sign = quantity > 0n ? "+" : quantity < 0n ? "-" : "";
      const absoluteQuantity = quantity < 0n ? -quantity : quantity;
      return `${sign}${formatAssetQuantityForUi({
        unit: asset.unit,
        quantity: absoluteQuantity.toString()
      })}`;
    })
    .join(", ");
}

export function formatTransferControlId(unit: string) {
  return unit.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatAssetNameHex(assetNameHex: string) {
  if (assetNameHex.length <= 24) {
    return assetNameHex;
  }

  return `${assetNameHex.slice(0, 12)}...${assetNameHex.slice(-8)}`;
}

export function formatTimestampLabel(value: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }

  return `${date.toLocaleString()} (${value})`;
}

export function formatInputRefLabel(txHash: string, outputIndex: number) {
  return `${txHash}#${outputIndex}`;
}

export function formatCompactHash(hash: string) {
  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function normalizeBlockTimeMs(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value >= 1_000_000_000_000 ? value : value * 1000;
}

export function formatWalletTransactionTime(value?: number) {
  const normalized = normalizeBlockTimeMs(value);

  if (normalized === null) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(normalized);
}

export function formatWalletTransactionRelative(value?: number) {
  const normalized = normalizeBlockTimeMs(value);
  if (normalized === null) return null;
  const diffMs = Date.now() - normalized;
  const absSec = Math.abs(diffMs) / 1000;
  const suffix = diffMs >= 0 ? "ago" : "from now";
  if (absSec < 60) return `just now`;
  if (absSec < 3600) return `${Math.round(absSec / 60)}m ${suffix}`;
  if (absSec < 86400) return `${Math.round(absSec / 3600)}h ${suffix}`;
  if (absSec < 86400 * 7) return `${Math.round(absSec / 86400)}d ${suffix}`;
  return null;
}

export function formatWalletTransactionAmountSummary(assets: Asset[]) {
  const lovelace = getAssetQuantityByUnit(assets, "lovelace");
  const tokenTypeCount = assets.filter((asset) => asset.unit !== "lovelace").length;

  if (BigInt(lovelace) === 0n && tokenTypeCount === 0) {
    return "no balance change";
  }

  if (tokenTypeCount === 0) {
    return `${formatLovelaceAsAda(lovelace)} ₳`;
  }

  return `${formatLovelaceAsAda(lovelace)} ₳, ${tokenTypeCount} token type${
    tokenTypeCount === 1 ? "" : "s"
  }`;
}

export function formatActivityAddressLabel(
  address: string | null | undefined,
  walletAddress: string,
  activeAddress?: string | null
) {
  if (!address) {
    return "Unknown address";
  }

  if (address === walletAddress) {
    return "This smart wallet";
  }

  if (activeAddress && address === activeAddress) {
    return "Connected wallet";
  }

  return shortenAddress(address);
}

export function formatActivityActorDetail(address: string | null | undefined) {
  return address ? shortenAddress(address) : null;
}

export function formatActivityUtxoAmount(utxo: UTxO) {
  const assets = utxo.output.amount.filter(isAsset);

  if (assets.length <= 3) {
    return formatReceiptAmountSummary(assets, "No assets");
  }

  return formatWalletTransactionAmountSummary(assets);
}

export function formatDetectedTokenLabel(token: DetectedSttToken) {
  const stateForm = stateFormFromDatum(token.datum);
  const adminCount = countAdminUsersInStateForm(stateForm);
  const adminLabel = adminCount > 0 ? `admin ${adminCount}` : "no admin";
  const walletName = normalizeWalletName(stateForm.walletName);

  return `${walletName} - ${formatAssetNameHex(token.assetNameHex)} - ${token.utxo.input.txHash.slice(0, 10)}#${token.utxo.input.outputIndex} - ${adminLabel}`;
}

export function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// WalletHeroCard + WalletIdentityOrb live in their own module now. See
// ./wallet-hero-card.tsx — re-imported below so existing call sites continue
// to work without churn. LockedAssetsOverviewPanel + MicroSparkline + asset
// classification helpers moved to ./locked-assets-panel.tsx.

