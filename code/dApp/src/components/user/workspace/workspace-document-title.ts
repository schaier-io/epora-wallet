import type { UserWorkspaceRouteState } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASK_MAP } from "@/components/user/workspace/guided-admin-catalog";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

/**
 * The part of the document title that says where in the workspace you are, or `null` when
 * the route's own title already says it.
 *
 * Every workspace state used to share the one root title. Once Back started pushing real
 * history entries, the browser's history menu became a column of identical rows, and a
 * bookmark saved the product name instead of the thing being bookmarked.
 *
 * Deliberately pure and free of `"use client"`: `app/user/page.tsx` calls it from
 * `generateMetadata` on the same `parseWorkspaceRouteState` output the workspace parses on
 * the client, so there is one derivation rather than two that can drift. Setting
 * `document.title` from a client effect instead does not survive: Next re-applies the
 * route's metadata on every RSC refresh, and the workspace triggers one on every
 * navigation.
 */
export function workspaceTitleFragment(route: UserWorkspaceRouteState): string | null {
  if (route.workspaceMode === "new-wallet") {
    return "Create wallet";
  }

  const base = route.selectedTask
    ? (GUIDED_ADMIN_TASK_MAP[route.selectedTask]?.label ?? null)
    : route.selectedAction
      ? (USER_ACTION_DEFINITION_MAP[route.selectedAction]?.label ?? null)
      : route.selectedWalletUnit
        ? "Wallet home"
        : null;

  if (!base) {
    return null;
  }
  // The name leads and the step trails, because a history menu truncates from the right.
  return route.flowStep === "review" ? `${base} (review)` : base;
}
