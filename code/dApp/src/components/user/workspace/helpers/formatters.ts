import { getAssetQuantityByUnit } from "./asset-amounts";
import { isAsset } from "./guards";
import { type AssetSelectionOption } from "@/components/user/workspace/types";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { cardanoscanAddressUrl, cardanoscanTransactionUrl } from "@/lib/cardano-network";
import { countAdminUsersInStateForm, stateFormFromDatum } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { type Asset } from "@/lib/types/contracts";
import { formatLovelaceAsAda, splitDurationMillis } from "@/lib/user-flow/guided-helpers";
import { shortenAddress, shortenIdentifier } from "@/lib/utils/explorer";
import { type UTxO, SLOT_CONFIG_NETWORK, slotToBeginUnixTime } from "@meshsdk/core";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersFormatters.json";
import { NETWORK } from "@/lib/mesh/transactions/internals/constants";

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
      // Only join when there is a name after the separator: lovelace's knownMeta
      // carries an empty name, and "ADA ·" left a dangling dot in the picker.
      const label = identity.knownMeta?.name
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
  fallback = i18n("noAmountAddedYet")
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
  return shortenIdentifier(assetNameHex, 12, 8);
}

export function formatTimestampLabel(value: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }

  // The raw millisecond value used to trail the date in parentheses; that is the
  // stored form, not anything the reader can act on.
  return defaultFormatter.dateTime(date, "short");
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

  // Localized, in the reader's own timezone, with the zone named: a chain time in a
  // foreign zone made them do the conversion themselves, and without the year it said
  // nothing about which September it was.
  return defaultFormatter.dateTime(normalized, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

/**
 * Freshly submitted transactions read back without a block time until the indexer catches
 * up; the slot is always present on the tx itself. Converting it with the same slot config
 * the validity window uses lands within a block of the truth — close enough for the
 * relative label, which is the only place a reader meets it.
 */
export function approximateBlockTimeMsFromSlot(slot?: number | string): number | null {
  const numericSlot = typeof slot === "string" ? Number.parseInt(slot, 10) : slot;
  if (typeof numericSlot !== "number" || !Number.isFinite(numericSlot)) {
    return null;
  }

  try {
    return normalizeBlockTimeMs(slotToBeginUnixTime(numericSlot, SLOT_CONFIG_NETWORK[NETWORK]));
  } catch {
    return null;
  }
}

export function formatWalletTransactionRelative(value?: number) {
  const normalized = normalizeBlockTimeMs(value);
  if (normalized === null) return null;
  const diffMs = Date.now() - normalized;
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 60) return i18n("justNow");
  if (absSec < 3600) {
    const count = Math.round(absSec / 60);
    return diffMs >= 0
      ? i18n("relativeMinutesPast", { count })
      : i18n("relativeMinutesFuture", { count });
  }
  if (absSec < 86400) {
    const count = Math.round(absSec / 3600);
    return diffMs >= 0
      ? i18n("relativeHoursPast", { count })
      : i18n("relativeHoursFuture", { count });
  }
  if (absSec < 86400 * 7) {
    const count = Math.round(absSec / 86400);
    return diffMs >= 0
      ? i18n("relativeDaysPast", { count })
      : i18n("relativeDaysFuture", { count });
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

  return i18n("adaAndTokenTypeCount", {
    ada: formatLovelaceAsAda(lovelace),
    count: tokenTypeCount
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
  const adminLabel = adminCount > 0 ? i18n("adminAdmincount", { adminCount: adminCount }) : i18n("noAdmin");
  const walletName = normalizeWalletName(stateForm.walletName);

  return `${walletName} - ${formatAssetNameHex(token.assetNameHex)} - ${token.utxo.input.txHash.slice(0, 10)}#${token.utxo.input.outputIndex} - ${adminLabel}`;
}

export type CountLabelNoun =
  | "asset"
  | "assetRow"
  | "entry"
  | "fundPool"
  | "input"
  | "issue"
  | "limit"
  | "linkedWallet"
  | "newFundPool"
  | "output"
  | "owner"
  | "payment"
  | "payout"
  | "person"
  | "recoveryContact"
  | "scheduledPayment"
  | "walletId";

export function formatCountLabel(count: number, noun: CountLabelNoun) {
  switch (noun) {
    case "asset":
      return i18n("assetCount", { count });
    case "assetRow":
      return i18n("assetRowCount", { count });
    case "entry":
      return i18n("entryCount", { count });
    case "fundPool":
      return i18n("fundPoolCount", { count });
    case "input":
      return i18n("inputCount", { count });
    case "issue":
      return i18n("issueCount", { count });
    case "limit":
      return i18n("limitCount", { count });
    case "linkedWallet":
      return i18n("linkedWalletCount", { count });
    case "newFundPool":
      return i18n("newFundPoolCount", { count });
    case "output":
      return i18n("outputCount", { count });
    case "owner":
      return i18n("ownerCount", { count });
    case "payment":
      return i18n("paymentCount", { count });
    case "payout":
      return i18n("payoutCount", { count });
    case "person":
      return i18n("personCount", { count });
    case "recoveryContact":
      return i18n("recoveryContactCount", { count });
    case "scheduledPayment":
      return i18n("scheduledPaymentCount", { count });
    case "walletId":
      return i18n("walletIdCount", { count });
  }
}

// WalletHeroCard + WalletIdentityOrb live in their own module now. See
// ./wallet-hero-card.tsx, re-imported below so existing call sites continue
// to work without churn. LockedAssetsOverviewPanel + MicroSparkline + asset
// classification helpers moved to ./locked-assets-panel.tsx.

/**
 * A stored duration is milliseconds (`DEFAULT_SAFETY_TIMER_MS` is 30 days written as
 * 2_592_000_000), which is not a size a reader can judge. `splitDurationMillis` already
 * picks the largest whole unit for the duration editor, so prose reusing it names the
 * same amount the same way the editor does.
 */
export function formatDurationMillisLabel(milliseconds: number): string {
  const { amount, unit } = splitDurationMillis(String(milliseconds));
  if (amount.length === 0) {
    return i18n("invalidMillisecondValue", { value: milliseconds });
  }
  const count = Number(amount);
  switch (unit) {
    case "days":
      return i18n("dayCount", { count });
    case "hours":
      return i18n("hourCount", { count });
    case "minutes":
      return i18n("minuteCount", { count });
    default:
      return i18n("millisecondCount", { count });
  }
}
