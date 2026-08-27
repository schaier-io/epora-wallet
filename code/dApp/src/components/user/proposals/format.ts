"use client";

// Small presentation helpers shared across the proposals UI.

import { useCallback } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

export function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function useProposalFormatters() {
  const i18n = useTranslations("ComponentsUserProposalsFormat");
  const formatter = useFormatter();

  const lovelaceToAda = useCallback(
    (lovelace: string | null) =>
      lovelace == null ? i18n("notAvailable") : `${formatLovelaceAsAda(lovelace)} ₳`,
    [i18n]
  );
  const formatTimestamp = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? iso : formatter.dateTime(date, "short");
    },
    [formatter]
  );
  const actionKindLabel = useCallback(
    (actionKind: string) => {
      const labels: Record<string, string> = {
        mint: i18n("createWallet"),
        use: i18n("sendFunds"),
        "renew-proof-of-life": i18n("refreshWakeUpTimer"),
        "update-state": i18n("updateWalletSettings"),
        "manage-streaming-payments": i18n("changeScheduledPayments"),
        "use-allowance": i18n("sendWithinAllowance"),
        "use-beneficiary": i18n("withdrawRecoveryShare"),
        "payout-streaming-payment": i18n("payScheduledPayments"),
        "remove-access-index": i18n("removeSignerAccess"),
        "consolidate-utxo": i18n("tidyWalletFunds"),
        "lock-funds": i18n("addFunds"),
        "wallet-spend": i18n("sendWalletFunds"),
        "wallet-withdraw": i18n("claimStakingRewards"),
        "wallet-publish": i18n("publishCertificate"),
        "wallet-vote": i18n("castGovernanceVote"),
        "set-intended-stake-credential": i18n("updateStakingSetup")
      };
      return labels[actionKind] ?? i18n("walletAction");
    },
    [i18n]
  );
  const authorityPathLabel = useCallback(
    (authorityPath: string) => {
      if (authorityPath === "admin") return i18n("owner");
      if (authorityPath === "multisig") return i18n("requiredApprovals");
      if (authorityPath === "beneficiary") return i18n("recoveryContact");
      return i18n("walletRule");
    },
    [i18n]
  );

  return { actionKindLabel, authorityPathLabel, formatTimestamp, lovelaceToAda };
}
