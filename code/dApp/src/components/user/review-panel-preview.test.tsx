import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { ReviewTransactionPreview } from "@/components/user/review-panel-preview";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";
import type { BuildResult } from "@/lib/types/contracts";

const PREVIEW: BuildResult = {
  txHex: "84ad00d90102",
  preview: { action: "use", summary: "Send funds", cbor: "84ad00d90102" },
  estimatedFeeLovelace: "424778"
};

const BASE: ComponentProps<typeof ReviewTransactionPreview> = {
  preview: PREVIEW,
  previewMatchesSelectedAction: true,
  lastActionLabel: "use"
};

describe("ReviewTransactionPreview", () => {
  /**
   * This block used to carry two restatements of the action next to its state: the
   * `shortLabel` badge, directly under a primary button reading "Confirm <label>", and
   * `definition.outcome` appended to "Ready to sign.", which the configuration card in
   * the middle column prints in full on the same screen. The state change is the news.
   */
  it("reports the built state alone, without the action's name or outcome", () => {
    render(<ReviewTransactionPreview {...BASE} />);

    expect(screen.getByText("Ready to sign.")).toBeInTheDocument();
    expect(
      screen.queryByText(USER_ACTION_DEFINITION_MAP["use"].outcome)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(USER_ACTION_DEFINITION_MAP["use"].shortLabel)
    ).not.toBeInTheDocument();
  });

  it("does not add idle build status beside the button", () => {
    render(<ReviewTransactionPreview {...BASE} preview={null} />);
    expect(screen.queryByText("Not built yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ready to sign/)).not.toBeInTheDocument();
  });

  it("keeps the idle review quiet before clicking", () => {
    render(<ReviewTransactionPreview {...BASE} preview={null} />);

    expect(
      screen.queryByText("Your wallet will open automatically to sign.")
    ).not.toBeInTheDocument();
  });

  it("warns that the shown details belong to another action when they drifted", () => {
    render(<ReviewTransactionPreview {...BASE} previewMatchesSelectedAction={false} />);

    expect(
      screen.getByText((_, node) =>
        node?.textContent ===
        "The saved transaction details belong to use. Continue again to refresh them for this action." &&
        Array.from(node.children).every(child => child.textContent !== node.textContent)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Ready to sign.")).not.toBeInTheDocument();
    // Drifted warnings are stale by definition, so only the drift notice shows.
    expect(screen.queryByText("Heads up before you sign")).not.toBeInTheDocument();
  });

  it("lists the builders' advisories before the sign card", () => {
    render(
      <ReviewTransactionPreview
        {...BASE}
        preview={{ ...PREVIEW, warnings: ["Proof-of-life deadline has already lapsed."] }}
      />
    );

    expect(screen.getByText("Heads up before you sign")).toBeInTheDocument();
    expect(
      screen.getByText("Proof-of-life deadline has already lapsed.")
    ).toBeInTheDocument();
  });
});

it("does not duplicate automatic signing progress outside the button", () => {
  render(<ReviewTransactionPreview {...BASE} preview={null} autoSignPending />);
  expect(screen.queryByText("Your wallet will open automatically to sign.")).not.toBeInTheDocument();
});

it.each(["busy", "autoSignPending"] as const)("hides Ready to sign while %s without hiding builder warnings", flag => {
  render(<ReviewTransactionPreview {...BASE} {...{ [flag]: true }} preview={{ ...PREVIEW, warnings: ["Keep this warning."] }} />);
  expect(screen.queryByText("Ready to sign.")).not.toBeInTheDocument();
  expect(screen.getByText("Keep this warning.")).toBeInTheDocument();
});
