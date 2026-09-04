"use client";
import { useTranslations } from "next-intl";

import { sharedReferenceBuildErrorAtom, sharedReferenceBusyAtom, sharedReferencePreviewAtom, sharedReferenceSubmitHashAtom, sharedSttReferenceStoreAtom, sharedSttReferenceStoreErrorAtom, sharedSttReferenceStoreLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import { useCallback, useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";
import { detectSharedSttReferenceStore } from "@/lib/mesh/detection";
import {
  buildDeploySharedSttReferenceTx,
  DEFAULT_SHARED_STT_REFERENCE_LOVELACE,
  signAndSubmitTx
} from "@/lib/mesh/transactions";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

type UseSharedSttReferenceInputs = {
  activeWallet: BrowserWallet | null;
  /** Start the public setup-helper lookup once wallet connection begins. */
  enabled: boolean;
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
export function useSharedSttReference({ activeWallet, enabled, isDemoWallet }: UseSharedSttReferenceInputs) {
  const i18n = useTranslations("ComponentsUserWorkspaceUseSharedSttReference");
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
    if (!enabled) {
      // A later connection should enter the existing "checking" state instead
      // of briefly reporting that setup is needed before this read starts.
      setSharedSttReferenceStoreLoading(true);
      setSharedSttReferenceStoreError(null);
      return;
    }

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
            getUserFacingErrorMessage(error, i18n("couldNotCheckTheOneTimeSetup"))
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
  }, [enabled, i18n, setSharedSttReferenceStore, setSharedSttReferenceStoreError, setSharedSttReferenceStoreLoading]);

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
        getUserFacingErrorMessage(error, i18n("couldNotCheckTheOneTimeSetup"))
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
      setSharedReferenceBuildError(i18n("connectAPreprodWalletBeforeStartingTheOne"));
      return;
    }

    if (isDemoWallet) {
      setSharedReferenceBuildError(
        i18n("theDemoIsReadOnlyConnectABrowser")
      );
      return;
    }

    sharedReferenceInFlightRef.current = true;
    setSharedReferenceBusy("build");
    setSharedReferenceBuildError(null);
    setSharedReferenceSubmitHash(null);
    setSharedReferencePreview(null);

    let txHash: string;
    try {
      const nextPreview = await buildDeploySharedSttReferenceTx(activeWallet, {
        lockedLovelace: DEFAULT_SHARED_STT_REFERENCE_LOVELACE,
        useExactLovelace: false,
        allowDuplicateCurrentScriptReferences: false
      });
      setSharedReferencePreview(nextPreview);
      setSharedReferenceBusy("submit");
      txHash = await signAndSubmitTx(activeWallet, nextPreview.txHex);
    } catch (error) {
      setSharedReferenceBuildError(
        getUserFacingErrorMessage(error, i18n("couldNotCompleteTheOneTimeSetup"))
      );
      setSharedReferenceBusy(null);
      sharedReferenceInFlightRef.current = false;
      return;
    }

    try {
      setSharedReferenceSubmitHash(txHash);
      setSharedReferencePreview(null);
      try {
        await refreshSharedSttReferenceStore();
      } catch {
        // The transaction succeeded. The refresh reports its own read error.
      }
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
