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
  definition: USER_ACTION_DEFINITION_MAP["use"],
  preview: PREVIEW,
  previewMatchesSelectedAction: true,
  lastActionLabel: "use"
};

describe("ReviewTransactionPreview", () => {
  it("states the built action and its outcome beside the badge", () => {
    render(<ReviewTransactionPreview {...BASE} />);

    // The sentence and the outcome share one text span, so match them combined.
    const outcome = USER_ACTION_DEFINITION_MAP["use"].outcome;
    expect(
      screen.getByText((_, node) => node?.textContent === `Ready to sign. ${outcome}`)
    ).toBeInTheDocument();
  });

  /**
   * The card used to disappear entirely without a preview, so the rail lost its whole
   * height on every tab switch and the primary button looked as ready with nothing built
   * as it does beside a built one.
   */
  it("holds the review card open before a build", () => {
    render(<ReviewTransactionPreview {...BASE} preview={null} />);

    expect(screen.getByText("Not built yet.")).toBeInTheDocument();
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
        "The saved transaction details belong to use. Continue again to refresh them for this action."
      )
    ).toBeInTheDocument();
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

it("shows the signing note only while a click is waiting for automatic signing", () => {
  render(<ReviewTransactionPreview {...BASE} preview={null} autoSignPending />);
  expect(screen.getByText("Your wallet will open automatically to sign.")).toBeInTheDocument();
});
