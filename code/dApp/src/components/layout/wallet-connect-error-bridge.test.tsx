import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: {
    connectError: null as string | null,
    clearConnectError: vi.fn(),
    activeWalletName: null as string | null,
    activeAddress: null as string | null,
    isDemoWallet: false,
    restoredWalletName: null as string | null
  },
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

vi.mock("@/providers/wallet-provider", () => ({ useWalletContext: () => ({ ...mocks.context }) }));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => mocks.toast }));

import { WalletConnectErrorBridge } from "./wallet-connect-error-bridge";

beforeEach(() => {
  mocks.toast.success.mockClear();
  mocks.toast.info.mockClear();
  mocks.context.activeWalletName = null;
  mocks.context.activeAddress = null;
  mocks.context.restoredWalletName = null;
});

// The provider marks the wallet it reconnected on its own; a click sets no mark.
function connectAfterMount(restored: string | null) {
  const view = render(<WalletConnectErrorBridge />);
  mocks.context.activeWalletName = "lace";
  mocks.context.activeAddress = "addr_test1restored";
  mocks.context.restoredWalletName = restored;
  view.rerender(<WalletConnectErrorBridge />);
  return view;
}

it("stays quiet when the provider restores the wallet it had before the reload", () => {
  // The restore finishes after the first render, so it looked like a fresh connect and
  // toasted "Wallet connected" on every page load.
  connectAfterMount("lace");
  expect(mocks.toast.success).not.toHaveBeenCalled();
});

it("still announces a connect the user made", () => {
  // Also when the same wallet was remembered from last time but no restore ran
  // (locked extension, revoked access): the click is the person's own.
  const view = connectAfterMount(null);
  expect(mocks.toast.success).toHaveBeenCalledTimes(1);

  // A later disconnect and reconnect of the same wallet is news again.
  mocks.context.activeWalletName = null;
  view.rerender(<WalletConnectErrorBridge />);
  expect(mocks.toast.info).toHaveBeenCalledTimes(1);
  mocks.context.activeWalletName = "lace";
  view.rerender(<WalletConnectErrorBridge />);
  expect(mocks.toast.success).toHaveBeenCalledTimes(2);
});

it("announces an account switch inside the connected wallet", () => {
  const view = connectAfterMount(null);
  mocks.context.activeAddress = "addr_test1switched";

  view.rerender(<WalletConnectErrorBridge />);

  expect(mocks.toast.info).toHaveBeenCalledWith({
    title: "Wallet account changed",
    description: "addr_test1switched"
  });
});

it("announces a reconnect of the restored wallet once the person made it themselves", () => {
  const view = connectAfterMount("lace");
  mocks.context.activeWalletName = null;
  view.rerender(<WalletConnectErrorBridge />);
  mocks.context.activeWalletName = "lace";
  mocks.context.restoredWalletName = null;
  view.rerender(<WalletConnectErrorBridge />);
  expect(mocks.toast.success).toHaveBeenCalledTimes(1);
});
