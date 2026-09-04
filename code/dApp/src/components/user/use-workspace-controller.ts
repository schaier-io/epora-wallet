"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
 * directly: the URL is already global state, so calling this from multiple hooks is cheap and
 * avoids threading routeState / dispatch / commitRouteState through the controller's contexts.
 */
export function useWorkspaceRouteState({ syncUrl = true }: { syncUrl?: boolean } = {}) {
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
  const routeStateRef = useRef(routeState);
  const canonicalSearchRef = useRef(currentCanonicalSearch);
  useEffect(() => {
    routeStateRef.current = routeState;
    canonicalSearchRef.current = currentCanonicalSearch;
  }, [currentCanonicalSearch, routeState]);

  const commitRouteState = useCallback(
    (
      nextState: ReturnType<typeof parseWorkspaceRouteState>,
      // `replace` by default, so an auto-correction cannot leave a history entry the user
      // has to press Back through. Anything the user initiated passes `push`. Without it
      // no history entry is ever created and Back leaves /user entirely, re-firing the
      // blocking risk gate.
      { history = "replace" }: { history?: "push" | "replace" } = {}
    ) => {
      routeStateRef.current = nextState;
      const nextSearchParams = buildWorkspaceSearchParams(nextState);
      const nextSearch = nextSearchParams.toString();
      if (!syncUrl) {
        canonicalSearchRef.current = nextSearch;
        return nextState;
      }

      if (nextSearch === canonicalSearchRef.current) {
        return nextState;
      }
      canonicalSearchRef.current = nextSearch;

      const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;

      // The native History API, not `router.push`. Every state the workspace can be in is a
      // query string on this one route, and `router.push` treats each one as a navigation: it
      // fetches an RSC payload for the new URL, and the `startTransition` around it keeps the
      // OLD screen up until that answer arrives. Clicking a sidebar tab therefore waited on a
      // server round-trip before anything moved. Measured on the dev server, each click cost
      // one `?_rsc=` request at ~31ms; through `history.pushState` the same click makes no
      // request at all and lands in ~13ms, and off localhost the gap is the whole round-trip.
      //
      // Next patches `pushState`/`replaceState` (app-router.js) to dispatch ACTION_RESTORE, so
      // `usePathname` and `useSearchParams` still see the new URL and Back/Forward still work.
      // This is only safe because `nextUrl` is always this same pathname: a real route change
      // still has to go through `router`.
      if (history === "push") {
        window.history.pushState(null, "", nextUrl);
      } else {
        window.history.replaceState(null, "", nextUrl);
      }

      return nextState;
    },
    [pathname, syncUrl]
  );

  const dispatch = useCallback(
    (
      action: WorkspaceControllerAction,
      // Almost every action in the union is raised by a click, so `push` is the default and
      // each one becomes a place Back returns to. Effects that correct impossible route
      // state pass `replace`: a correction the user never asked for must not cost a Back
      // press, and one gesture that trips two corrections must not cost two.
      { history = "push" }: { history?: "push" | "replace" } = {}
    ) => {
      const nextState = reduceWorkspaceRouteState(routeStateRef.current, action);
      return commitRouteState(nextState, { history });
    },
    [commitRouteState]
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
