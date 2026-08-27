import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewDock } from "./review-dock";

function renderDock(props: Partial<Parameters<typeof ReviewDock>[0]> = {}) {
  return render(
    <ReviewDock
      canSaveProposal
      blockedReason={null}
      preparing={false}
      onSaveProposal={() => {}}
      {...props}
    >
      <p>review panel</p>
    </ReviewDock>
  );
}

describe("the save-as-request dock", () => {
  /**
   * The line under the button is the only place that says this builds a transaction without
   * signing or sending it. In DOM order it follows the button, but a keyboard user tabbing
   * between controls never reaches it, and this is a money action.
   */
  it("carries its reassurance in the button's own description", () => {
    renderDock();

    expect(screen.getByRole("button", { name: "Save as approval request" })).toHaveAccessibleDescription(
      "Prepares the transaction and saves it for the other signers. Nothing is signed and nothing is sent."
    );
  });

  it("puts the blocking reason in the same place when there is one", () => {
    renderDock({ blockedReason: "Choose who to pay first. Then this can be saved for the other signers." });

    const button = screen.getByRole("button", { name: "Save as approval request" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "Choose who to pay first. Then this can be saved for the other signers."
    );
  });
});
