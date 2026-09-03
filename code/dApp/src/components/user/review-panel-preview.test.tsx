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

const LONG_ADDRESS = "addr1q9grk3xs9xk2qyjs8vdnyk4v2czv57t8sn5xdjpqk6xh3g4wv";

const BASE: ComponentProps<typeof ReviewTransactionPreview> = {
  definition: USER_ACTION_DEFINITION_MAP["use"],
  preview: PREVIEW,
  previewMatchesSelectedAction: true,
  lastActionLabel: "use",
  signerAddress: LONG_ADDRESS
};

describe("ReviewTransactionPreview", () => {
  it("states the signer, the validity window, and where change goes", () => {
    render(<ReviewTransactionPreview {...BASE} />);

    // 424778 lovelace renders as the ADA amount beside the "Network fee" label.
    expect(screen.getByText("0.424778 ₳")).toBeInTheDocument();

    const signer = screen.getByText((_, node) => node?.textContent === "Valid for");
    expect(signer).toHaveClass("eyebrow");
    // 1800000 ms of future validity, straight from the builder constant.
    expect(screen.getByText("30 minutes after it's built")).toBeInTheDocument();
    expect(screen.getByText("Returns to your wallet")).toBeInTheDocument();
  });

  /**
   * A bech32 address does not fit the 247px rail, so the row shows the shortened
   * form and carries the full address on `title`, the same pattern the receipt's
   * recipient rows use. Nothing else on the surface repeats the address.
   */
  it("shortens the signer address but keeps the full one reachable", () => {
    render(<ReviewTransactionPreview {...BASE} />);

    expect(screen.getByTitle(LONG_ADDRESS).textContent).not.toContain(LONG_ADDRESS);
    expect(screen.queryByText(LONG_ADDRESS)).not.toBeInTheDocument();
  });

  it("hides the signer row when no wallet is connected", () => {
    render(<ReviewTransactionPreview {...BASE} signerAddress={null} />);

    expect(screen.queryByText("Connected signer")).not.toBeInTheDocument();
    // The rows that describe every build stay.
    expect(screen.getByText("Valid for")).toBeInTheDocument();
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  it("keeps the wallet-will-open note when nothing is built yet", () => {
    render(<ReviewTransactionPreview {...BASE} preview={null} />);

    expect(
      screen.getByText("Your wallet will open automatically to sign.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Network fee")).not.toBeInTheDocument();
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
