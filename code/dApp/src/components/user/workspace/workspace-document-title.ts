import type { UserWorkspaceRouteState } from "@/components/user/flow-types";
import { COPY } from "@/lib/copy";
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
 * Deliberately pure and free of `"use client"`, because both sides call it: `app/user/page.tsx`
 * from `generateMetadata` for the entry load, and the workspace from an effect for every
 * navigation after it. Both run on the same `parseWorkspaceRouteState` output, so there is one
 * derivation rather than two that can drift.
 *
 * The client half used to be impossible: the workspace navigated with `router.push`, Next
 * re-applied the route's metadata on the RSC refresh that followed, and a client-set title was
 * overwritten every time. Navigation is `history.pushState` now (see `commitRouteState`), which
 * fetches nothing and re-applies nothing, so the effect is what keeps the title honest.
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
        ? route.overviewSection === "transactions"
          ? "Activity"
          : "Wallet home"
        : null;

  if (!base) {
    return null;
  }
  // The name leads and the step trails, because a history menu truncates from the right.
  return route.flowStep === "review" ? `${base} (review)` : base;
}

/**
 * The whole `document.title` for a workspace route, template applied. `generateMetadata` returns
 * only the fragment and lets Next apply `metadata.title.template`; a client effect gets no such
 * help, so it applies the same template to the same fragment here.
 */
export function workspaceDocumentTitle(route: UserWorkspaceRouteState): string {
  const fragment = workspaceTitleFragment(route);
  return fragment
    ? COPY.brand.titleTemplate.replace("%s", fragment)
    : COPY.brand.titleDefault;
}
