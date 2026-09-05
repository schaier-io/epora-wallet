import { readStateSections } from "@/lib/contracts/state-layout";
import { hasReachableStateAccessPath } from "@/lib/contracts/state-validation";
import type {
  Asset,
  ConstrData,
  PayoutTransfer,
  WalletInputRef,
  WalletScriptOutput
} from "@/lib/types/contracts";
import { deserializeAddress, type UTxO } from "@meshsdk/core";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsTerminalRecovery.json";
import {
  MAX_BOUNDED_WALLET_NATIVE_ASSETS,
  MAX_WALLET_INPUTS_PER_SPEND
} from "@/lib/contracts/transaction-limits";

const i18n = createDefaultTranslator("LibContractsTerminalRecovery", defaultMessages);

export const TERMINAL_RECOVERY_REACHABILITY_ERROR =
  i18n("addAtLeastOneOwnerOrRecoveryPath");

/**
 * Shown before the signature that removes the final recovery contact.
 *
 * It used to be written in mechanism: `terminal recovery`, `access path`, `sweeps`,
 * `locked asset`, `chain-indexer snapshot`, `STT`, `UTxOs`: seven terms in four sentences,
 * none of which a user has. It named the one thing that matters (`Irreversible`) in the
 * first word and then never said what becomes irreversible. This states the outcome
 * and keeps the caveat that matters: the app can only move what it can currently see.
 */
export const TERMINAL_RECOVERY_WARNING =
  i18n("thisIsPermanentAfterYouSign");

export function isTerminalBeneficiaryOutputState(stateDatum: ConstrData) {
  const sections = readStateSections(stateDatum, "Terminal recovery output state");
  return (
    sections.beneficiaries.length === 0 &&
    !hasReachableStateAccessPath(stateDatum)
  );
}

export function isTerminalBeneficiaryWithdrawal(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
) {
  const inputSections = readStateSections(
    inputStateDatum,
    "Terminal recovery input state"
  );
  return (
    inputSections.beneficiaries.length === 1 &&
    isTerminalBeneficiaryOutputState(outputStateDatum)
  );
}

function refKey(ref: WalletInputRef) {
  return `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;
}

function assertCredentialRefsFitSpend(credentialRefs: WalletInputRef[]) {
  if (new Set(credentialRefs.map(refKey)).size > MAX_WALLET_INPUTS_PER_SPEND) {
    throw new Error(
      `Terminal recovery supports at most one wallet fund pool and must drain it when present. Tidy funds can merge pools only when their combined value contains at most ${MAX_BOUNDED_WALLET_NATIVE_ASSETS} native assets. Otherwise an owner or the required co-signers must clean the pools first. Without them, this app cannot safely finish terminal recovery.`
    );
  }
}

function assertSameRefs(selectedInputs: UTxO[], credentialRefs: WalletInputRef[]) {
  const selected = new Set(
    selectedInputs.map((utxo) =>
      refKey({
        txHash: utxo.input.txHash,
        outputIndex: utxo.input.outputIndex
      })
    )
  );
  const credentialWide = new Set(credentialRefs.map(refKey));
  const missing = [...credentialWide].filter((ref) => !selected.has(ref));
  const unexpected = [...selected].filter((ref) => !credentialWide.has(ref));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Terminal recovery must consume every UTxO under the wallet payment credential. Missing: ${missing.join(", ") || "none"}. Unexpected: ${unexpected.join(", ") || "none"}. Refresh wallet funds and select the complete set.`
    );
  }
}

function sumAssets(amounts: Asset[][]) {
  const totals = new Map<string, bigint>();
  for (const amount of amounts) {
    for (const asset of amount) {
      totals.set(
        asset.unit,
        (totals.get(asset.unit) ?? 0n) + BigInt(asset.quantity)
      );
    }
  }
  return [...totals.entries()]
    .filter(([, quantity]) => quantity !== 0n)
    .sort(([left], [right]) => left.localeCompare(right));
}

function assertFullValueSweep(
  walletInputs: UTxO[],
  transfers: PayoutTransfer[]
) {
  const inputValue = sumAssets(
    walletInputs.map((walletInput) => walletInput.output.amount)
  );
  const transferredValue = sumAssets(transfers.map((transfer) => transfer.amount));
  if (
    inputValue.length !== transferredValue.length ||
    inputValue.some(
      ([unit, quantity], index) => {
        const transferred = transferredValue[index];
        return !transferred || transferred[0] !== unit || transferred[1] !== quantity;
      }
    )
  ) {
    throw new Error(
      "Terminal recovery must transfer the complete value of every selected wallet input. No asset may remain at the wallet credential."
    );
  }
}

function assertNoWalletCredentialTransfers(
  walletPaymentScriptHash: string,
  transfers: PayoutTransfer[]
) {
  const normalizedWalletHash = walletPaymentScriptHash.trim().toLowerCase();
  for (const transfer of transfers) {
    const paymentScriptHash = deserializeAddress(transfer.address).scriptHash;
    if (paymentScriptHash.toLowerCase() === normalizedWalletHash) {
      throw new Error(
        "Terminal recovery cannot transfer assets back to the wallet payment credential. Transfer every locked asset to an external address."
      );
    }
  }
}

export function assertTerminalRecoveryIsComplete(input: {
  inputStateDatum: ConstrData;
  selectedWalletInputs: UTxO[];
  credentialWideWalletRefs: WalletInputRef[];
  walletPaymentScriptHash: string;
  walletOutputs: WalletScriptOutput[];
  transfers: PayoutTransfer[];
}) {
  assertCredentialRefsFitSpend(input.credentialWideWalletRefs);

  const inputSections = readStateSections(
    input.inputStateDatum,
    "Terminal recovery input state"
  );
  if (inputSections.streamingPayments.length > 0) {
    throw new Error(
      "Terminal recovery cannot run while streaming payments remain. Settle every due payment, then remove or finish every schedule before removing the last recovery contact."
    );
  }
  if (input.walletOutputs.length > 0) {
    throw new Error(
      "Terminal recovery cannot create a continuing wallet output. Transfer every locked asset out of the wallet."
    );
  }

  assertSameRefs(input.selectedWalletInputs, input.credentialWideWalletRefs);
  assertNoWalletCredentialTransfers(
    input.walletPaymentScriptHash,
    input.transfers
  );
  assertFullValueSweep(input.selectedWalletInputs, input.transfers);
}
