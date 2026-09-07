import { buildBeneficiaryDistributionTx } from "./beneficiary-distribution";
import { readCallerForwardedState, validateSttSpendInput } from "./internals/stt-spend-preflight";
import { deriveBeneficiaryStreamStopStateDatum } from "@/lib/contracts/beneficiary-stream-stop";
import { formatBeneficiaryStopTimestamp } from "./internals/beneficiary-stream-stop-review";
import { deserializeAddress } from "@meshsdk/core";
import { WALLET_SPEND_VALIDATOR, addExtraRequiredSigners, buildTransactionWithReestimatedLimits, classifyStreamingPayoutBatch, createInputRefKey, createStateForwarding, createStreamingPayoutBuild, createTxPreview, decodeConstrDatumFromUtxo, deriveBeneficiaryWithdrawalId, deriveBeneficiaryWithdrawalStateDatum, ensureUniqueWalletInputRefs, resolveExactWalletInputUtxos, resolveStreamingAdaPayoutTopUps, runStateForwarding, getValidityWindow, mergeAssetLists, mergeAssetsByUnit, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, setupTransaction, subtractSelectedInputRemainder, validateForwardedStateDatum, withStage } from "./internals";
import { deriveAccessIndexRemovalStateDatum } from "@/lib/contracts/access-removal";
import { prepareManagedStreamingPayments } from "./internals/streaming-asset-proof";
import { validateBeneficiaryDestinations } from "@/lib/contracts/state-validation-streaming";
import { type OnChainStructuredAction, buildSttSpendRedeemerData, buildWalletSpendRedeemerData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getWalletSpendScript, resolveWalletContinuingOutputAddressFromState, resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import {
  assertNonAdminStreamingActionWindow,
  crankSignersAreAuthorized,
  crankSignersBypassCooldown
} from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import {
  deriveStreamingPaymentPayoutStateDatum,
  retagStreamingPaymentPayoutTransfers
} from "@/lib/contracts/streaming-payout";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import {
  isRepeatableBeneficiaryRecovery,
  REPEATABLE_RECOVERY_NOTICE
} from "@/lib/contracts/terminal-recovery";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import { type Asset, type BuildResult, type ConstrData, type ContractConfig, type PayoutTransfer, type SttSpendFormInput } from "@/lib/types/contracts";
import { isOnChainInteger } from "@/lib/contracts/on-chain-integer";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import type { UTxO } from "@meshsdk/core";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);

export function resolveStreamingPayoutFundingSource(
  walletInputCount: number
): "smart-wallet" | "connected-wallet" {
  if (!Number.isSafeInteger(walletInputCount) || walletInputCount < 0) {
    throw new Error("Streaming payout wallet input count must be a non-negative integer.");
  }
  return walletInputCount > 0 ? "smart-wallet" : "connected-wallet";
}

/**
 * Mirror the validator's preserve-vs-stamp cadence split before deriving the
 * payout datum. Only the admin/preserve branch bypasses the shared window;
 * every stamping branch must pass the same cooldown and one-hour cap used by
 * receiver cancellation.
 */
export function deriveValidatedStreamingPaymentPayoutStateDatum(
  stateDatum: ConstrData,
  transfers: PayoutTransfer[],
  txEarliestTimeMs: number,
  txLatestTimeMs: number,
  preserveCooldownStamp: boolean
) {
  if (!preserveCooldownStamp) {
    assertNonAdminStreamingActionWindow(
      stateDatum,
      txEarliestTimeMs,
      txLatestTimeMs,
      "Streaming payment payout"
    );
  }
  return deriveStreamingPaymentPayoutStateDatum(
    stateDatum,
    transfers,
    txEarliestTimeMs,
    txLatestTimeMs,
    preserveCooldownStamp
  );
}

