import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import type { GuidedActionCard } from "@/components/user/workspace/types";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({ openWorkspaceIntent: vi.fn() })
}));

const { GuidedActionSectionView } = await import(
  "@/components/user/workspace/workspace-guided-action-section-view"
);

const ACTIONS: GuidedActionCard[] = [
  { intent: "send", action: "use", title: "Send funds", description: "Normal wallet send." },
  {
    intent: "add-funds",
    action: "lock-funds",
    title: "Receive funds",
    description: "Copy address or add funds."
  }
];

/**
 * The selected entry was drawn with a border, a background and a glow, and named exactly like
 * every other entry. Nothing in the accessible tree said which one the main panel was showing:
 * no `aria-current` or `aria-pressed` existed anywhere under `components/user/workspace`.
 *
 * The section label is on the eyebrow rung, which the "Advanced" summary four rows below it
 * already used while these labels sat at 12px sentence case.
 */
function renderWith(selectedIntent: string | null) {
  const store = createStore();
  store.set(routeStateAtom, { selectedIntent } as never);
  return render(
    <Provider store={store}>
      <GuidedActionSectionView title="Common actions" actions={ACTIONS} />
    </Provider>
  );
}

describe("guided action section", () => {
  it("says which entry the main panel is showing", () => {
    renderWith("send");

    expect(screen.getByRole("button", { current: true }).textContent).toContain("Send funds");
  });

  it("marks nothing current when no intent is open", () => {
    renderWith(null);

    expect(screen.queryByRole("button", { current: true })).toBeNull();
  });

  it("puts the section label on the eyebrow rung", () => {
    renderWith(null);

    expect(screen.getByText("Common actions").className).toContain("eyebrow");
  });
});
