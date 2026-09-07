"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { detectSharedSttReferenceStore } from "@/lib/mesh/detection";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { configAtom } from "./atoms/workspace-config.atoms";
import {
  sharedReferenceBuildErrorAtom,
  sharedReferencePreviewAtom,
  sharedReferenceSubmitHashAtom,
  sharedSttReferenceStoreAtom,
  sharedSttReferenceStoreErrorAtom,
  sharedSttReferenceStoreLoadingAtom
} from "./atoms/workspace-data.atoms";

/** Loads infrastructure configuration from the server. This hook never signs transactions. */
export function useSharedSttReference({ enabled }: { enabled: boolean }) {
  const i18n = useTranslations("ComponentsUserWorkspaceUseSharedSttReference");
  const setConfig = useSetAtom(configAtom);
  const setStore = useSetAtom(sharedSttReferenceStoreAtom);
  const setLoading = useSetAtom(sharedSttReferenceStoreLoadingAtom);
  const setError = useSetAtom(sharedSttReferenceStoreErrorAtom);
  const setPreview = useSetAtom(sharedReferencePreviewAtom);
  const setBuildError = useSetAtom(sharedReferenceBuildErrorAtom);
  const setSubmitHash = useSetAtom(sharedReferenceSubmitHashAtom);
  const requestId = useRef(0);

  const refreshSharedSttReferenceStore = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const store = await detectSharedSttReferenceStore();
      if (currentRequest === requestId.current) {
        setStore(store);
        setConfig((config) => ({ ...config, sttSpendReference: store.activeReference ?? "" }));
      }
      return store;
    } catch (error) {
      if (currentRequest === requestId.current) {
        setStore(null);
        setConfig((config) => ({ ...config, sttSpendReference: "" }));
        setError(getUserFacingErrorMessage(error, i18n("couldNotCheckTheOneTimeSetup")));
      }
      throw error;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [i18n, setConfig, setError, setLoading, setStore]);

  const cancelPendingRead = useCallback(() => { requestId.current++; }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }
    void refreshSharedSttReferenceStore().catch(() => undefined);
    return cancelPendingRead;
  }, [enabled, refreshSharedSttReferenceStore, setLoading, cancelPendingRead]);

  // Keep workspace reset behavior for previews left by an earlier session.
  const resetSharedReferencePreview = useCallback(() => {
    setPreview(null);
    setBuildError(null);
    setSubmitHash(null);
  }, [setBuildError, setPreview, setSubmitHash]);

  return { refreshSharedSttReferenceStore, resetSharedReferencePreview };
}
