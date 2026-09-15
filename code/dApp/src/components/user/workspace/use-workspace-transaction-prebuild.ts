"use client";

import { useAtomValue, useStore } from "jotai";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { AuthorityPath, BuildResult } from "@/lib/types/contracts";
import {
  activeBuildAtom,
  activeSubmitAtom,
  buildRunAtom,
  invalidateBuildAtom,
  previewSignatureAtom,
  submitHashAtom,
  workspaceSessionAtom
} from "./atoms/transaction-flow.atoms";
import {
  PREPARED_TRANSACTION_MAX_AGE_MS,
  preparedWorkspaceTransactionAtom,
  workspaceTransactionSnapshotAtom
} from "./workspace-prepared-transaction";

export const TRANSACTION_PREBUILD_DEBOUNCE_MS = 300;

type PrebuildOptions = {
  enabled: boolean;
  authorityPathOverride?: AuthorityPath;
  buildSelectedActionTx: (authorityPathOverride?: AuthorityPath) => Promise<BuildResult | null>;
};

export function useWorkspaceTransactionPrebuild({
  enabled,
  authorityPathOverride,
  buildSelectedActionTx
}: PrebuildOptions) {
  const store = useStore();
  const snapshot = useAtomValue(workspaceTransactionSnapshotAtom);
  const session = useAtomValue(workspaceSessionAtom);
  const prepared = useAtomValue(preparedWorkspaceTransactionAtom);
  const buildRun = useAtomValue(buildRunAtom);
  const activeBuild = useAtomValue(activeBuildAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const submitHash = useAtomValue(submitHashAtom);
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && !document.hidden);
  const attempted = useRef<{
    snapshot: string;
    session: typeof session;
    authorityPathOverride: AuthorityPath | undefined;
  } | null>(null);
  const ownedRun = useRef<number | null>(null);
  const buildLatest = useEffectEvent(buildSelectedActionTx);

  // Store subscriptions retire stale runs before React processes the next render.
  useEffect(() => {
    let previousSnapshot = store.get(workspaceTransactionSnapshotAtom);
    let previousSession = store.get(workspaceSessionAtom);
    const invalidate = () => {
      const nextSnapshot = store.get(workspaceTransactionSnapshotAtom);
      const nextSession = store.get(workspaceSessionAtom);
      if (nextSnapshot === previousSnapshot && nextSession === previousSession) return;
      previousSnapshot = nextSnapshot;
      previousSession = nextSession;
      attempted.current = null;
      store.set(invalidateBuildAtom);
      store.set(preparedWorkspaceTransactionAtom, null);
      store.set(previewSignatureAtom, null);
    };
    const unsubscribeSnapshot = store.sub(workspaceTransactionSnapshotAtom, invalidate);
    const unsubscribeSession = store.sub(workspaceSessionAtom, invalidate);
    return () => {
      unsubscribeSnapshot();
      unsubscribeSession();
    };
  }, [store]);

  useEffect(() => {
    const retireOwnedRun = () => {
      if (ownedRun.current !== null && store.get(buildRunAtom) === ownedRun.current) {
        store.set(invalidateBuildAtom);
        attempted.current = null;
      }
      ownedRun.current = null;
    };
    const onVisibilityChange = () => {
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      retireOwnedRun();
    };
  }, [store]);

  useEffect(() => {
    const previous = attempted.current;
    if (previous && previous.authorityPathOverride !== authorityPathOverride) {
      attempted.current = null;
      store.set(invalidateBuildAtom);
      store.set(preparedWorkspaceTransactionAtom, null);
      store.set(previewSignatureAtom, null);
      if (prepared || activeBuild) return;
    }
    if (!enabled || !visible || activeBuild || activeSubmit || submitHash) return;

    if (prepared) {
      const expire = () => {
        if (store.get(preparedWorkspaceTransactionAtom) !== prepared) return;
        attempted.current = null;
        store.set(preparedWorkspaceTransactionAtom, null);
        store.set(previewSignatureAtom, null);
      };
      const remaining = prepared.builtAt + PREPARED_TRANSACTION_MAX_AGE_MS - Date.now();
      if (prepared.buildRun !== buildRun || prepared.session !== session ||
        prepared.snapshot !== snapshot || Date.now() < prepared.builtAt || remaining <= 0) {
        expire();
        return;
      }
      const expiryTimer = window.setTimeout(expire, remaining);
      return () => window.clearTimeout(expiryTimer);
    }

    if (previous?.snapshot === snapshot && previous.session === session &&
      previous.authorityPathOverride === authorityPathOverride) return;

    const timer = window.setTimeout(() => {
      if (document.hidden || store.get(activeBuildAtom) || store.get(activeSubmitAtom) ||
        store.get(submitHashAtom) || store.get(workspaceTransactionSnapshotAtom) !== snapshot ||
        store.get(workspaceSessionAtom) !== session) return;
      attempted.current = { snapshot, session, authorityPathOverride };
      const beforeRun = store.get(buildRunAtom);
      const build = buildLatest(authorityPathOverride);
      const startedRun = store.get(buildRunAtom);
      if (startedRun !== beforeRun) ownedRun.current = startedRun;
      // The shared build guard reports errors. Failed drafts wait for an edit or manual retry.
      void build.catch(() => null).finally(() => {
        if (ownedRun.current === startedRun) ownedRun.current = null;
      });
    }, TRANSACTION_PREBUILD_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeBuild, activeSubmit, authorityPathOverride, buildRun, enabled, prepared, session, snapshot, store, submitHash, visible]);
}
