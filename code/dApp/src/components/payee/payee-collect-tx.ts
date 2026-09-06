//// Build, sign and submit the payout that pays this payee. Kept out of the view so the page
//// stays a page: the view owns button state, this owns the chain work.

import type { BrowserWallet } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import { planPayeeCollect } from "@/components/payee/payee-collect";
import { fetchScriptUtxos } from "@/components/user/workspace/helpers";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import {
  crankSignersAreAuthorized,
  crankSignersBypassCooldown
} from "@/lib/contracts/crank-cooldown";
import { buildSttSpendTx, getValidityWindow, signAndSubmitTx } from "@/lib/mesh/transactions";
import { EMPTY_CONTRACT_CONFIG, type ConstrData, type ContractConfig } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsPayeePayeeCollect.json";

const i18n = createDefaultTranslator("ComponentsPayeePayeeCollect", defaultMessages);

export class PayeeCollectBlockedError extends Error {
  override name = "PayeeCollectBlockedError";
}

export async function runPayeeCollect(input: {
  wallet: BrowserWallet;
  payment: PayeeStreamingPayment;
  /** The consumed State datum, used to find the wallet's own funds address. */
  stateDatum: ConstrData;
  /** The connected wallet's payment key hash: the crank's required signer. */
  payeePaymentKeyHash: string;
  nowMs: number;
  /** Explicit user review for build warnings before the wallet signs. */
  confirmWarnings?: (warnings: readonly string[]) => boolean | Promise<boolean>;
}): Promise<string> {
  const {
    wallet,
    payment,
    stateDatum,
    payeePaymentKeyHash,
    nowMs,
    confirmWarnings
  } = input;

  if (!payeePaymentKeyHash.trim()) {
    throw new Error(
      "The connected wallet's payment key is unknown, and the payout must be signed by it."
    );
  }

  const validityWindow = getValidityWindow(nowMs);
  const signerKeyHashes = [payeePaymentKeyHash];
  if (
    !crankSignersAreAuthorized(
      stateDatum,
      signerKeyHashes,
      validityWindow.earliestTimeMs
    )
  ) {
    throw new PayeeCollectBlockedError(
      i18n("theFinalBackupPersonMustApprovePaymentsAfterRecoveryOpens")
    );
  }

  // Locked funds cover the settlement. The connected wallet can still fund ADA
  // needed for min-UTxO and fees, so the builder warning gate below must run
  // before this direct-submit path asks for a signature.
  const walletAddress = resolveWalletContinuingOutputAddressFromState({
    sttPolicyId: payment.sttPolicyId,
    sttAssetNameHex: payment.sttAssetNameHex,
    stateDatum
  });
  const lockedUtxos = await fetchScriptUtxos(walletAddress);

  const plan = planPayeeCollect(payment, lockedUtxos, validityWindow, {
    bypassCooldown: crankSignersBypassCooldown(
      stateDatum,
      signerKeyHashes,
      validityWindow.earliestTimeMs
    )
  });
  if (plan.status === "blocked") {
    throw new PayeeCollectBlockedError(plan.reason);
  }

  const config: ContractConfig = {
    ...EMPTY_CONTRACT_CONFIG,
    walletPolicyId: payment.sttPolicyId,
    walletAssetNameHex: payment.sttAssetNameHex,
    sttAssetNameHex: payment.sttAssetNameHex
  };

  const build = await buildSttSpendTx(wallet, config, "payout-streaming-payment", {
    sttInputTxHash: payment.sttInputTxHash,
    sttInputOutputIndex: payment.sttInputOutputIndex,
    // The forwarded datum for a payout is derived from the consumed state inside the builder;
    // this one only has to be a readable State, so the consumed datum itself is the honest
    // value to pass.
    outputDatum: stateDatum,
    outputAssets: [],
    crankSignerKeyHash: payeePaymentKeyHash,
    walletInputs: plan.walletInputs,
    walletOutputs: [],
    extraTransfers: plan.transfers,
    validityWindowReferenceTimeMs: nowMs
  });

  if (build.warnings?.length) {
    const approved = confirmWarnings
      ? await confirmWarnings(build.warnings)
      : false;
    if (!approved) {
      throw new PayeeCollectBlockedError(
        `This payout requires review before signing: ${build.warnings.join(" ")}`
      );
    }
  }

  return signAndSubmitTx(wallet, build.txHex);
}
