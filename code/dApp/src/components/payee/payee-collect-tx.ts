//// Build, sign and submit the payout that pays this payee. Kept out of the view so the page
//// stays a page: the view owns button state, this owns the chain work.

import type { BrowserWallet } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import { planPayeeCollect } from "@/components/payee/payee-collect";
import { fetchScriptUtxos } from "@/components/user/workspace/helpers";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { buildSttSpendTx, getValidityWindow, signAndSubmitTx } from "@/lib/mesh/transactions";
import { EMPTY_CONTRACT_CONFIG, type ConstrData, type ContractConfig } from "@/lib/types/contracts";

export async function runPayeeCollect(input: {
  wallet: BrowserWallet;
  payment: PayeeStreamingPayment;
  /** The consumed State datum, used to find the wallet's own funds address. */
  stateDatum: ConstrData;
  /** The connected wallet's payment key hash: the crank's required signer. */
  payeePaymentKeyHash: string;
  nowMs: number;
}): Promise<string> {
  const { wallet, payment, stateDatum, payeePaymentKeyHash, nowMs } = input;

  if (!payeePaymentKeyHash.trim()) {
    throw new Error(
      "The connected wallet's payment key is unknown, and the payout must be signed by it."
    );
  }

  // The payout is funded from the paying wallet's own locked funds, never from the payee's
  // pocket: with no wallet inputs the builder would fund it from the connected wallet.
  const walletAddress = resolveWalletContinuingOutputAddressFromState({
    sttPolicyId: payment.sttPolicyId,
    sttAssetNameHex: payment.sttAssetNameHex,
    stateDatum
  });
  const lockedUtxos = await fetchScriptUtxos(walletAddress);

  const plan = planPayeeCollect(payment, lockedUtxos, getValidityWindow(nowMs));
  if (plan.status === "blocked") {
    throw new Error(plan.reason);
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

  return signAndSubmitTx(wallet, build.txHex);
}
