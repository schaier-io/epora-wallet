import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { UserActionConfigurationCard } from "@/components/user/action-configuration-card";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

/**
 * The card header rendered a right-aligned button row and nothing else: the caller passed
 * a real title and the component threw it away with `void title;`. Four badges then stood
 * in for the heading that was never drawn.
 */
const BASE: ComponentProps<typeof UserActionConfigurationCard> = {
  definition: USER_ACTION_DEFINITION_MAP["lock-funds"],
  selectedAction: "lock-funds",
  selectedDetectedToken: false,
  primaryIssue: null,
  onReset: () => {},
  onClear: () => {},
  compact: true,
  children: <div />
};

describe("action configuration card header", () => {
  it("renders the caller's title as a heading", () => {
    render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    expect(screen.getByRole("heading", { name: "Add funds details" })).toBeInTheDocument();
  });

  it("stays silent about risk on a low-risk action", () => {
    render(<UserActionConfigurationCard {...BASE} title="Add funds details" />);

    expect(screen.queryByText("Simple")).not.toBeInTheDocument();
    expect(screen.queryByText("High risk")).not.toBeInTheDocument();
  });

  it("keeps the high-risk warning", () => {
    render(
      <UserActionConfigurationCard
        {...BASE}
        definition={USER_ACTION_DEFINITION_MAP["update-state"]}
        selectedAction="update-state"
        title="Change wallet rules details"
      />
    );

    expect(screen.getByText("High risk")).toBeInTheDocument();
  });
});