export async function buildSttSpendTx(
  wallet: WalletSource,
  config: ContractConfig,
  action:
    | "use"
    | "renew-proof-of-life"
    | "update-state"
    | "manage-streaming-payments"
    | "use-allowance"
    | "use-beneficiary"
    | "stop-beneficiary-stream"
    | "distribute-beneficiaries"
    | "payout-streaming-payment"
    | "cancel-streaming-payment"
    | "remove-access-index",
  input: SttSpendFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  if (action === "distribute-beneficiaries") {
    return buildBeneficiaryDistributionTx(wallet, config, input, txFetcher);
  }
  const walletInputs = input.walletInputs ?? [];
  const walletOutputs = input.walletOutputs ?? [];
  const extraTransfers = input.extraTransfers ?? [];
  const payoutFundingSource =
    action === "payout-streaming-payment"
      ? resolveStreamingPayoutFundingSource(walletInputs.length)
      : undefined;
  // `remove-access-index` derives its forwarded datum from the consumed state
  // (below) and carries a richer payload than the string-keyed resolver builds,
  // so seed it directly; everything else resolves from the action string.
  const onChainAction: OnChainStructuredAction =
    action === "remove-access-index"
      ? {
          kind: "remove-access-index",
          operatorPath: input.authorityPath === "multisig" ? "multisig" : "admin",
          target: input.removeAccessTarget ?? { list: "user", index: 0 }
        }
      : resolveStructuredOnChainAction(action, input.authorityPath);

  // These actions derive their forwarded datum from the consumed state. This
  // builder forwards their STT value unchanged, so they carry no caller-supplied
  // outputDatum. `null` here is the single source of that fact: every later use
  // reads it instead of re-testing the action, which is also what narrows the
  // two optional fields for the actions that do forward them.
  const derivesForwardedDatum =
    action === "use-allowance" ||
    action === "use-beneficiary" ||
    action === "stop-beneficiary-stream" ||
    action === "remove-access-index" ||
    action === "cancel-streaming-payment";

  const callerForwardedState = derivesForwardedDatum
    ? null
    : readCallerForwardedState(input);

  validateSttSpendInput(action, input);
  const streamingPayoutBatch =
    action === "payout-streaming-payment"
      ? classifyStreamingPayoutBatch(extraTransfers)
      : null;

  const stateForwarding = createStateForwarding(config);
  const sttParams = stateForwarding.params;
  let walletScript:
    | ReturnType<typeof getWalletSpendScript>
    | undefined;
  const forwardedDatum =
    callerForwardedState === null
      ? null
      : unwrapStateDatum(callerForwardedState.datum, "STT state datum");
  if (walletInputs.length > 0) {
    walletScript = getWalletSpendScript({
      sttPolicyId: sttParams.sttPolicyId,
      sttAssetNameHex: sttParams.sttAssetNameHex
    });
  }
  const walletPaymentScriptHash = resolveWalletSpendScriptHash({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  // Resolved once so the tx validity range and the datum stamps derived from it
  // describe the same window across the draft and final builds.
  const validityWindowReferenceTimeMs = input.validityWindowReferenceTimeMs ?? Date.now();
  const prepared = await buildTransactionWithReestimatedLimits(
    "stt-spend:tx.draft-build",
    "stt-spend:tx.build",
    async (overrides) => {
      const payoutBuild = createStreamingPayoutBuild(
        streamingPayoutBatch ?? "empty",
        walletInputs.length > 0
      );
      const setup = await setupTransaction(
        wallet,
        validityWindowReferenceTimeMs,
        txFetcher,
        payoutBuild.setupOptions
      );
      const { tx, fetcher, setupDiagnostics, signerAddress } = setup;
      // Co-signers of an approval request: the validator reads `extra_signatories`,
      // which holds only the body's required signers, so a co-signer has to be
      // listed here for their signature to count. Every listed key must then sign.
      const extraRequiredSignerKeyHashes = addExtraRequiredSigners(
        tx,
        signerAddress,
        input.requiredSignerKeyHashes
      );
      const spendValidatorsByRef = new Map<string, string>();
      let walletOutputCount = 0;
      let autoReturnedWalletAssets: Asset[] = [];
      let walletAddress: string | undefined;
      let allowanceTargetUserId: number | bigint | undefined;
      let beneficiaryTargetId: number | bigint | undefined;
      let forwardedAssets: Asset[] = [];
      let effectiveForwardedDatum: ConstrData;
      let effectiveOnChainAction = onChainAction;
      let repeatableBeneficiaryRecovery = false;
      let forwardedStateWarnings: string[] = [];
      let beneficiaryStopWarning: string | undefined;
      const resolvedWalletInputs: UTxO[] = [];
      let effectiveExtraTransfers = extraTransfers;
      const forwarding = await runStateForwarding({
        definition: stateForwarding,
        fetcher,
        tx,
        input: {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: "stt-spend:fetchScriptUtxos",
          details: setupDiagnostics
        },
        reference: {
          stage: "stt-spend:resolveSharedSttReferenceScript",
          details: { ...setupDiagnostics, action },
          excludedRefs: (input.walletInputs ?? []).map((walletInput) =>
            createInputRefKey(walletInput.txHash, walletInput.outputIndex)
          )
        },
        spendValidatorsByRef,
        afterInput: ({ input: stateInput }) => {
          const scriptInput = stateInput.input;
          if (action === "payout-streaming-payment") {
            effectiveExtraTransfers = retagStreamingPaymentPayoutTransfers(
              extraTransfers,
              scriptInput.input.txHash,
              scriptInput.input.outputIndex
            );
          }
          const validityWindow = getValidityWindow(validityWindowReferenceTimeMs);
          const earliestTimeMs = validityWindow.earliestTimeMs;
          const latestTimeMs = validityWindow.latestTimeMs;
          // mergeRestrictedSttAssets does not accept the deriving actions, so
          // resolve its argument off `derivesForwardedDatum`, which is what narrows
          // `action`. It is null in exactly the cases where the branch below that
          // reads it is unreachable.
          const restrictedAction = derivesForwardedDatum
            ? null
            : action === "manage-streaming-payments"
              ? ("payout-streaming-payment" as const)
              : action;
          forwardedAssets =
            callerForwardedState === null || restrictedAction === null
              ? [...scriptInput.output.amount]
              : onChainAction.kind === "operator" &&
                  onChainAction.operatorIntent === "use"
                ? mergeAssetsByUnit(callerForwardedState.assets, scriptInput.output.amount)
                : mergeRestrictedSttAssets(
                    callerForwardedState.assets,
                    scriptInput.output.amount,
                    restrictedAction
                  );
          return { scriptInput, earliestTimeMs, latestTimeMs };
        },
        beforeRedeem: async ({
          resolved,
          value: { scriptInput, earliestTimeMs, latestTimeMs }
        }) => {
          if (walletInputs.length > 0) {
            ensureUniqueWalletInputRefs(walletInputs);

            if (!walletScript) {
              throw new Error("Wallet spend script is not available for the selected STT flow.");
            }
            // The continuing wallet output follows the wallet's
            // `intended_stake_credential`, read from the consumed State datum (it is
            // preserved across every spend action). A staking (Some) wallet keeps its
            // funds at the base address; a `None` wallet resolves to the exact
            // historical enterprise address, so existing wallets are unchanged.
            const resolvedWalletAddress = resolveWalletContinuingOutputAddressFromState({
              sttPolicyId: sttParams.sttPolicyId,
              sttAssetNameHex: sttParams.sttAssetNameHex,
              stateDatum: decodeConstrDatumFromUtxo(scriptInput)
            });
            walletAddress = resolvedWalletAddress;
            const exactWalletInputs = await withStage(
              "stt-spend:resolveWalletInputs",
              async () =>
                resolveExactWalletInputUtxos(
                  fetcher,
                  walletInputs,
                  walletPaymentScriptHash
                ),
              {
                ...setupDiagnostics,
                action,
                walletAddress: resolvedWalletAddress,
                walletPaymentScriptHash
              }
            );

            for (const walletInput of exactWalletInputs) {
              spendValidatorsByRef.set(
                createInputRefKey(walletInput.input.txHash, walletInput.input.outputIndex),
                WALLET_SPEND_VALIDATOR
              );
              resolvedWalletInputs.push(walletInput);

              const walletRedeemer = {
                data: buildWalletSpendRedeemerData(onChainAction),
                budget: overrides?.spendBudgetsByRef.get(
                  createInputRefKey(
                    walletInput.input.txHash,
                    walletInput.input.outputIndex
                  )
                )
              };
              redeemValueWithInlineScript(tx, walletInput, walletScript, walletRedeemer);
            }

            const selectedWalletInputAssets = mergeAssetLists(
              resolvedWalletInputs.map((walletInput) => walletInput.output.amount)
            );
            const explicitlyRequestedFromLockedInputs = mergeAssetLists([
              ...walletOutputs.map((walletOutput) => walletOutput.amount),
              ...(input.extraTransfers ?? []).map((transfer) => transfer.amount)
            ]);
            autoReturnedWalletAssets = subtractSelectedInputRemainder(
              selectedWalletInputAssets,
              explicitlyRequestedFromLockedInputs
            );

            walletOutputCount = walletOutputs.length;

            for (const walletOutput of walletOutputs) {
              tx.sendAssets(
                recipientWithOptionalInlineDatum(walletAddress, walletOutput.inlineDatum),
                walletOutput.amount
              );
            }

            if (autoReturnedWalletAssets.length > 0) {
              tx.sendAssets(
                recipientWithOptionalInlineDatum(walletAddress),
                autoReturnedWalletAssets
              );
              walletOutputCount += 1;
            }
          } else if (walletOutputs.length > 0) {
            throw new Error(
              "Locked contract outputs require at least one locked contract input."
            );
          }

          if (action === "use-allowance") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) {
              throw new Error(
                "Allowance Withdrawal requires an inline STT state datum on the selected input."
              );
            }

            const allowanceComputation = deriveAllowanceWithdrawalStateDatum({
              stateDatum: sourceStateDatum,
              allowanceSignerKeyHash: input.allowanceSignerKeyHash!,
              walletInputAmounts: resolvedWalletInputs.map(
                (walletInput) => walletInput.output.amount
              ),
              walletOutputs,
              extraTransfers,
              txEarliestTimeMs: earliestTimeMs,
              txLatestTimeMs: latestTimeMs
            });

            effectiveOnChainAction = {
              kind: "allowance-withdrawal",
              userId: allowanceComputation.matchedUserId,
              spentAllowance: allowanceComputation.spentAllowance
            };
            effectiveForwardedDatum = unwrapStateDatum(
              allowanceComputation.outputDatum,
              "STT state datum"
            );
            allowanceTargetUserId = allowanceComputation.matchedUserId;
          } else if (action === "use-beneficiary") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) {
              throw new Error(
                "Beneficiary Withdrawal requires an inline STT state datum on the selected input."
              );
            }

            if (!input.beneficiarySignerKeyHash?.trim()) {
              throw new Error(
                "Beneficiary Withdrawal requires the connected wallet payment key hash."
              );
            }

            beneficiaryTargetId = deriveBeneficiaryWithdrawalId(
              sourceStateDatum,
              input.beneficiarySignerKeyHash
            );
            repeatableBeneficiaryRecovery =
              action === "use-beneficiary" && isRepeatableBeneficiaryRecovery(sourceStateDatum);
            if (repeatableBeneficiaryRecovery) {
              assertNonAdminStreamingActionWindow(
                sourceStateDatum,
                earliestTimeMs,
                latestTimeMs,
                "Final beneficiary recovery"
              );
            }
            const beneficiaryOutputDatum = deriveBeneficiaryWithdrawalStateDatum(
              sourceStateDatum, beneficiaryTargetId, latestTimeMs
            );
            effectiveOnChainAction = {
              kind: "beneficiary-withdrawal",
              beneficiaryId: beneficiaryTargetId
            };
            effectiveForwardedDatum = unwrapStateDatum(
              beneficiaryOutputDatum,
              "STT state datum"
            );
            if (
              repeatableBeneficiaryRecovery &&
              resolvedWalletInputs.length === 0
            ) {
              throw new Error(
                "Final beneficiary recovery requires at least one selected fund pool."
              );
            }
          } else if (action === "payout-streaming-payment") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) {
              throw new Error(
                "Streaming payment payout requires an inline STT state datum on the selected input."
              );
            }

            // AUTHORITY (security review 2026-07): the crank is no longer
            // permissionless. Before final recovery it accepts an admin, a multisig
            // quorum, any listed user, any stream payee, or an unlocked beneficiary.
            // Once the sole beneficiary unlocks, only it or an admin may crank.
            // Refuse a doomed or unsigned transaction before submission.
            if (!input.crankSignerKeyHash) {
              throw new Error(
                "Settling a streaming payment requires an authorized signer. Connect an owner, listed user, payee, or unlocked backup person."
              );
            }
            // The validator judges the whole `extra_signatories` set, so a crank
            // saved for co-signers is judged by the listed keys together.
            const crankSignerKeyHashes = [input.crankSignerKeyHash, ...extraRequiredSignerKeyHashes];
            if (
              !crankSignersAreAuthorized(
                sourceStateDatum,
                crankSignerKeyHashes,
                earliestTimeMs
              )
            ) {
              throw new Error(
                "This wallet cannot settle this scheduled payment. After final recovery opens, only an owner or the final backup person may settle."
              );
            }

            // Cadence clock: only an ADMIN bypasses the 30-minute limit, and an admin
            // crank must PRESERVE the stamp; every other authorized cranker STAMPS the
            // tx upper bound. Decide it the same way the validator would, from the
            // listed signer key hashes, because a disagreement makes the tx fail. The
            // default validity window (~6 min) is well under the on-chain 1h cap.
            const preserveCooldownStamp = crankSignersBypassCooldown(
              sourceStateDatum,
              crankSignerKeyHashes,
              earliestTimeMs
            );
            const payoutComputation = deriveValidatedStreamingPaymentPayoutStateDatum(
              sourceStateDatum,
              effectiveExtraTransfers,
              earliestTimeMs,
              latestTimeMs,
              preserveCooldownStamp
            );
            effectiveOnChainAction = {
              kind: "streaming-payment-payout",
              payoutDelta: payoutComputation.payoutDelta
            };
            effectiveForwardedDatum = unwrapStateDatum(
              payoutComputation.outputDatum,
              "STT state datum"
            );
          } else if (action === "stop-beneficiary-stream") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) throw new Error("Stopping a beneficiary stream requires an inline STT state datum.");
            const connectedSigner = deserializeAddress(signerAddress).pubKeyHash;
            if (connectedSigner !== input.beneficiarySignerKeyHash?.trim().toLowerCase()) {
              throw new Error("The beneficiary signer must match the connected wallet payment key hash.");
            }
            const stopped = deriveBeneficiaryStreamStopStateDatum({
              stateDatum: sourceStateDatum,
              beneficiarySignerKeyHash: connectedSigner,
              additionalSignerKeyHashes: extraRequiredSignerKeyHashes,
              streamingPaymentId: input.beneficiaryStreamStopId!,
              txEarliestTimeMs: earliestTimeMs,
              txLatestTimeMs: latestTimeMs
            });
            effectiveOnChainAction = { kind: "stop-beneficiary-stream", beneficiaryId: stopped.beneficiaryId, streamingPaymentId: stopped.streamingPaymentId };
            effectiveForwardedDatum = stopped.outputDatum;
            beneficiaryStopWarning = i18n("beneficiaryStreamStopDetails", {
              id: String(stopped.streamingPaymentId), oldEnd: formatBeneficiaryStopTimestamp(stopped.oldEndDate), cutoff: formatBeneficiaryStopTimestamp(stopped.cutoff),
              paid: stopped.unit === "lovelace" ? formatLovelaceAsAda(String(stopped.paidOutAmount)) : String(stopped.paidOutAmount),
              debt: stopped.unit === "lovelace" ? formatLovelaceAsAda(String(stopped.retainedDebt)) : String(stopped.retainedDebt),
              unit: stopped.unit === "lovelace" ? "ADA" : stopped.unit
            });
          } else if (action === "cancel-streaming-payment") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) {
              throw new Error(
                "Cancelling a streaming payment requires an inline STT state datum on the selected input."
              );
            }

            if (
              !isOnChainInteger(input.streamingPaymentCancelId)
            ) {
              throw new Error(
                "Cancelling a streaming payment requires the target streaming-payment id."
              );
            }

            // Shorten the target to the earliest shape-safe cutoff at/after the tx
            // upper bound and advance the shared non-admin streaming-action clock.
            // The connected wallet remains the payee signer. The contract requires
            // this exact cutoff after final recovery opens, so one payment can move
            // the shared clock only once. This builder forwards STT value unchanged.
            const cancellation = deriveStreamingPaymentCancellationStateDatum(
              sourceStateDatum,
              input.streamingPaymentCancelId,
              earliestTimeMs,
              latestTimeMs
            );
            effectiveOnChainAction = {
              kind: "streaming-payment-cancellation",
              streamingPaymentId: input.streamingPaymentCancelId
            };
            effectiveForwardedDatum = unwrapStateDatum(
              cancellation.outputDatum,
              "STT state datum"
            );
          } else if (action === "remove-access-index") {
            const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
            if (!sourceStateDatum) {
              throw new Error(
                "Removing an access entry requires an inline STT state datum on the selected input."
              );
            }

            const removeTarget = input.removeAccessTarget!;
            const removalOutputDatum = deriveAccessIndexRemovalStateDatum(
              sourceStateDatum,
              removeTarget
            );
            effectiveOnChainAction = {
              kind: "remove-access-index",
              operatorPath:
                input.authorityPath === "multisig" ? "multisig" : "admin",
              target: removeTarget
            };
            effectiveForwardedDatum = unwrapStateDatum(
              removalOutputDatum,
              "STT state datum"
            );
          } else {
            effectiveForwardedDatum = forwardedDatum!;
          }

          if (action === "manage-streaming-payments") {
            await prepareManagedStreamingPayments(setup, {
              scriptInput,
              referenceUtxo: resolved.referenceScript.utxo,
              outputStateDatum: effectiveForwardedDatum,
              txLatestTimeMs: latestTimeMs,
              walletPaymentScriptHash,
              ...sttParams
            });
          }

          if (action === "update-state") {
            const beneficiaryDestinationErrors = validateBeneficiaryDestinations(
              effectiveForwardedDatum,
              walletPaymentScriptHash,
              sttParams.sttPolicyId
            );
            if (beneficiaryDestinationErrors.length > 0) {
              throw new Error(beneficiaryDestinationErrors[0]);
            }
          }

          forwardedStateWarnings = validateForwardedStateDatum(
            effectiveForwardedDatum,
            effectiveOnChainAction,
            "stt-spend:validateStateDatum",
            "Forwarded STT output datum is invalid."
          );
          if (beneficiaryStopWarning) forwardedStateWarnings.push(beneficiaryStopWarning);
          if (action === "use-beneficiary" && !repeatableBeneficiaryRecovery) {
            forwardedStateWarnings.push(i18n("beneficiaryAccessRemoved"), i18n("beneficiaryUnusedShare"));
          }
          if (repeatableBeneficiaryRecovery) {
            forwardedStateWarnings.push(REPEATABLE_RECOVERY_NOTICE);
          }

          return {
            assets: forwardedAssets,
            datum: effectiveForwardedDatum,
            redeemer: buildSttSpendRedeemerData(effectiveOnChainAction),
            budget: overrides?.spendBudgetsByRef.get(resolved.inputRef),
            additionalWitnesses: walletScript
              ? [
                  {
                    label: "Wallet spend",
                    script: walletScript,
                    reference: null
                  }
                ]
              : [],
            afterOutput: () => {
              for (const transfer of effectiveExtraTransfers) {
                if (action !== "payout-streaming-payment") {
                  tx.sendAssets(
                    recipientWithOptionalInlineDatum(
                      transfer.address,
                      transfer.inlineDatum
                    ),
                    transfer.amount
                  );
                  continue;
                }

                payoutBuild.sendTransfer(tx, transfer);
              }
            }
          };
        }
      });

      return {
        tx,
        signerAddress,
        diagnostics: {
          ...setupDiagnostics,
          action,
          ...forwarding.diagnostics,
          walletAddress,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          lockedWalletInputCount: walletInputs.length,
          payoutFundingSource,
          lockedWalletOutputCount: walletOutputCount,
          extraTransferCount: effectiveExtraTransfers.length,
          extraTransferAddresses: effectiveExtraTransfers
            .map((transfer) => transfer.address)
            .slice(0, 5),
          autoReturnedWalletAssets,
          allowanceTargetUserId,
          beneficiaryTargetId
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          scriptInputRef: forwarding.resolved.inputRef,
          walletOutputCount,
          allowanceTargetUserId,
          beneficiaryTargetId,
          warnings: forwardedStateWarnings,
          beneficiaryAccess: action === "use-beneficiary"
            ? repeatableBeneficiaryRecovery ? "retained" : "removed"
            : undefined,
          adaPayout: streamingPayoutBatch && streamingPayoutBatch !== "empty"
            ? payoutBuild.adaPayout
            : undefined,
          referenceScriptUsage: forwarding.referenceScriptUsage
        },
        resolveAdjustableLovelaceOutput: payoutBuild.absorbsFundingChange
          ? () => payoutBuild.resolveAdjustableOutput(tx)
          : undefined
      };
    },
    txFetcher
  );

  const walletOutputCount =
    typeof prepared.context?.walletOutputCount === "number"
      ? prepared.context.walletOutputCount
      : 0;
  const allowanceTargetUserId =
    isOnChainInteger(prepared.context?.allowanceTargetUserId)
      ? prepared.context.allowanceTargetUserId
      : null;
  const beneficiaryTargetId =
    isOnChainInteger(prepared.context?.beneficiaryTargetId)
      ? prepared.context.beneficiaryTargetId
      : null;
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";
  const adaPayout = prepared.context?.adaPayout as
    | ReturnType<typeof createStreamingPayoutBuild>["adaPayout"]
    | undefined;
  const payoutTopUps = adaPayout
    ? resolveStreamingAdaPayoutTopUps(adaPayout)
    : [];
  const warnings = Array.isArray(prepared.context?.warnings)
    ? [...(prepared.context.warnings as string[])]
    : [];
  for (const payoutTopUp of payoutTopUps) {
    warnings.push(
      i18n("adaPayoutTopUp", {
        payoutTopUpAda: formatLovelaceAsAda(payoutTopUp.topUpLovelace),
        payoutAddress: payoutTopUp.address,
        finalOutputAda: formatLovelaceAsAda(payoutTopUp.finalOutputLovelace),
        settlementAda: formatLovelaceAsAda(payoutTopUp.settlementLovelace)
      })
    );
  }
  const technicalSummary = [
    `action=${action}`,
    `funding=${walletInputs.length > 0 ? "smart-wallet" : payoutFundingSource}`,
    `selectedFundPools=${walletInputs.length}`,
    `resultingFundPools=${walletOutputCount}`,
    allowanceTargetUserId !== null ? `spender=${allowanceTargetUserId}` : null,
    beneficiaryTargetId !== null ? `recoveryContact=${beneficiaryTargetId}` : null,
    referenceScriptUsage || null
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      action,
      technicalSummary,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    signerAddress: prepared.signerAddress,
    beneficiaryAccess: prepared.context?.beneficiaryAccess as BuildResult["beneficiaryAccess"],
    executionUnits: prepared.executionUnits,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
