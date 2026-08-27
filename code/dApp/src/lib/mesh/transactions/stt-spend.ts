import { STT_SPEND_VALIDATOR, WALLET_SPEND_VALIDATOR, assertValidAssetList, assertValidConstrData, assertValidPayoutTransfers, assertValidWalletInputRefs, assertValidWalletOutputs, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, decodeConstrDatumFromUtxo, deriveBeneficiaryWithdrawalId, deriveBeneficiaryWithdrawalStateDatum, describeReferenceScriptUsage, ensureUniqueWalletInputRefs, resolveExactWalletInputUtxos, resolveSttInputUtxo, getValidityWindow, mergeAssetLists, mergeAssetsByUnit, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, redeemValueWithRequiredReferenceScript, resolveSharedSttReferenceScript, resolveSttScriptParams, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, subtractSelectedInputRemainder, validateForwardedStateDatum, withStage } from "./internals";
import { deriveAccessIndexRemovalStateDatum } from "@/lib/contracts/access-removal";
import { validateManagedStreamingPayments } from "@/lib/contracts/streaming-manage";
import { type OnChainStructuredAction, buildSttSpendRedeemerData, buildWalletSpendRedeemerData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getSttSpendScript, getWalletSpendScript, resolveScriptAddress, resolveWalletContinuingOutputAddressFromState, resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import {
  assertNonAdminStreamingActionWindow,
  crankSignerBypassesCooldown,
  crankSignerIsAuthorized
} from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import {
  deriveStreamingPaymentPayoutStateDatum,
  retagStreamingPaymentPayoutTransfers
} from "@/lib/contracts/streaming-payout";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import {
  assertTerminalRecoveryIsComplete,
  isTerminalBeneficiaryWithdrawal,
  TERMINAL_RECOVERY_WARNING
} from "@/lib/contracts/terminal-recovery";
import { fetchCredentialUtxos } from "@/lib/discovery/koios-client";
import { type Asset, type BuildResult, type ConstrData, type ContractConfig, type PayoutTransfer, type SttSpendFormInput } from "@/lib/types/contracts";
import { type BrowserWallet, type UTxO } from "@meshsdk/core";

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
  wallet: BrowserWallet,
  config: ContractConfig,
  action:
    | "use"
    | "renew-proof-of-life"
    | "update-state"
    | "manage-streaming-payments"
    | "use-allowance"
    | "use-beneficiary"
    | "payout-streaming-payment"
    | "cancel-streaming-payment"
    | "remove-access-index",
  input: SttSpendFormInput
): Promise<BuildResult> {
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

  // These actions derive their forwarded datum from the consumed state (the STT
  // value is preserved, not reshaped), so they carry no caller-supplied
  // outputDatum.
  const derivesForwardedDatum =
    action === "use-allowance" ||
    action === "remove-access-index" ||
    action === "cancel-streaming-payment";

  if (!derivesForwardedDatum) {
    assertValidConstrData(input.outputDatum, "STT output datum");
    assertValidAssetList(input.outputAssets, "STT output assets");
  }

  if (action === "remove-access-index" && !input.removeAccessTarget) {
    throw new Error("Removing an access entry requires a target (list and index).");
  }

  assertValidWalletInputRefs(walletInputs, "Locked contract inputs");
  assertValidWalletOutputs(walletOutputs, "Locked contract outputs");
  assertValidPayoutTransfers(extraTransfers, "Transfers / Forwarded Outputs");

  if (action === "use-allowance") {
    if (!input.allowanceSignerKeyHash?.trim()) {
      throw new Error(
        "Allowance Withdrawal requires the connected wallet payment key hash."
      );
    }

    if (walletInputs.length === 0) {
      throw new Error("Allowance Withdrawal requires at least one locked contract input.");
    }

    if (extraTransfers.length === 0) {
      throw new Error("Allowance Withdrawal requires at least one forwarded transfer.");
    }
  }

  const sttParams = resolveSttScriptParams(config);
  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
  let walletScript:
    | ReturnType<typeof getWalletSpendScript>
    | undefined;
  const forwardedDatum =
    derivesForwardedDatum
      ? null
      : unwrapStateDatum(input.outputDatum, "STT state datum");
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
  const prepared = await buildTransactionWithReestimatedLimits(
    "stt-spend:tx.draft-build",
    "stt-spend:tx.build",
    async (overrides) => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(
        wallet,
        input.validityWindowReferenceTimeMs
      );
      const spendValidatorsByRef = new Map<string, string>();
      let walletOutputCount = 0;
      let autoReturnedWalletAssets: Asset[] = [];
      let walletAddress: string | undefined;
      let allowanceTargetUserId: number | undefined;
      let beneficiaryTargetId: number | undefined;
      let forwardedAssets: Asset[] = [];
      let effectiveForwardedDatum: ConstrData;
      let effectiveOnChainAction = onChainAction;
      let beneficiaryInputStateDatum: ConstrData | null = null;
      let terminalRecovery = false;
      const resolvedWalletInputs: UTxO[] = [];
      let effectiveExtraTransfers = extraTransfers;
      const scriptUtxos = await withStage(
        "stt-spend:fetchScriptUtxos",
        async () => fetcher.fetchAddressUTxOs(sttAddress),
        { ...setupDiagnostics, sttAddress }
      );
      // Resolve the STT input by its txHash reference, falling back to the unique UTxO holding the
      // STT NFT when that reference is stale (a prior spend moved the state thread and the cached
      // detected-token UTxO hasn't refreshed past chain-indexer lag yet). See resolveSttInputUtxo.
      const sttInputParams = resolveSttScriptParams(config);
      const scriptInput = resolveSttInputUtxo(
        scriptUtxos,
        input.sttInputTxHash,
        input.sttInputOutputIndex,
        `${sttInputParams.sttPolicyId}${sttInputParams.sttAssetNameHex}`
      );
      if (action === "payout-streaming-payment") {
        effectiveExtraTransfers = retagStreamingPaymentPayoutTransfers(
          extraTransfers,
          scriptInput.input.txHash,
          scriptInput.input.outputIndex
        );
      }
      const validityWindow = getValidityWindow(input.validityWindowReferenceTimeMs);
      const earliestTimeMs = validityWindow.earliestTimeMs;
      const latestTimeMs = validityWindow.latestTimeMs;
      forwardedAssets =
        derivesForwardedDatum
          ? [...scriptInput.output.amount]
          : onChainAction.kind === "operator" &&
              onChainAction.operatorPath === "admin" &&
              onChainAction.operatorIntent === "use"
            ? mergeAssetsByUnit(input.outputAssets, scriptInput.output.amount)
            : mergeRestrictedSttAssets(
                input.outputAssets,
                scriptInput.output.amount,
                action === "manage-streaming-payments" ? "payout-streaming-payment" : action
              );
      const sttReferenceScript = await resolveSharedSttReferenceScript(fetcher, {
        configuredReference: config.sttSpendReference,
        script: sttScript,
        stage: "stt-spend:resolveSharedSttReferenceScript",
        details: { ...setupDiagnostics, sttAddress, action },
        excludedRefs: [createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex)]
      });

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
        // One-shot: forward the state with the acting beneficiary removed.
        const beneficiaryOutputDatum = deriveBeneficiaryWithdrawalStateDatum(
          sourceStateDatum,
          beneficiaryTargetId
        );
        effectiveOnChainAction = {
          kind: "beneficiary-withdrawal",
          beneficiaryId: beneficiaryTargetId
        };
        effectiveForwardedDatum = unwrapStateDatum(
          beneficiaryOutputDatum,
          "STT state datum"
        );
        beneficiaryInputStateDatum = sourceStateDatum;
        terminalRecovery = isTerminalBeneficiaryWithdrawal(
          sourceStateDatum,
          effectiveForwardedDatum
        );
      } else if (action === "payout-streaming-payment") {
        const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
        if (!sourceStateDatum) {
          throw new Error(
            "Streaming payment payout requires an inline STT state datum on the selected input."
          );
        }

        // AUTHORITY (security review 2026-07): the crank is no longer
        // permissionless. It must be signed by an admin, a multisig quorum, any
        // listed user, any stream payee, or an unlocked beneficiary. Fail fast
        // here rather than submitting a transaction the validator will reject,
        // and refuse outright when no signer is known, since an unsigned crank
        // can no longer succeed.
        if (!input.crankSignerKeyHash) {
          throw new Error(
            "Settling a streaming payment requires a signer: the crank is not permissionless. Connect a wallet that is an owner, a listed user, the stream's payee, or an unlocked backup person."
          );
        }
        if (
          !crankSignerIsAuthorized(
            sourceStateDatum,
            input.crankSignerKeyHash,
            earliestTimeMs
          )
        ) {
          throw new Error(
            "This wallet is not allowed to settle a scheduled payment here. Only an owner, a listed user, the payment's own recipient, or an unlocked backup person may settle."
          );
        }

        // Cadence clock: only an ADMIN bypasses the 30-minute limit, and an admin
        // crank must PRESERVE the stamp; every other authorized cranker STAMPS the
        // tx upper bound. Decide it the same way the validator would, from the
        // connected signer key hash, because a disagreement makes the tx fail. The
        // default validity window (~6 min) is well under the on-chain 1h cap.
        const preserveCooldownStamp = crankSignerBypassesCooldown(
          sourceStateDatum,
          input.crankSignerKeyHash,
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
      } else if (action === "cancel-streaming-payment") {
        const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
        if (!sourceStateDatum) {
          throw new Error(
            "Cancelling a streaming payment requires an inline STT state datum on the selected input."
          );
        }

        if (
          typeof input.streamingPaymentCancelId !== "number" ||
          !Number.isSafeInteger(input.streamingPaymentCancelId)
        ) {
          throw new Error(
            "Cancelling a streaming payment requires the target streaming-payment id."
          );
        }

        // Shorten the target to the earliest shape-safe cutoff at/after the tx
        // upper bound and advance the shared non-admin streaming-action clock.
        // The connected wallet is the required signer, so its payment-key hash
        // is what the on-chain receiver-authority check matches. STT value stays
        // preserved (derivesForwardedDatum branch above).
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
        const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
        if (!sourceStateDatum) {
          throw new Error(
            "Managing streaming payments requires an inline STT state datum on the selected input."
          );
        }
        const managePaymentErrors = validateManagedStreamingPayments(
          sourceStateDatum,
          effectiveForwardedDatum,
          latestTimeMs
        );
        if (managePaymentErrors.length > 0) {
          throw new Error(managePaymentErrors[0]);
        }
      }

      const forwardedStateWarnings = validateForwardedStateDatum(
        effectiveForwardedDatum,
        effectiveOnChainAction,
        "stt-spend:validateStateDatum",
        "Forwarded STT output datum is invalid."
      );
      if (terminalRecovery && beneficiaryInputStateDatum) {
        const credentialWideWalletUtxos = await withStage(
          "stt-spend:discoverTerminalWalletInputs",
          // Re-query on every draft/final build pass. Reusing the first indexer
          // snapshot would unnecessarily widen the race in which a newer UTxO
          // could be omitted and stranded after the last recovery path is gone.
          async () => fetchCredentialUtxos(walletPaymentScriptHash),
          { ...setupDiagnostics, walletPaymentScriptHash }
        );
        assertTerminalRecoveryIsComplete({
          inputStateDatum: beneficiaryInputStateDatum,
          selectedWalletInputs: resolvedWalletInputs,
          credentialWideWalletRefs: credentialWideWalletUtxos.map((utxo) => ({
            txHash: utxo.txHash,
            outputIndex: utxo.outputIndex
          })),
          walletOutputs,
          transfers: effectiveExtraTransfers
        });
        forwardedStateWarnings.push(TERMINAL_RECOVERY_WARNING);
      }

      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics(
        walletScript
          ? [
              { label: "STT", script: sttScript, reference: sttReferenceScript },
              {
                label: "Wallet spend",
                script: walletScript,
                reference: null
              }
            ]
          : [{ label: "STT", script: sttScript, reference: sttReferenceScript }]
      );

      spendValidatorsByRef.set(
        createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex),
        STT_SPEND_VALIDATOR
      );
      const sttRedeemer = {
        data: buildSttSpendRedeemerData(effectiveOnChainAction),
        budget: overrides?.spendBudgetsByRef.get(
          createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex)
        )
      };
      redeemValueWithRequiredReferenceScript(tx, scriptInput, sttReferenceScript, sttRedeemer);

      sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        sttAddress,
        forwardedAssets,
        effectiveForwardedDatum
      );

      for (const transfer of effectiveExtraTransfers) {
        tx.sendAssets(
          recipientWithOptionalInlineDatum(transfer.address, transfer.inlineDatum),
          transfer.amount
        );
      }

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          action,
          sttAddress,
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
          beneficiaryTargetId,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          scriptInputRef: createInputRefKey(
            scriptInput.input.txHash,
            scriptInput.input.outputIndex
          ),
          walletOutputCount,
          allowanceTargetUserId,
          beneficiaryTargetId,
          warnings: forwardedStateWarnings,
          referenceScriptUsage: scriptWitnessDiagnostics
            ? describeReferenceScriptUsage(scriptWitnessDiagnostics)
            : ""
        }
      };
    }
  );

  const walletOutputCount =
    typeof prepared.context?.walletOutputCount === "number"
      ? prepared.context.walletOutputCount
      : 0;
  const scriptInputRef =
    typeof prepared.context?.scriptInputRef === "string"
      ? prepared.context.scriptInputRef
      : `${input.sttInputTxHash}#${input.sttInputOutputIndex ?? 0}`;
  const allowanceTargetUserId =
    typeof prepared.context?.allowanceTargetUserId === "number"
      ? prepared.context.allowanceTargetUserId
      : null;
  const beneficiaryTargetId =
    typeof prepared.context?.beneficiaryTargetId === "number"
      ? prepared.context.beneficiaryTargetId
      : null;
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      action,
      `Spend STT input ${scriptInputRef} with redeemer ${action}${allowanceTargetUserId !== null ? ` for user ${allowanceTargetUserId}` : ""}${beneficiaryTargetId !== null ? ` for beneficiary ${beneficiaryTargetId}` : ""}${walletInputs.length > 0 ? ` and ${walletInputs.length} locked input(s)` : ""}${payoutFundingSource === "connected-wallet" ? " funded by the connected wallet" : ""}${walletOutputCount > 0 ? ` plus ${walletOutputCount} locked output(s)` : ""}${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits,
    warnings: Array.isArray(prepared.context?.warnings)
      ? (prepared.context.warnings as string[])
      : undefined
  };
}
