import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";

const VALID_WALLET = "ab".repeat(28);

describe("a list of token amounts", () => {
  /**
   * The same component renders "Daily limit" and "Left to spend" in the spender editor
   * (E2), so a row is not always a limit. Both buttons said it was.
   */
  it("does not call every row a limit", () => {
    render(
      <StateAssetAmountListEditor
        label="Left to spend"
        value={[{ policyId: "", assetName: "", amount: "0" }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Add a token" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Asset Limit/ })).not.toBeInTheDocument();
  });

  it("says how to enter an amount of ADA", () => {
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[{ policyId: "", assetName: "", amount: "0" }]}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "Leave the two id boxes empty for ADA. Fill them in only for another Cardano token."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Token policy id")).toBeInTheDocument();
    expect(screen.getByLabelText("Token name (hex)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Policy ID")).not.toBeInTheDocument();
  });

  it("keeps a caller's own add label", () => {
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[]}
        onChange={vi.fn()}
        addLabel="Add a daily limit"
      />
    );

    expect(screen.getByRole("button", { name: "Add a daily limit" })).toBeInTheDocument();
    expect(screen.getByText("Nothing added yet.")).toBeInTheDocument();
  });
});

describe("a list of wallet ids", () => {
  function renderList(wallets: string[]) {
    const onChange = vi.fn();
    return {
      onChange,
      ...render(
        <WalletHashesEditor
          label="Wallets this person signs with"
          value={wallets}
          onChange={onChange}
        />
      )
    };
  }

  /**
   * The group `<Label>` carries no `htmlFor`, so every row's box was announced blank. Each
   * row now names itself.
   */
  it("gives every row a name of its own", () => {
    renderList(["", ""]);

    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 2")
    ).toBeInTheDocument();
  });

  /**
   * `isCredentialHash` (`lib/contracts/payout-address.ts:22-28`) is the same check the
   * review rail applies, so the field and the receipt cannot disagree about what a wallet
   * id is. Before this, any string was accepted with no word until the receipt.
   */
  it("says at the field when an id cannot be a wallet id", () => {
    renderList(["abc"]);

    expect(
      screen.getByText(
        /A Cardano wallet id is 56 characters, using 0 to 9 and a to f\. This one has 3\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("says nothing about a well-formed id", () => {
    renderList([VALID_WALLET]);

    expect(screen.queryByText(/A Cardano wallet id is 56 characters/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).not.toHaveAttribute("aria-invalid");
  });

  it("says nothing about a row the reader has not filled in yet", () => {
    renderList([""]);

    expect(screen.queryByText(/A Cardano wallet id is 56 characters/)).not.toBeInTheDocument();
  });

  it("still edits the row it was given", () => {
    const { onChange } = renderList(["", ""]);

    fireEvent.change(screen.getByLabelText("Wallets this person signs with, wallet 2"), {
      target: { value: VALID_WALLET }
    });

    expect(onChange).toHaveBeenCalledWith(["", VALID_WALLET]);
  });

  it("uses plain defaults for its empty state and its box", () => {
    renderList([]);

    expect(screen.getByText("No wallet added yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a wallet" })).toBeInTheDocument();
    expect(screen.queryByText("No wallet IDs added.")).not.toBeInTheDocument();
  });
});
