import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { FocusedWalletSettingsEditor } from "./focused-wallet-settings-editor";
import { describeStateValidationError } from "../helpers/state-validation-copy";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
import {
  type StateFormState,
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

// jsdom has no layout, so it has no scrollIntoView. The jump calls it before focusing.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const KEY_A = "a1".repeat(28);
const KEY_B = "b2".repeat(28);

/** An owner and one co-signer holding 1 power, with the threshold given. */
function walletWith(threshold: string): StateFormState {
  return {
    ...createDefaultStateForm(),
    walletName: "Family",
    users: [
      { ...createDefaultUserFormState("0"), wallets: [KEY_A], isAdmin: true },
      { ...createDefaultUserFormState("1"), wallets: [KEY_B], multiSigPowerMode: "some", multiSigPower: "1" }
    ],
    beneficiaries: [],
    multiSigThresholdMode: "some",
    multiSigThreshold: threshold
  };
}

function renderPage({
  value = walletWith("1"),
  selectedTask = "settings-people" as UserWorkspaceTask | null,
  fieldErrors = {},
  ...rest
}: Partial<Parameters<typeof FocusedWalletSettingsEditor>[0]> = {}) {
  const props = {
    value,
    onChange: vi.fn<(value: StateFormState) => void>(),
    selectedTask,
    onSelectTask: vi.fn<(task: UserWorkspaceTask) => void>(),
    fieldErrors,
    ...rest
  };
  return { props, ...render(<FocusedWalletSettingsEditor {...props} />) };
}

describe("wallet settings on one page", () => {
  it("shows the name, the rules and everyone in the wallet without tabs", () => {
    renderPage();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Wallet name")).toHaveValue("Family");
    expect(screen.getByText("Approval power needed: 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens the rule that the sidebar entry names", () => {
    const view = renderPage({ selectedTask: "settings-proof-of-life" });
    expect(screen.getByRole("switch", { name: "Require proof of life" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Approval power needed")).not.toBeInTheDocument();

    view.rerender(<FocusedWalletSettingsEditor {...view.props} selectedTask="settings-multisig-threshold" />);
    expect(screen.getByLabelText("Approval power needed")).toBeInTheDocument();
  });

  it("asks to confirm an ownerless wallet once", () => {
    renderPage({
      value: { ...walletWith("1"), users: [] },
      zeroAdminConfirmed: false,
      onZeroAdminConfirmedChange: vi.fn()
    });
    expect(screen.getAllByText("This wallet would have no owner")).toHaveLength(1);
  });

  it("asks to confirm a threshold that no group of co-signers can reach", () => {
    const onThresholdConfirmedChange = vi.fn<(value: boolean) => void>();
    renderPage({
      value: walletWith("3"),
      selectedTask: "settings-multisig-threshold",
      thresholdConfirmed: false,
      onThresholdConfirmedChange
    });
    expect(screen.getByText("No group of co-signers can reach 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "I understand. Keep this threshold." }));
    expect(onThresholdConfirmedChange).toHaveBeenCalledWith(true);
  });
});

describe("finding draft issues on the page", () => {
  it("jumps from a people issue to the people task", () => {
    const { props } = renderPage({
      selectedTask: "settings-wallet-name",
      fieldErrors: { "Output state": ["Person 12 daily limit must be >= 0."] }
    });
    expect(screen.getByText("Person 12 daily limit must be >= 0.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check People/i }));
    expect(props.onSelectTask).toHaveBeenCalledWith("settings-people");
  });

  it("lands on the first person from a people issue, not on Add person", async () => {
    renderPage({
      selectedTask: "settings-wallet-name",
      fieldErrors: { "Output state": ["Person 12 daily limit must be >= 0."] }
    });
    fireEvent.click(screen.getByRole("button", { name: /Check People/i }));
    await waitFor(() => expect(document.activeElement?.closest("[data-person-key]")).not.toBeNull());
    expect(document.activeElement).toHaveAttribute("aria-expanded");
  });

  it("opens the co-signers rule from a threshold issue", () => {
    const message = `${describeStateValidationError("state.multi_sig_threshold")} must be at least 1.`;
    const { props } = renderPage({ selectedTask: "settings-wallet-name", fieldErrors: { "Output state": [message] } });
    expect(screen.queryByLabelText("Approval power needed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check Co-signer threshold/i }));
    expect(props.onSelectTask).toHaveBeenCalledWith("settings-multisig-threshold");
    expect(screen.getByLabelText("Approval power needed")).toBeInTheDocument();
  });

  it("lands on the confirmation from an unreachable-threshold issue", async () => {
    renderPage({
      value: walletWith("3"),
      selectedTask: "settings-people",
      thresholdConfirmed: false,
      onThresholdConfirmedChange: vi.fn(),
      fieldErrors: { "Approval power out of reach": ["No group of co-signers can reach the approval power needed. Confirm it, or lower it."] }
    });
    fireEvent.click(screen.getByRole("button", { name: /Check Co-signer threshold/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "I understand. Keep this threshold." }))
    );
  });

  it("lands inside the proof-of-life rule from its issue, not on the co-signers trigger", async () => {
    const message = `${describeStateValidationError("state.proof_of_life_increment")} must be at least 1.`;
    const value = {
      ...walletWith("1"),
      proofOfLifeUnlockTimeMode: "some" as const,
      proofOfLifeUnlockTime: String(Date.UTC(2027, 0, 6)),
      proofOfLifeIncrementMode: "some" as const,
      // Valid values: nothing is marked invalid, so the jump takes its fallback.
      proofOfLifeIncrement: String(90 * 24 * 60 * 60 * 1000)
    };
    renderPage({ value, selectedTask: "settings-wallet-name", fieldErrors: { "Output state": [message] } });
    fireEvent.click(screen.getByRole("button", { name: /^Check /i }));
    await waitFor(() => expect(document.activeElement?.closest('[role="region"]')).not.toBeNull());
    expect(document.activeElement).not.toBe(screen.getByRole("switch", { name: "Require proof of life" }));
  });
});
