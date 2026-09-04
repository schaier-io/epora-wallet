import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  lockingContract: { address: null as string | null, error: null as string | null },
  receiveAddress: null as string | null
}));

// The asset editor is E12's surface and the QR image is E11's; stub both so this test is
// about the strings and the panels this file owns.
vi.mock("@/components/user/workspace/editors", () => ({
  AssetListEditor: ({ label, helper }: { label: string; helper: string }) => (
    <div>
      <p>{label}</p>
      <p>{helper}</p>
    </div>
  ),
  InlineFieldError: () => null,
  ReceiveAddressQrCode: () => <div data-testid="qr" />
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      lockingContractAtom: atom(() => holder.lockingContract),
      walletReceiveAddressAtom: atom(() => holder.receiveAddress)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    activeFieldErrors: {},
    copyTextToClipboard: vi.fn()
  })
}));

vi.mock("@/components/user/workspace/forms/use-lock-funds-form", () => ({
  useLockFundsForm: () => ({ lockFundsAssets: [], setLockFundsAssets: vi.fn() })
}));

const { LockFundsConfigView } = await import(
  "@/components/user/workspace/config-lockfunds-view"
);

const ADDRESS_ERROR = "Choose a smart wallet first. Its address comes from the wallet you pick.";

function renderView({
  address = null as string | null,
  receiveAddress = null as string | null
} = {}) {
  holder.lockingContract = { address, error: address ? null : ADDRESS_ERROR };
  holder.receiveAddress = receiveAddress;
  return render(
    <Provider store={createStore()}>
      <LockFundsConfigView />
    </Provider>
  );
}

/**
 * `UserActionConfigurationCard` already renders "Add funds details" and "This shows the wallet
 * receive address and lets you add funds." above this view, so the panel that opened it was a
 * third heading whose only content was a table of contents for the two panels under it.
 */
describe("receive screen headings", () => {
  it("drops the heading panel that restated the card above it", () => {
    renderView({ address: "addr_test1wallet" });

    expect(screen.queryByText("Receive and manage funds")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Share the receive address or scan the QR code/)
    ).not.toBeInTheDocument();
    // The two panels that do the work are still there, each naming one way money gets in.
    expect(screen.getByText("Receive address")).toBeInTheDocument();
    expect(screen.getByText("Add funds yourself")).toBeInTheDocument();
  });

  it("drops the two prose boxes that repeated the panels around them", () => {
    renderView({ address: "addr_test1wallet" });

    expect(
      screen.queryByText("Send ADA or supported native assets here to fund the wallet.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Use Add funds below when you want to set the exact asset mix/)
    ).not.toBeInTheDocument();
  });
});

/**
 * The screen printed the wallet address twice, ~200px apart, under two labels. The second copy
 * had no copy button and no explorer link, and it read `lockingContract.address` while the first
 * reads `walletReceiveAddress ?? lockingContract.address`: two derivations, one screen.
 */
describe("the wallet address", () => {
  it("appears once, and it is the receive address", () => {
    renderView({ address: "addr_test1locking", receiveAddress: "addr_test1receive" });

    expect(screen.getAllByText("addr_test1receive")).toHaveLength(1);
    expect(screen.queryByText("addr_test1locking")).not.toBeInTheDocument();
    expect(screen.queryByText("Wallet address")).not.toBeInTheDocument();
  });

  it("keeps copy and explorer controls beside the receive address", () => {
    renderView({ address: "addr_test1locking", receiveAddress: "addr_test1receive" });

    const address = screen.getByText("addr_test1receive");
    const row = address.closest("div");
    expect(row).toContainElement(screen.getByRole("button", { name: "Copy address" }));
    expect(row).toContainElement(screen.getByRole("link", { name: "Open address on Cardanoscan" }));
  });

  it("stops repeating the address error down the page", () => {
    renderView();

    // Once, in the box where the address would be. The review rail states it again, which is
    // where a blocking issue belongs; three times on one screen was not.
    expect(screen.getAllByText(ADDRESS_ERROR)).toHaveLength(1);
  });
});

describe("adding funds yourself", () => {
  it("says where the money comes from instead of how the contract stores it", () => {
    renderView({ address: "addr_test1wallet" });

    expect(
      screen.getByText("Move ADA or tokens from the wallet you are connected with into this one.")
    ).toBeInTheDocument();
    expect(screen.getByText("What to add")).toBeInTheDocument();
    expect(
      screen.getByText("Set the ADA amount, or add any tokens the connected wallet already holds.")
    ).toBeInTheDocument();
  });

  it("drops the lock-and-asset-row vocabulary", () => {
    renderView({ address: "addr_test1wallet" });

    expect(screen.queryByText("Assets to lock")).not.toBeInTheDocument();
    expect(screen.queryByText(/asset row/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Set the deposit amount/)).not.toBeInTheDocument();
  });
});
