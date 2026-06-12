import { createStageError, extractComputedScriptIntegrity, isLikelyTransactionCbor, normalizeError, readScriptDataHash, refreshScriptDataHashWithLiveCostModels, setScriptDataHash, withStage } from "./internals";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type BrowserWallet } from "@meshsdk/core";
import { addVKeyWitnessSetToTransaction, deserializeTx } from "@/lib/mesh/cst";

export async function signAndSubmitTx(wallet: BrowserWallet, txHex: string) {
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

    const signedPayload = await wallet.signTx(unsignedTxHex, true);
    const normalizedSignedPayload = signedPayload.trim();
    let signed = unsignedTxHex;
    let signerPayloadKind = "witness-set";
    let returnedTxScriptDataHash: string | null = null;

    if (isLikelyTransactionCbor(normalizedSignedPayload)) {
      try {
        // Some wallets return the full signed transaction CBOR instead of only the vkey witness set.
        const returnedTx = deserializeTx(normalizedSignedPayload);
        returnedTxScriptDataHash =
          returnedTx.body().scriptDataHash()?.toString() ?? null;

        if (!expectedHash || returnedTxScriptDataHash === expectedHash) {
          signed = normalizedSignedPayload;
          signerPayloadKind = "full-transaction";
        } else {
          // Keep our corrected body and only take the wallet-provided vkey witnesses.
          signed = addVKeyWitnessSetToTransaction(
            unsignedTxHex,
            returnedTx.witnessSet().toCbor().toString()
          );
          signerPayloadKind = "full-transaction-stale-body-witness-merged";
        }
      } catch {
        signed = addVKeyWitnessSetToTransaction(unsignedTxHex, normalizedSignedPayload);
        signerPayloadKind = "witness-set";
      }
    } else {
      signed = addVKeyWitnessSetToTransaction(unsignedTxHex, normalizedSignedPayload);
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

      console.warn("[submit] wallet.submitTx failed, retrying through server proxy", error);
      return withStage(
        "submit:blockfrost.submitTx",
        async () => fetcher.submitTx(signed),
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

