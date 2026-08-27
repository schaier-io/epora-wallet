import { calculateAssetDelta, collectAddressAssets, collectUtxoAssets, compareAssetAmounts, countAddressUtxos, countAssetUtxos, utxoContainsAsset } from "./asset-amounts";
import { formatActivityActorDetail, formatSignedAmountSummary, formatWalletTransactionAmountSummary } from "./formatters";
import { dedupeUtxosByRef } from "./transactions";
import { type WalletActivityEvent } from "@/components/user/workspace/types";
import { type TransactionInfo } from "@meshsdk/common";
import { type UTxO } from "@meshsdk/core";
import { createDefaultTranslator } from "@/i18n/default-translator";
import countMessages from "@/i18n/generated/default-en/Counts.json";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersActivity.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersActivity", defaultMessages);
const countI18n = createDefaultTranslator("Counts", countMessages);

function isLikelyScriptAddress(address: string | null | undefined) {
  return Boolean(
    address?.startsWith("addr1w") ||
      address?.startsWith("addr_test1w") ||
      address?.startsWith("addr_test1x") ||
      address?.startsWith("addr1x")
  );
}

function inferWalletActivityActor(
  transaction: TransactionInfo,
  address: string,
  options: {
    sttUnit?: string | null;
    activeAddress?: string | null;
    activeWalletName?: string | null;
  } = {}
) {
  const sttUnit = options.sttUnit;
  const inputs = (transaction.inputs ?? []).filter((utxo) => utxo?.output?.address);
  const connectedInput = options.activeAddress
    ? inputs.find((utxo) => utxo.output.address === options.activeAddress)
    : null;

  if (connectedInput && options.activeAddress) {
    return {
      label: options.activeWalletName ?? i18n("connectedWallet"),
      detail: formatActivityActorDetail(options.activeAddress)
    };
  }

  const externalWalletInput = inputs.find(
    (utxo) => utxo.output.address !== address && !isLikelyScriptAddress(utxo.output.address)
  );

  if (externalWalletInput) {
    return {
      label: i18n("externalWallet"),
      detail: formatActivityActorDetail(externalWalletInput.output.address)
    };
  }

  const walletInput = inputs.find((utxo) => utxo.output.address === address);

  if (walletInput) {
    return {
      label: i18n("smartWallet"),
      detail: i18n("smartWalletFunds")
    };
  }

  const contractInput = inputs.find((utxo) => utxo.output.address !== address);

  if (contractInput) {
    return {
      label: i18n("contractAction"),
      detail: formatActivityActorDetail(contractInput.output.address)
    };
  }

  if (
    sttUnit &&
    (transaction.outputs ?? []).some((utxo) => utxo && utxoContainsAsset(utxo, sttUnit))
  ) {
    return {
      label: i18n("walletCreator"),
      detail: i18n("createdThisWallet")
    };
  }

  // Earlier branches resolve every actor we can identify (external wallet, this
  // wallet, contract, creator). Reaching here means the inputs don't trace to a
  // known party, typical for an incoming top-up from outside, so label it as an
  // external source rather than the jarring "Unknown".
  return {
    label: i18n("externalSource"),
    detail: null
  };
}

