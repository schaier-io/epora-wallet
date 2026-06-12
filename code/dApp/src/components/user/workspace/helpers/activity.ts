import { calculateAssetDelta, collectAddressAssets, collectUtxoAssets, compareAssetAmounts, countAddressUtxos, countAssetUtxos, utxoContainsAsset } from "./asset-amounts";
import { formatActivityActorDetail, formatCountLabel, formatSignedAmountSummary, formatWalletTransactionAmountSummary } from "./formatters";
import { dedupeUtxosByRef } from "./transactions";
import { type WalletActivityEvent } from "@/components/user/workspace/types";
import { type TransactionInfo } from "@meshsdk/common";
import { type UTxO } from "@meshsdk/core";

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
      label: options.activeWalletName ?? "Connected wallet",
      detail: formatActivityActorDetail(options.activeAddress)
    };
  }

  const externalWalletInput = inputs.find(
    (utxo) => utxo.output.address !== address && !isLikelyScriptAddress(utxo.output.address)
  );

  if (externalWalletInput) {
    return {
      label: "External wallet",
      detail: formatActivityActorDetail(externalWalletInput.output.address)
    };
  }

  const walletInput = inputs.find((utxo) => utxo.output.address === address);

  if (walletInput) {
    return {
      label: "Smart wallet",
      detail: "Smart wallet funds"
    };
  }

  const contractInput = inputs.find((utxo) => utxo.output.address !== address);

  if (contractInput) {
    return {
      label: "Contract input",
      detail: formatActivityActorDetail(contractInput.output.address)
    };
  }

  if (
    sttUnit &&
    (transaction.outputs ?? []).some((utxo) => utxo && utxoContainsAsset(utxo, sttUnit))
  ) {
    return {
      label: "Wallet owner",
      detail: "Created this wallet"
    };
  }

  // Earlier branches resolve every actor we can identify (external wallet, this
  // wallet, contract, creator). Reaching here means the inputs don't trace to a
  // known party — typical for an incoming top-up from outside, so label it as an
  // external source rather than the jarring "Unknown".
  return {
    label: "External source",
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
    walletChange.length > 0 ? formatSignedAmountSummary(walletChange) : "No net balance change";
  const walletFundSummary =
    inputCountAtAddress || outputCountAtAddress
      ? `${formatCountLabel(inputCountAtAddress, "input")} and ${formatCountLabel(
          outputCountAtAddress,
          "output"
        )}`
      : "No wallet fund pools changed";
  const sttIoSummary = `${formatCountLabel(sttInputCount, "input")} and ${formatCountLabel(
    sttOutputCount,
    "output"
  )}`;
  const actor = inferWalletActivityActor(transaction, address, {
    sttUnit: options.sttUnit,
    activeAddress: options.activeAddress,
    activeWalletName: options.activeWalletName
  });
  const baseDetails = [
    { label: "Triggered by", value: actor.detail ? `${actor.label} (${actor.detail})` : actor.label },
    { label: "Wallet change", value: walletChangeSummary },
    { label: "Wallet funds", value: walletFundSummary },
    {
      label: "Transaction",
      value: `${formatCountLabel(transaction.inputs.length, "input")} and ${formatCountLabel(
        outputUtxos.length,
        "output"
      )}`
    }
  ];
  const withSttDetails = (details: Array<{ label: string; value: string }>) =>
    sttTouched ? [...details, { label: "Wallet token", value: sttIoSummary }] : details;
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
        label: "Created",
        title: "Wallet created",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: "A new smart wallet was created.",
        amountSummary: "New wallet",
        amountClassName: "text-emerald-100",
        details: withSttDetails(baseDetails)
      })
    );
  }

  if (sendsToWallet && sttCreated) {
    events.push(
      createEvent("initial-top-up", {
        label: "Top-up",
        title: "Initial top-up",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: `Starter funds were added: ${formatWalletTransactionAmountSummary(outputsAtAddress)}.`,
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
            label: "Tidied",
            title: "Funds merged",
            badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
            summary: "Several wallet fund pools were merged without changing the balance.",
            amountSummary: walletChangeSummary,
            amountClassName: "text-sky-100",
            details: withSttDetails(baseDetails)
          })
        ];
      }

      if (inputCountAtAddress < outputCountAtAddress) {
        return [
          createEvent("split", {
            label: "Split",
            title: "Funds split",
            badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
            summary: "Wallet funds were split into more spendable pools.",
            amountSummary: walletChangeSummary,
            amountClassName: "text-sky-100",
            details: withSttDetails(baseDetails)
          })
        ];
      }

      return [
        createEvent("forwarded", {
          label: "Moved",
          title: "Funds moved",
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
          summary: "Wallet funds were refreshed with no net balance change.",
          amountSummary: walletChangeSummary,
          amountClassName: "text-amber-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (amountComparison === "decrease") {
      return [
        createEvent("sent", {
          label: "Sent",
          title: "Funds sent",
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
          summary: `The wallet sent funds out and kept ${formatWalletTransactionAmountSummary(outputsAtAddress)} locked.`,
          amountSummary: walletChangeSummary,
          amountClassName: "text-amber-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (amountComparison === "increase") {
      return [
        createEvent("top-up", {
          label: "Top-up",
          title: "Funds added",
          badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
          summary: `The wallet balance increased to ${formatWalletTransactionAmountSummary(outputsAtAddress)}.`,
          amountSummary: walletChangeSummary,
          amountClassName: "text-emerald-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    return [
      createEvent("updated", {
        label: "Updated",
        title: "Funds changed",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        summary: `Wallet funds changed from ${formatWalletTransactionAmountSummary(
          inputsAtAddress
        )} to ${formatWalletTransactionAmountSummary(outputsAtAddress)}.`,
        amountSummary: walletChangeSummary,
        amountClassName: "text-amber-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  if (sendsToWallet) {
    return [
      createEvent("top-up", {
        label: "Top-up",
        title: "Funds added",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        summary: `Added ${formatWalletTransactionAmountSummary(outputsAtAddress)} to this wallet.`,
        amountSummary: walletChangeSummary,
        amountClassName: "text-emerald-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  if (spendsFromWallet) {
    return [
      createEvent("spent", {
        label: "Sent",
        title: "Funds sent",
        badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-100",
        summary: `Sent ${formatWalletTransactionAmountSummary(inputsAtAddress)} from this wallet.`,
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
          label: "Settings",
          title: "Wallet settings updated",
          badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-100",
          summary: "The wallet rules or people were updated.",
          amountSummary: "Settings updated",
          amountClassName: "text-sky-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    if (sttOutputCount > 0) {
      return [
        createEvent("wallet-ready", {
          label: "Ready",
          title: "Wallet ready",
          badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
          summary: "The wallet token was created or returned.",
          amountSummary: "Wallet ready",
          amountClassName: "text-emerald-100",
          details: withSttDetails(baseDetails)
        })
      ];
    }

    return [
      createEvent("wallet-moved", {
        label: "Moved",
        title: "Wallet token moved",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        summary: "The wallet token left its previous output.",
        amountSummary: "Wallet token moved",
        amountClassName: "text-amber-100",
        details: withSttDetails(baseDetails)
      })
    ];
  }

  return [
    createEvent("referenced", {
      label: "Referenced",
      title: "Wallet referenced",
      badgeClassName: "border-border/60 bg-background/50 text-muted-foreground",
      summary: "The transaction touched this wallet's history without a visible balance change.",
      amountSummary: walletChangeSummary,
      amountClassName: "text-muted-foreground",
      details: baseDetails
    })
  ];
}

