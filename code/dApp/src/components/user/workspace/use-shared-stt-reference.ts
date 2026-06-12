"use client";
import { sharedReferenceBuildErrorAtom, sharedReferenceBusyAtom, sharedReferencePreviewAtom, sharedReferenceSubmitHashAtom, sharedSttReferenceStoreAtom, sharedSttReferenceStoreErrorAtom, sharedSttReferenceStoreLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import { useCallback, useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";
import { detectSharedSttReferenceStore } from "@/lib/mesh/detection";
import { buildDeploySharedSttReferenceTx, signAndSubmitTx } from "@/lib/mesh/transactions";

type UseSharedSttReferenceInputs = {
  activeWallet: BrowserWallet | null;
  isDemoWallet: boolean;
};

/**
 * The shared STT reference-script "setup helper": inspects whether the shared
 * reference store exists on mount, and builds + submits the deploy transaction
 * that creates it. Extracted verbatim from `permission-wallet-workspace.tsx`.
 *
 * Note: `createInlineSharedReference` signs and submits a real transaction, so
 * changes here need manual signing QA of the setup-helper flow.
 */
export function useSharedSttReference({ activeWallet, isDemoWallet }: UseSharedSttReferenceInputs) {
  const setSharedSttReferenceStore = useSetAtom(sharedSttReferenceStoreAtom);
  const setSharedSttReferenceStoreLoading = useSetAtom(sharedSttReferenceStoreLoadingAtom);
  const setSharedSttReferenceStoreError = useSetAtom(sharedSttReferenceStoreErrorAtom);
  const setSharedReferencePreview = useSetAtom(sharedReferencePreviewAtom);
  const setSharedReferenceBuildError = useSetAtom(sharedReferenceBuildErrorAtom);
  const setSharedReferenceSubmitHash = useSetAtom(sharedReferenceSubmitHashAtom);
  const [sharedReferenceBusy, setSharedReferenceBusy] = useAtom(sharedReferenceBusyAtom);
  const sharedReferenceInFlightRef = useRef(false);

  useEffect(() => {
    // Legitimate data-fetch effect (inspects the shared setup helper on mount).
     
    let cancelled = false;
    setSharedSttReferenceStoreLoading(true);
    setSharedSttReferenceStoreError(null);

    void detectSharedSttReferenceStore()
      .then((storeInfo) => {
        if (!cancelled) {
          setSharedSttReferenceStore(storeInfo);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSharedSttReferenceStore(null);
          setSharedSttReferenceStoreError(
            error instanceof Error
              ? error.message
              : "Unable to inspect the setup helper."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSharedSttReferenceStoreLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setSharedSttReferenceStore, setSharedSttReferenceStoreError, setSharedSttReferenceStoreLoading]);

  async function refreshSharedSttReferenceStore() {
    setSharedSttReferenceStoreLoading(true);
    setSharedSttReferenceStoreError(null);

    try {
      const storeInfo = await detectSharedSttReferenceStore();
      setSharedSttReferenceStore(storeInfo);
      return storeInfo;
    } catch (error) {
      setSharedSttReferenceStore(null);
      setSharedSttReferenceStoreError(
        error instanceof Error
          ? error.message
          : "Unable to inspect the setup helper."
      );
      throw error;
    } finally {
      setSharedSttReferenceStoreLoading(false);
    }
  }

  async function createInlineSharedReference() {
    // Synchronous re-entry guard: `sharedReferenceBusy` is React state and
    // a rapid double-click can pass the check below before the re-render.
    if (sharedReferenceInFlightRef.current || sharedReferenceBusy) {
      return;
    }

    if (!activeWallet) {
      setSharedReferenceBuildError("Connect a preprod wallet before creating the setup helper.");
      return;
    }

    if (isDemoWallet) {
      setSharedReferenceBuildError(
        "Demo wallet is read-only. Connect a browser wallet before creating the setup helper."
      );
      return;
    }

    sharedReferenceInFlightRef.current = true;
    setSharedReferenceBusy("build");
    setSharedReferenceBuildError(null);
    setSharedReferenceSubmitHash(null);
    setSharedReferencePreview(null);

    try {
      const nextPreview = await buildDeploySharedSttReferenceTx(activeWallet, {
        lockedLovelace: "5000000",
        useExactLovelace: false,
        allowDuplicateCurrentScriptReferences: false
      });
      setSharedReferencePreview(nextPreview);
      setSharedReferenceBusy("submit");
      const txHash = await signAndSubmitTx(activeWallet, nextPreview.txHex);
      setSharedReferenceSubmitHash(txHash);
      setSharedReferencePreview(null);
      await refreshSharedSttReferenceStore();
    } catch (error) {
      setSharedReferenceBuildError(
        error instanceof Error
          ? error.message
          : "Unable to create the setup helper."
      );
    } finally {
      setSharedReferenceBusy(null);
      sharedReferenceInFlightRef.current = false;
    }
  }

  // Clears the in-progress preview/result (used by the cross-cutting form resets
  // that fire on wallet/token switch). Stable identity so callers can list it in
  // effect dependency arrays without retriggering.
  const resetSharedReferencePreview = useCallback(() => {
    setSharedReferencePreview(null);
    setSharedReferenceBuildError(null);
    setSharedReferenceSubmitHash(null);
  }, [setSharedReferenceBuildError, setSharedReferencePreview, setSharedReferenceSubmitHash]);

  return {
    refreshSharedSttReferenceStore,
    createInlineSharedReference,
    resetSharedReferencePreview
  };
}
