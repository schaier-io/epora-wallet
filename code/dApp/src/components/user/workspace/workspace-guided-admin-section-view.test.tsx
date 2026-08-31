import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Users } from "lucide-react";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    guidedAdminGroups: [
      {
        id: "manage-people",
        label: "People",
        description: "Owners, spenders, and linked wallets.",
        icon: Users
      }
    ],
    guidedAdminGroupBadgeText: { "manage-people": "1 owner" },
    guidedAdminGroupStatusText: { "manage-people": "Ready" },
    guidedAdminGroupSummary: { "manage-people": "One owner, no spenders." },
    activeAdminGroupId: null,
    openGuidedAdminGroup: vi.fn()
  })
}));

const { GuidedAdminSectionView } = await import(
  "@/components/user/workspace/workspace-guided-admin-section-view"
);

/**
 * Three groups stack in one sidebar column and each drew itself slightly differently: this one
 * sized its icon at 18px inside the same 40px tile the other two filled with a 16px icon, and
 * its section label sat at 12px sentence case while "Advanced", four rows below it, was an
 * 11px uppercase eyebrow. Both are now the rung the column already used.
 */
describe("guided admin section", () => {
  it("puts the section label on the eyebrow rung", () => {
    render(<GuidedAdminSectionView />);

    expect(screen.getByText("Manage").className).toContain("eyebrow");
  });

  it("sizes its icon like the other sidebar entries", () => {
    const { container } = render(<GuidedAdminSectionView />);

    const icon = container.querySelector("button svg");
    expect(icon?.getAttribute("class")).toContain("h-4 w-4");
    expect(icon?.getAttribute("class")).not.toContain("h-4.5");
  });
});
