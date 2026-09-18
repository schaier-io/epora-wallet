import { assertSerializedTransactionSizeIsBounded, createStageError, extractComputedScriptIntegrity, isLikelyTransactionCbor, normalizeError, readScriptDataHash, refreshScriptDataHashWithLiveCostModels, setScriptDataHash, withStage } from "./internals";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { resolveTxHash, type BrowserWallet } from "@meshsdk/core";
import { addVKeyWitnessSetToTransaction, deserializeTx, type CstTransaction } from "@/lib/mesh/cst";
// Imported directly, not through the internals barrel: submit.test.tsx mocks
// "./internals", and a barrel re-export would be shadowed by that mock factory.
import { assertVKeyWitnessesSignTxBody } from "./internals/witness-body-binding";

export async function signAndSubmitTx(
  wallet: BrowserWallet,
  txHex: string,
  options: {
    assertCurrent?: () => void | Promise<void>;
    beforeBroadcast?: (transaction: { txHash: string; invalidHereafter?: number }) => void;
  } = {}
) {
  const fetcher = new ServerFetcher();
  const scriptDataHashRefresh = await refreshScriptDataHashWithLiveCostModels(
    txHex,
    fetcher
  );
  const txHexWithLiveScriptDataHash = scriptDataHashRefresh.txHex;
  const expectedScriptDataHash = scriptDataHashRefresh.afterHash;
  const signWithExpectedHash = async (
    unsignedTxHex: string,
    expectedHash: string | null,
    diagnostics: Record<string, unknown>
  ) => {
    const unsignedScriptDataHash = readScriptDataHash(unsignedTxHex);
    if (expectedHash && unsignedScriptDataHash !== expectedHash) {
      throw createStageError(
        "submit:scriptDataHashVerification",
        new Error(
          "The transaction was prepared with a different protocol-parameter hash than expected."
        ),
        {
          ...diagnostics,
          expectedScriptDataHash: expectedHash,
          unsignedScriptDataHash
        }
      );
    }

    await options.assertCurrent?.();
    // The ledger verifies every vkey signature over exactly this body hash, so
    // a witness made for any other body would make the transaction invalid.
    const intendedBodyHash = resolveTxHash(unsignedTxHex);
    const signedPayload = await wallet.signTx(unsignedTxHex, true);
    const normalizedSignedPayload = signedPayload.trim();
    let signed = unsignedTxHex;
    let signerPayloadKind = "witness-set";
    let returnedTxScriptDataHash: string | null = null;

    // Single chokepoint for splicing wallet-provided vkey witnesses into our
    // body: each merged signature is verified against the intended body hash
    // first, so a witness made for a different transaction can never be
    // merged and submitted (issue #384).
    const mergeWalletWitnesses = (witnessSetHex: string) => {
      try {
        assertVKeyWitnessesSignTxBody({
          txBodyHash: intendedBodyHash,
          witnessSetHex
        });
      } catch (error) {
        throw createStageError("submit:witnessBodyVerification", error, {
          ...diagnostics,
          intendedBodyHash,
          unsignedScriptDataHash,
          returnedTxScriptDataHash
        });
      }
      return addVKeyWitnessSetToTransaction(unsignedTxHex, witnessSetHex);
    };

    if (isLikelyTransactionCbor(normalizedSignedPayload)) {
      let returnedTx: CstTransaction | null = null;
      try {
        // Some wallets return the full signed transaction CBOR instead of only the vkey witness set.
        returnedTx = deserializeTx(normalizedSignedPayload);
      } catch {
        returnedTx = null;
      }

      if (returnedTx) {
        returnedTxScriptDataHash =
          returnedTx.body().scriptDataHash()?.toString() ?? null;

        if (!expectedHash || returnedTxScriptDataHash === expectedHash) {
          signed = normalizedSignedPayload;
          signerPayloadKind = "full-transaction";
        } else {
          // The wallet signed its own stale body. Its witnesses are only
          // usable when they still verify against the body we intend to
          // broadcast; anything else would submit invalid signatures.
          signed = mergeWalletWitnesses(returnedTx.witnessSet().toCbor().toString());
          signerPayloadKind = "full-transaction-stale-body-witness-merged";
        }
      } else {
        signed = mergeWalletWitnesses(normalizedSignedPayload);
        signerPayloadKind = "witness-set";
      }
    } else {
      signed = mergeWalletWitnesses(normalizedSignedPayload);
    }

    const signedScriptDataHash = readScriptDataHash(signed);
    if (expectedHash && signedScriptDataHash !== expectedHash) {
      throw createStageError(
        "submit:scriptDataHashVerification",
        new Error(
          "The wallet returned a signature payload that still does not match the corrected transaction body."
        ),
        {
          ...diagnostics,
          expectedScriptDataHash: expectedHash,
          unsignedScriptDataHash,
          returnedTxScriptDataHash,
          signerPayloadKind,
          signedScriptDataHash
        }
      );
    }

    return {
      signed,
      unsignedScriptDataHash,
      signedScriptDataHash,
      signerPayloadKind,
      returnedTxScriptDataHash
    };
  };

  const submitSigned = async (
    signed: string,
    diagnostics: Record<string, unknown>
  ) => {
    await withStage(
      "submit:validate-transaction-bounds",
      async () => assertSerializedTransactionSizeIsBounded(signed),
      diagnostics
    );
    await options.assertCurrent?.();
    if (options.beforeBroadcast) {
      const ttl = deserializeTx(signed).body().ttl();
      const slot = ttl === undefined ? undefined : Number(ttl);
      options.beforeBroadcast({ txHash: resolveTxHash(signed),
        ...(slot !== undefined && Number.isSafeInteger(slot) && slot >= 0 ? { invalidHereafter: slot } : {}) });
    }
    try {
      return await withStage(
        "submit:wallet.submitTx",
        async () => wallet.submitTx(signed),
        diagnostics
      );
    } catch (error) {
      const walletComputedScriptIntegrity = extractComputedScriptIntegrity(error);
      if (walletComputedScriptIntegrity) {
        throw createStageError(
          "submit:scriptIntegrityMismatch",
          error,
          {
            ...diagnostics,
            computedScriptIntegrity: walletComputedScriptIntegrity,
            submitSource: "wallet"
          }
        );
      }

      return withStage(
        "submit:blockfrost.submitTx",
        async () => {
          await options.assertCurrent?.();
          return fetcher.submitTx(signed);
        },
        {
          ...diagnostics,
          walletSubmitError: normalizeError(error)
        }
      );
    }
  };

  const submitDiagnostics: Record<string, unknown> = {
    previewScriptDataHash: scriptDataHashRefresh.beforeHash,
    refreshedScriptDataHash: expectedScriptDataHash,
    scriptDataHashChanged: scriptDataHashRefresh.changed
  };
  const signedResult = await signWithExpectedHash(
    txHexWithLiveScriptDataHash,
    expectedScriptDataHash,
    submitDiagnostics
  );
  const firstSubmitDiagnostics = {
    ...submitDiagnostics,
    unsignedScriptDataHash: signedResult.unsignedScriptDataHash,
    signedScriptDataHash: signedResult.signedScriptDataHash,
    signerPayloadKind: signedResult.signerPayloadKind,
    returnedTxScriptDataHash: signedResult.returnedTxScriptDataHash
  };

  try {
    return await submitSigned(signedResult.signed, firstSubmitDiagnostics);
  } catch (error) {
    const computedScriptIntegrity = extractComputedScriptIntegrity(error);
    const currentScriptDataHash = readScriptDataHash(txHexWithLiveScriptDataHash);

    if (!computedScriptIntegrity || computedScriptIntegrity === currentScriptDataHash) {
      throw error;
    }

    const correctedTxHex = setScriptDataHash(
      txHexWithLiveScriptDataHash,
      computedScriptIntegrity
    );
    const correctedUnsignedScriptDataHash = readScriptDataHash(correctedTxHex);
    const correctionDiagnostics: Record<string, unknown> = {
      ...firstSubmitDiagnostics,
      correctedScriptDataHash: computedScriptIntegrity,
      correctedUnsignedScriptDataHash,
      correctionSource: "submit-computed-script-integrity",
      previousSubmitError: normalizeError(error)
    };
    const correctedSignedResult = await signWithExpectedHash(
      correctedTxHex,
      computedScriptIntegrity,
      correctionDiagnostics
    );

    return submitSigned(correctedSignedResult.signed, {
      ...correctionDiagnostics,
      unsignedScriptDataHash: correctedSignedResult.unsignedScriptDataHash,
      signedScriptDataHash: correctedSignedResult.signedScriptDataHash,
      signerPayloadKind: correctedSignedResult.signerPayloadKind,
      returnedTxScriptDataHash: correctedSignedResult.returnedTxScriptDataHash
    });
  }
}
