"use client";

import { startTransition, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildWorkspaceSearchParams,
  parseWorkspaceRouteState,
  reduceWorkspaceRouteState,
  resolveSetupCheckpoint,
  type SetupCheckpointInput,
  type WorkspaceControllerAction
} from "@/components/user/workspace-controller";

type UseWorkspaceControllerInput = {
  syncUrl?: boolean;
  checkpointInput: Omit<SetupCheckpointInput, "selectedAction">;
};

/**
 * The URL-backed workspace route state (the single source of truth for which wallet / action /
 * task / flow-step is selected). Split out of `useWorkspaceController` so any hook can read it
 * directly — the URL is already global state, so calling this from multiple hooks is cheap and
 * avoids threading routeState / dispatch / commitRouteState through the controller's contexts.
 */
export function useWorkspaceRouteState({ syncUrl = true }: { syncUrl?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const routeState = useMemo(
    () => parseWorkspaceRouteState(searchParams),
    [searchParams]
  );
  const currentCanonicalSearch = useMemo(
    () => buildWorkspaceSearchParams(routeState).toString(),
    [routeState]
  );

  const commitRouteState = useCallback(
    (nextState: ReturnType<typeof parseWorkspaceRouteState>) => {
      if (!syncUrl) {
        return nextState;
      }

      const nextSearchParams = buildWorkspaceSearchParams(nextState);
      const nextSearch = nextSearchParams.toString();

      if (nextSearch === currentCanonicalSearch) {
        return nextState;
      }

      const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;

      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });

      return nextState;
    },
    [currentCanonicalSearch, pathname, router, syncUrl]
  );

  const dispatch = useCallback(
    (action: WorkspaceControllerAction) => {
      const nextState = reduceWorkspaceRouteState(routeState, action);
      return commitRouteState(nextState);
    },
    [commitRouteState, routeState]
  );

  return { routeState, dispatch, commitRouteState };
}

export function useWorkspaceController({
  syncUrl = true,
  checkpointInput
}: UseWorkspaceControllerInput) {
  const { routeState, dispatch, commitRouteState } = useWorkspaceRouteState({ syncUrl });

  const setupCheckpoint = useMemo(
    () =>
      resolveSetupCheckpoint({
        ...checkpointInput,
        selectedAction: routeState.selectedAction
      }),
    [checkpointInput, routeState.selectedAction]
  );

  return {
    routeState,
    setupCheckpoint,
    dispatch,
    commitRouteState
  };
}
