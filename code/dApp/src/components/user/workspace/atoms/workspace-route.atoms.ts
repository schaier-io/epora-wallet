"use client";

import { atom } from "jotai";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";

type WorkspaceRouteState = ReturnType<typeof parseWorkspaceRouteState>;

const EMPTY_ROUTE_STATE: WorkspaceRouteState = parseWorkspaceRouteState(
  new URLSearchParams()
);

/**
 * Workspace-scoped MIRROR of the URL-derived route state, kept as an atom so the workspace's
 * DERIVED atoms (which can't read `useSearchParams`) and any view can read the selected
 * wallet / action / task / flow-step directly instead of through the controller's return barrel.
 *
 * The URL remains the single source of truth: `useWorkspaceFoundation` parses it (via
 * `useWorkspaceController`) and mirrors the result here in an effect. Mutations still go through
 * `dispatch` / `commitRouteState`, which write the URL; this atom is read-only.
 */
export const routeStateAtom = atom<WorkspaceRouteState>(EMPTY_ROUTE_STATE);
