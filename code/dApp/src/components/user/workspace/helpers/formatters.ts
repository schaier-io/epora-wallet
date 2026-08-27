import { getAssetQuantityByUnit } from "./asset-amounts";
import { isAsset } from "./guards";
import { type AssetSelectionOption } from "@/components/user/workspace/types";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { cardanoscanAddressUrl, cardanoscanTransactionUrl } from "@/lib/cardano-network";
import { countAdminUsersInStateForm, stateFormFromDatum } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { type Asset } from "@/lib/types/contracts";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { shortenAddress, shortenIdentifier } from "@/lib/utils/explorer";
import { type UTxO } from "@meshsdk/core";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersFormatters.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersFormatters", defaultMessages);

// Re-exported so existing barrel consumers keep working; the single
// implementation lives in lib/utils/explorer.ts.
export { shortenAddress };

export function buildCardanoscanTransactionUrl(hash: string) {
  return cardanoscanTransactionUrl(hash);
}

export function buildCardanoscanAddressUrl(address: string) {
  return cardanoscanAddressUrl(address);
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
        availableLabel: i18n("available", {
          quantity: displayQuantity,
          symbol: identity.symbol
        }),
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
  fallback = i18n("noAmountYet")
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

export function formatTimestampLabel(value: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }

  return i18n("timestamp", {
    date: defaultFormatter.dateTime(date, "short"),
    value
  });
}

export function formatInputRefLabel(txHash: string, outputIndex: number) {
  return `${txHash}#${outputIndex}`;
}

export function formatCompactHash(hash: string) {
  return shortenIdentifier(hash, 10, 6);
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

  return defaultFormatter.dateTime(normalized, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatWalletTransactionRelative(value?: number) {
  const normalized = normalizeBlockTimeMs(value);
  if (normalized === null) return null;
  const now = Date.now();
  const diffMs = now - normalized;
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 60) return i18n("justNow");
  if (absSec < 86400 * 7) {
    return defaultFormatter.relativeTime(normalized, { now, style: "narrow" });
  }
  return null;
}

export function formatWalletTransactionAmountSummary(assets: Asset[]) {
  const lovelace = getAssetQuantityByUnit(assets, "lovelace");
  const tokenTypeCount = assets.filter((asset) => asset.unit !== "lovelace").length;

  if (BigInt(lovelace) === 0n && tokenTypeCount === 0) {
    return i18n("noBalanceChange");
  }

  if (tokenTypeCount === 0) {
    return `${formatLovelaceAsAda(lovelace)} ₳`;
  }

  return i18n("adaAndTokenTypes", {
    ada: formatLovelaceAsAda(lovelace),
    tokenTypeCount
  });
}

export function formatActivityAddressLabel(
  address: string | null | undefined,
  walletAddress: string,
  activeAddress?: string | null
) {
  if (!address) {
    return i18n("unknownAddress");
  }

  if (address === walletAddress) {
    return i18n("thisSmartWallet");
  }

  if (activeAddress && address === activeAddress) {
    return i18n("connectedWallet");
  }

  return shortenAddress(address);
}

export function formatActivityActorDetail(address: string | null | undefined) {
  return address ? shortenAddress(address) : null;
}

export function formatActivityUtxoAmount(utxo: UTxO) {
  const assets = utxo.output.amount.filter(isAsset);

  if (assets.length <= 3) {
    return formatReceiptAmountSummary(assets, i18n("noAssets"));
  }

  return formatWalletTransactionAmountSummary(assets);
}

export function formatDetectedTokenLabel(token: DetectedSttToken) {
  const stateForm = stateFormFromDatum(token.datum);
  const adminCount = countAdminUsersInStateForm(stateForm);
  const walletName = normalizeWalletName(stateForm.walletName);

  return i18n("walletOwners", {
    walletName,
    ownerCount: adminCount
  });
}

// WalletHeroCard + WalletIdentityOrb live in their own module now. See
// ./wallet-hero-card.tsx — re-imported below so existing call sites continue
// to work without churn. LockedAssetsOverviewPanel + MicroSparkline + asset
// classification helpers moved to ./locked-assets-panel.tsx.
