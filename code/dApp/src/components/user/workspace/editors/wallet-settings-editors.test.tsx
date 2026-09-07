import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OwnerAccessEditor, WalletNameEditor } from "./wallet-settings-editors";
import { MAX_WALLET_NAME_BYTES, clampWalletNameInput } from "@/lib/contracts/state-wallet-name";
import { createDefaultUserFormState } from "@/lib/contracts/state-form";

// Four bytes each in UTF-8, so eight of them fill the 32-byte limit exactly.
const EIGHT_EMOJI = "🙂".repeat(8);

function renderName(value: string, { editable = true } = {}) {
  const onChange = vi.fn();
  return { onChange, ...render(<WalletNameEditor value={value} onChange={onChange} editable={editable} />) };
}

describe("the counter measures what the limit measures", () => {
  /**
   * `clampWalletNameInput` (`lib/contracts/state-wallet-name.ts:34-46`) stops accepting
   * input at 32 BYTES, and the counter divided a CHARACTER count by that byte limit. Eight
   * emoji fill the limit exactly, so the box refused the ninth while the old counter still
   * read "8/32 characters".
   */
  it("agrees with the point at which typing stops", () => {
    expect(clampWalletNameInput(`${EIGHT_EMOJI}🙂`)).toBe(EIGHT_EMOJI);

    renderName(EIGHT_EMOJI);

    expect(screen.getByText(`${MAX_WALLET_NAME_BYTES}/${MAX_WALLET_NAME_BYTES} used`)).toBeInTheDocument();
    expect(screen.queryByText(`8/${MAX_WALLET_NAME_BYTES} characters`)).not.toBeInTheDocument();
  });

  it("counts plain letters one for one", () => {
    renderName("Rent");

    expect(screen.getByText(`4/${MAX_WALLET_NAME_BYTES} used`)).toBeInTheDocument();
  });

  it("counts an accented letter as the two it costs", () => {
    renderName("café");

    expect(screen.getByText(`5/${MAX_WALLET_NAME_BYTES} used`)).toBeInTheDocument();
  });

  it("says why typing stopped instead of leaving the reader to guess", () => {
    renderName(EIGHT_EMOJI);

    expect(
      screen.getByText(
        "That is as long as a wallet name can be. Emoji and accented letters take up more room than plain letters."
      )
    ).toBeInTheDocument();
  });
});

describe("wallet name copy", () => {
  it("previews the name the wallet will show", () => {
    renderName("Rent");

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText(/This wallet will show as/)).toBeInTheDocument();
  });

  it("prompts for a name when there is none", () => {
    renderName("");

    expect(
      screen.getByText("Add a short name so this wallet is easy to recognize later.")
    ).toBeInTheDocument();
  });

  /**
   * A contract rule, not a screen preference: `eval_update_state`
   * (`smart-contract/lib/stt/operator_handlers.ak:125-131`) requires the wallet name to be
   * unchanged unless the operator path is Admin.
   */
  it("names the rule that locks the field instead of an internal path", () => {
    renderName("Rent", { editable: false });

    expect(screen.getByLabelText("Wallet name")).toBeDisabled();
    expect(
      screen.getByText(
        "Only an owner signing alone can rename this wallet. Choose to sign as a single owner, and this becomes editable."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/owner update path/)).not.toBeInTheDocument();
  });
});

describe("depth", () => {
  it("sits one rung in from the card, not at the card's own radius", () => {
    const { container } = renderName("Rent");

    expect(container.querySelector(".rounded-lg")).not.toBeNull();
    expect(container.querySelector(".rounded-xl")).toBeNull();
  });
});

describe("editing", () => {
  it("clamps what it hands back to the byte limit", () => {
    const { onChange } = renderName(EIGHT_EMOJI);

    fireEvent.change(screen.getByLabelText("Wallet name"), {
      target: { value: `${EIGHT_EMOJI}🙂` }
    });
    expect(onChange).toHaveBeenCalledWith(EIGHT_EMOJI);
  });
});

describe("owner wallet cap", () => {
  it("does not append the connected wallet when the parent blocks adds", () => {
    const onChange = vi.fn();
    render(
      <OwnerAccessEditor
        user={createDefaultUserFormState("1")}
        connectedPaymentKeyHash={"ab".repeat(28)}
        canAddWallet={false}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    const addConnected = screen.getByRole("button", { name: "Use connected wallet here" });
    expect(addConnected).toBeDisabled();
    fireEvent.click(addConnected);
    expect(onChange).not.toHaveBeenCalled();
  });
});
