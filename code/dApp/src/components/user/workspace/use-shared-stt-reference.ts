"use client";
import { useCallback, useEffect } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { configAtom } from "./atoms/workspace-config.atoms";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { sharedReferenceBuildErrorAtom, sharedReferencePreviewAtom, sharedReferenceSubmitHashAtom } from "./atoms/workspace-data.atoms";
import { sharedReferenceQueryAtom, sharedReferenceQueryOptions } from "./queries/shared-reference.atoms";

export function useSharedSttReference() {
  const client = useAtomValue(queryClientAtom);
  const store = useStore();
  const result = useAtomValue(sharedReferenceQueryAtom);
  const setConfig = useSetAtom(configAtom);
  const setPreview = useSetAtom(sharedReferencePreviewAtom);
  const setBuildError = useSetAtom(sharedReferenceBuildErrorAtom);
  const setSubmitHash = useSetAtom(sharedReferenceSubmitHashAtom);
  useEffect(() => {
    if (!result.data && !result.error) return;
    const reference = result.data?.activeReference ?? "";
    setConfig((current) => current.sttSpendReference === reference ? current : { ...current, sttSpendReference: reference });
  }, [result.data, result.error, setConfig]);
  const refreshSharedSttReferenceStore = useCallback(async () => {
    const session = store.get(workspaceSessionAtom);
    const options = sharedReferenceQueryOptions();
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
    if (store.get(workspaceSessionAtom) !== session) return null;
    return client.fetchQuery(options);
  }, [client, store]);
  const resetSharedReferencePreview = useCallback(() => {
    setPreview(null); setBuildError(null); setSubmitHash(null);
  }, [setBuildError, setPreview, setSubmitHash]);
  return { refreshSharedSttReferenceStore, resetSharedReferencePreview };
}
