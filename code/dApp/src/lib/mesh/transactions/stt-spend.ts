import { STT_SPEND_VALIDATOR, WALLET_SPEND_VALIDATOR, assertValidAssetList, assertValidConstrData, assertValidPayoutTransfers, assertValidWalletInputRefs, assertValidWalletOutputs, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, decodeConstrDatumFromUtxo, deriveBeneficiaryWithdrawalId, deriveBeneficiaryWithdrawalStateDatum, describeReferenceScriptUsage, ensureUniqueWalletInputRefs, findUtxo, resolveSttInputUtxo, getValidityWindow, mergeAssetLists, mergeAssetsByUnit, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, redeemValueWithRequiredReferenceScript, resolveSharedSttReferenceScript, resolveSttScriptParams, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, subtractSelectedInputRemainder, validateForwardedStateDatum, withStage, withWalletWitness } from "./internals";
import { deriveAccessIndexRemovalStateDatum } from "@/lib/contracts/access-removal";
import { type OnChainStructuredAction, buildSttSpendRedeemerData, buildWalletSpendRedeemerData, buildWalletWitnessData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { getSttSpendScript, getWalletSpendScript, resolveScriptAddress, resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { crankSignerBypassesCooldown } from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import { type Asset, type BuildResult, type ConstrData, type ContractConfig, type SttSpendFormInput } from "@/lib/types/contracts";
import { type BrowserWallet, type UTxO } from "@meshsdk/core";

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

  const sttParams = walletInputs.length > 0 ? resolveSttScriptParams(config) : null;
  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
  let walletScript:
    | ReturnType<typeof getWalletSpendScript>
    | undefined;
  const forwardedDatum =
    derivesForwardedDatum
      ? null
      : withWalletWitness(input.outputDatum, buildWalletWitnessData(onChainAction));
  if (walletInputs.length > 0) {
    if (!sttParams) {
      throw new Error("Wallet script parameters are missing for locked wallet inputs.");
    }
    walletScript = getWalletSpendScript({
      sttPolicyId: sttParams.sttPolicyId,
      sttAssetNameHex: sttParams.sttAssetNameHex
    });
  }
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
      const resolvedWalletInputs: UTxO[] = [];
      const effectiveExtraTransfers = extraTransfers;
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
        if (!sttParams) {
          throw new Error("Wallet script parameters are missing for locked wallet inputs.");
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
        const walletScriptUtxos = await withStage(
          "stt-spend:fetchWalletUtxos",
          async () => fetcher.fetchAddressUTxOs(resolvedWalletAddress),
          { ...setupDiagnostics, action, walletAddress: resolvedWalletAddress }
        );

        for (const walletInputRef of walletInputs) {
          const walletInput = findUtxo(
            walletScriptUtxos,
            walletInputRef.txHash,
            walletInputRef.outputIndex
          );
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
        effectiveForwardedDatum = withWalletWitness(
          allowanceComputation.outputDatum,
          allowanceComputation.walletWitness
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
        effectiveForwardedDatum = withWalletWitness(
          beneficiaryOutputDatum,
          buildWalletWitnessData(effectiveOnChainAction)
        );
      } else if (action === "payout-streaming-payment") {
        const sourceStateDatum = decodeConstrDatumFromUtxo(scriptInput);
        if (!sourceStateDatum) {
          throw new Error(
            "Streaming payment payout requires an inline STT state datum on the selected input."
          );
        }

        // Cooldown clock (ADR-0009): a PERMISSIONLESS crank stamps the tx upper
        // bound; an AUTHORIZED crank (admin / multisig quorum / unlocked
        // beneficiary signing as the required signer) bypasses the cooldown and
        // must PRESERVE the field instead, or the on-chain bypass branch rejects
        // the tx. Decide it the same way the validator would, from the connected
        // signer key hash. With no signer key hash supplied we treat the crank as
        // permissionless (stamp) — the on-chain default for an unauthenticated
        // crank. The default validity window (~6 min) is well under the on-chain
        // 1h cap.
        const preserveCooldownStamp = input.crankSignerKeyHash
          ? crankSignerBypassesCooldown(
              sourceStateDatum,
              input.crankSignerKeyHash,
              earliestTimeMs
            )
          : false;
        const payoutComputation = deriveStreamingPaymentPayoutStateDatum(
          sourceStateDatum,
          effectiveExtraTransfers,
          latestTimeMs,
          preserveCooldownStamp
        );
        effectiveOnChainAction = {
          kind: "streaming-payment-payout",
          payoutDelta: payoutComputation.payoutDelta
        };
        effectiveForwardedDatum = withWalletWitness(
          payoutComputation.outputDatum,
          buildWalletWitnessData(effectiveOnChainAction)
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

        // Cap the targeted payment's end_date at the tx upper bound ("now"). The
        // connected wallet is the tx's required signer, so the payee's signature
        // lands in `extra_signatories` — exactly what the on-chain
        // `has_streaming_payment_payee_authority` checks against the payout
        // address. STT value is preserved (derivesForwardedDatum branch above).
        const cancellation = deriveStreamingPaymentCancellationStateDatum(
          sourceStateDatum,
          input.streamingPaymentCancelId,
          latestTimeMs
        );
        effectiveOnChainAction = {
          kind: "streaming-payment-cancellation",
          streamingPaymentId: input.streamingPaymentCancelId
        };
        effectiveForwardedDatum = withWalletWitness(
          cancellation.outputDatum,
          buildWalletWitnessData(effectiveOnChainAction)
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
        effectiveForwardedDatum = withWalletWitness(
          removalOutputDatum,
          buildWalletWitnessData(effectiveOnChainAction)
        );
      } else {
        effectiveForwardedDatum = forwardedDatum!;
      }

      const forwardedStateWarnings = validateForwardedStateDatum(
        effectiveForwardedDatum,
        effectiveOnChainAction,
        "stt-spend:validateStateDatum",
        "Forwarded STT output datum is invalid."
      );

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
      `Spend STT input ${scriptInputRef} with redeemer ${action}${allowanceTargetUserId !== null ? ` for user ${allowanceTargetUserId}` : ""}${beneficiaryTargetId !== null ? ` for beneficiary ${beneficiaryTargetId}` : ""}${walletInputs.length > 0 ? ` and ${walletInputs.length} locked input(s)` : ""}${walletOutputCount > 0 ? ` plus ${walletOutputCount} locked output(s)` : ""}${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits,
    warnings: Array.isArray(prepared.context?.warnings)
      ? (prepared.context.warnings as string[])
      : undefined
  };
}

