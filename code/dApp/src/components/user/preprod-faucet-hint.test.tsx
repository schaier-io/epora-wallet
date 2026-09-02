import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreprodFaucetHint } from "./preprod-faucet-hint";

describe("the Preprod faucet hint", () => {
  it("tells the reader the money is test money and where to get it", () => {
    render(<PreprodFaucetHint />);

    expect(
      screen.getByText(
        "This app runs on Preprod, Cardano's test network. The ADA here is free test money, not real funds."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Get free test ADA from the Preprod faucet")).toHaveAttribute(
      "href",
      "https://docs.cardano.org/cardano-testnets/tools/faucet/"
    );
  });

  it("never implies real mainnet funds are welcome", () => {
    const { container } = render(<PreprodFaucetHint />);

    expect(container.textContent).not.toMatch(/mainnet/i);
  });
});