export function buildWalletActivityEvents(
  transaction: TransactionInfo,
  address: string,
  options: {
    sttUnit?: string | null;
    currentWalletUtxos?: UTxO[];
    activeAddress?: string | null;
    activeWalletName?: string | null;
  } = {}
) {
  const currentWalletOutputsForTx = (options.currentWalletUtxos ?? []).filter(
    (utxo) =>
      utxo.input.txHash.toLowerCase() === transaction.hash.toLowerCase() &&
      utxo.output.address === address
  );
  const outputUtxos = dedupeUtxosByRef([...transaction.outputs, ...currentWalletOutputsForTx]);
  const rawOutputCountAtAddress = countAddressUtxos(transaction.outputs, address);
  const inputCountAtAddress = countAddressUtxos(transaction.inputs, address);
  const outputCountAtAddress =
    rawOutputCountAtAddress > 0 ? rawOutputCountAtAddress : currentWalletOutputsForTx.length;
  const inputsAtAddress = collectAddressAssets(transaction.inputs, address);
  const rawOutputsAtAddress = collectAddressAssets(transaction.outputs, address);
  const outputsAtAddress =
    rawOutputsAtAddress.length > 0
      ? rawOutputsAtAddress
      : collectUtxoAssets(currentWalletOutputsForTx);
  const spendsFromWallet = inputCountAtAddress > 0 || inputsAtAddress.length > 0;
  const sendsToWallet = outputCountAtAddress > 0 || outputsAtAddress.length > 0;
  const sttInputCount = options.sttUnit ? countAssetUtxos(transaction.inputs, options.sttUnit) : 0;
  const sttOutputCount = options.sttUnit ? countAssetUtxos(transaction.outputs, options.sttUnit) : 0;
  const sttTouched = sttInputCount > 0 || sttOutputCount > 0;
  const sttCreated = sttOutputCount > 0 && sttInputCount === 0;
  const amountComparison = compareAssetAmounts(inputsAtAddress, outputsAtAddress);
  const walletChange = calculateAssetDelta(inputsAtAddress, outputsAtAddress);
  const walletChangeSummary =
    walletChange.length > 0 ? formatSignedAmountSummary(walletChange) : i18n("noNetBalanceChange");
  const walletFundSummary =
    inputCountAtAddress || outputCountAtAddress
      ? i18n("value1UsedValue2Created", { value1: countI18n("fundPool", { count: inputCountAtAddress }), value2: countI18n("fundPool", { count: outputCountAtAddress }) })
      : i18n("noWalletFundPoolsChanged");
  const sttIoSummary = i18n("value1AndValue2", { value1: countI18n("input", { count: sttInputCount }), value2: countI18n("output", { count: sttOutputCount }) });
  const actor = inferWalletActivityActor(transaction, address, {
    sttUnit: options.sttUnit,
    activeAddress: options.activeAddress,
    activeWalletName: options.activeWalletName
  });
  const baseDetails = [
    { label: i18n("triggeredBy"), value: actor.detail ? `${actor.label} (${actor.detail})` : actor.label },
    { label: i18n("walletChange"), value: walletChangeSummary },
    { label: i18n("walletFunds"), value: walletFundSummary },
    {
      label: i18n("transaction"),
      value: i18n("value1AndValue2", {
        value1: countI18n("source", { count: transaction.inputs.length }),
        value2: countI18n("destination", { count: outputUtxos.length })
      })
    }
  ];
  const withSttDetails = (details: Array<{ label: string; value: string }>) =>
    sttTouched ? [...details, { label: i18n("walletToken"), value: sttIoSummary }] : details;
  const createEvent = (
    kind: string,
    data: Omit<
      WalletActivityEvent,
      "id" | "transaction" | "actorLabel" | "actorDetail" | "inputUtxos" | "outputUtxos"
    >
  ): WalletActivityEvent => ({
    id: `${transaction.hash}:${kind}`,
    transaction,
    actorLabel: actor.label,
    actorDetail: actor.detail,
    inputUtxos: transaction.inputs,
    outputUtxos,
    ...data
  });
  const events: WalletActivityEvent[] = [];

  if (sttCreated) {
    events.push(
      createEvent("created", {
        label: i18n("created"),
        title: i18n("walletCreated"),
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: i18n("itsPeopleRulesAndOnChainIdentityAre"),
        amountSummary: i18n("newWallet"),
        amountClassName: "text-emerald-100",
        details: withSttDetails(baseDetails)
      })
    );
  }

  if (sendsToWallet && sttCreated) {
    events.push(
      createEvent("initial-top-up", {
        label: i18n("topUp"),
        title: i18n("initialTopUp"),
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: i18n("starterFundsWereAddedValue1", { value1: formatWalletTransactionAmountSummary(outputsAtAddress) }),
        amountSummary: walletChangeSummary,
        amountClassName: "text-emerald-100",
        details: withSttDetails(baseDetails)
      })
    );

    return events;
  }

  if (events.length > 0) {
    return events;
  }

  if (spendsFromWallet && sendsToWallet) {
    if (amountComparison === "equal") {
      if (inputCountAtAddress > outputCountAtAddress) {
        return [
          createEvent("consolidated", {
            label: i18n("tidied"),
            title: i18n("fundsMerged"),
            badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
            summary: i18n("severalWalletFundPoolsWereMergedWithoutChanging"),
            amountSummary: walletChangeSummary,
            amountClassName: "text-sky-100",
            details: withSttDetails(baseDetails)
          })
        ];
      }

      if (inputCountAtAddress < outputCountAtAddress) {
        return [
          createEvent("split", {
            label: i18n("split"),
            title: i18n("fundsSplit"),
            badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
            summary: i18n("walletFundsWereSplitIntoMoreSpendablePools"),
            amountSummary: walletChangeSummary,
            amountClassName: "text-sky-100",
            details: withSttDetails(baseDetails)
          })
        ];
      }

      return [
        createEvent("forwarded", {
          label: i18n("moved"),
          title: i18n("fundsMoved"),
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
          summary: i18n("fundsMovedBetweenWalletPoolsWithoutChangingThe"),
          amountSummary: walletChangeSummary,
          amountClassName: "text-amber-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (amountComparison === "decrease") {
      return [
        createEvent("sent", {
          label: i18n("sent"),
          title: i18n("fundsSent"),
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
          summary: i18n("theWalletSentFundsOutAndKeptValue1", { value1: formatWalletTransactionAmountSummary(outputsAtAddress) }),
          amountSummary: walletChangeSummary,
          amountClassName: "text-amber-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (amountComparison === "increase") {
      return [
        createEvent("top-up", {
          label: i18n("topUp"),
          title: i18n("fundsAdded"),
          badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
          summary: i18n("theWalletBalanceIncreasedToValue1", { value1: formatWalletTransactionAmountSummary(outputsAtAddress) }),
          amountSummary: walletChangeSummary,
          amountClassName: "text-emerald-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    return [
      createEvent("updated", {
        label: i18n("updated"),
        title: i18n("fundsChanged"),
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        summary: i18n("walletFundsChangedFromValue1ToValue2", { value1: formatWalletTransactionAmountSummary(
          inputsAtAddress
        ), value2: formatWalletTransactionAmountSummary(outputsAtAddress) }),
        amountSummary: walletChangeSummary,
        amountClassName: "text-amber-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  if (sendsToWallet) {
    return [
      createEvent("top-up", {
        label: i18n("topUp"),
        title: i18n("fundsAdded"),
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: i18n("addedValue1ToThisWallet", { value1: formatWalletTransactionAmountSummary(outputsAtAddress) }),
        amountSummary: walletChangeSummary,
        amountClassName: "text-emerald-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  if (spendsFromWallet) {
    return [
      createEvent("spent", {
        label: i18n("sent"),
        title: i18n("fundsSent"),
        badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-100",
        summary: i18n("sentValue1FromThisWallet", { value1: formatWalletTransactionAmountSummary(inputsAtAddress) }),
        amountSummary: walletChangeSummary,
        amountClassName: "text-rose-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  if (sttTouched) {
    if (sttInputCount > 0 && sttOutputCount > 0) {
      return [
        createEvent("settings-updated", {
          label: i18n("settings"),
          title: i18n("walletSettingsUpdated"),
          badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
          summary: i18n("peopleOrWalletRulesChangedTheBalanceStayed"),
          amountSummary: i18n("settingsUpdated"),
          amountClassName: "text-sky-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (sttOutputCount > 0) {
      return [
        createEvent("wallet-ready", {
          label: i18n("ready"),
          title: i18n("walletReady"),
          badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
          summary: i18n("theWalletIdentityIsAvailableForAnotherAction"),
          amountSummary: i18n("walletReady"),
          amountClassName: "text-emerald-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    return [
      createEvent("wallet-moved", {
        label: i18n("moved"),
        title: i18n("walletIdentityMoved"),
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        summary: i18n("theWalletIdentityMovedToANewOn"),
        amountSummary: i18n("walletIdentityMoved"),
        amountClassName: "text-amber-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  return [
    createEvent("referenced", {
      label: i18n("referenced"),
      title: i18n("walletChecked"),
      badgeClassName: "border-border/60 bg-background/50 text-muted-foreground",
      summary: i18n("theTransactionReferencedThisWalletWithoutChangingIts"),
      amountSummary: walletChangeSummary,
      amountClassName: "text-muted-foreground",
      details: baseDetails
    })
  ];
}
