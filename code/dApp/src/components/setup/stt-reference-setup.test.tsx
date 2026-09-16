import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  copyText: vi.fn(),
  detect: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  signAndSubmit: vi.fn(),
  walletContext: {
    activeAddress: "addr_test1_signer",
    activeWallet: { signTx: vi.fn(), submitTx: vi.fn() },
    isDemoWallet: false,
    networkId: 0
  } as {
    activeAddress: string | null;
    activeWallet: { signTx: ReturnType<typeof vi.fn>; submitTx: ReturnType<typeof vi.fn> } | null;
    isDemoWallet: boolean;
    networkId: number | null;
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace })
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "estimatedFee") {
      return `Estimated network fee: ${values?.ada} ADA.`;
    }
    if (key === "storeAddress") {
      return `Permanent store: ${values?.address}`;
    }
    return ({
      build: "Build setup transaction",
      building: "Building…",
      checkAgain: "Check again",
      checking: "Checking…",
      confirming: "Confirming on-chain…",
      connect: "Connect wallet",
      copy: "Copy",
      deploy: "Sign and deploy",
      purpose: "This locks a small amount of ADA in a reference output. Later Epora transactions reuse it, so they cost less.",
      ready: "Setup transaction ready",
      sttHint: "STT is short for state-thread token.",
      sttHintLabel: "What STT means",
      submitting: "Waiting for your signature…",
      title: "Set up the shared STT reference"
    })[key] ?? key
  }
}));
vi.mock("@/lib/utils/clipboard", () => ({
  copyTextToClipboard: mocks.copyText
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => mocks.walletContext
}));
vi.mock("@/components/layout/wallet-panel", () => ({
  WalletConnectionDialog: ({ open }: { open: boolean }) => open ? <div>Wallet chooser</div> : null
}));
vi.mock("@/lib/mesh/detection", () => ({
  detectSharedSttReferenceStore: mocks.detect
}));
vi.mock("@/lib/mesh/stt-reference-storage", () => ({
  saveSttReference: mocks.save
}));
vi.mock("@/lib/utils/errors", () => ({
  getUserFacingErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock("@/lib/mesh/transactions", () => ({
  buildDeploySharedSttReferenceTx: mocks.build,
  DEFAULT_SHARED_STT_REFERENCE_LOVELACE: "5000000",
  signAndSubmitTx: mocks.signAndSubmit
}));
vi.mock("@/components/user/workspace/constants", () => ({
  SUBMIT_CONFIRMATION_INITIAL_DELAY_MS: 1,
  SUBMIT_CONFIRMATION_MAX_ATTEMPTS: 2,
  SUBMIT_CONFIRMATION_POLL_MS: 1
}));

const { SttReferenceSetup } = await import("./stt-reference-setup");

const missingStore = {
  activeReference: null,
  checkedReferenceCount: 0,
  matchingCount: 0,
  matchingReferences: [],
  policyId: "ab".repeat(28),
  status: "missing" as const,
  storeAddress: "addr_test1_store",
  sttScriptHash: "cd".repeat(28)
};

describe("STT reference setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.walletContext.activeAddress = "addr_test1_signer";
    mocks.walletContext.activeWallet = { signTx: vi.fn(), submitTx: vi.fn() };
    mocks.walletContext.isDemoWallet = false;
    mocks.walletContext.networkId = 0;
  });

  it("opens the browser-wallet chooser when no wallet is connected", () => {
    mocks.walletContext.activeAddress = null;
    mocks.walletContext.activeWallet = null;

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(screen.getByText("Wallet chooser")).toBeInTheDocument();
  });

  it("detects an existing reference during Strict Mode effect replay", async () => {
    mocks.detect.mockResolvedValue({
      ...missingStore,
      activeReference: `${"ef".repeat(32)}#0`,
      matchingCount: 1,
      matchingReferences: [`${"ef".repeat(32)}#0`],
      status: "ready"
    });

    render(
      <StrictMode>
        <SttReferenceSetup initialStore={null} />
      </StrictMode>
    );

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });

  it("builds for review, then signs and redirects only after confirmation", async () => {
    vi.useFakeTimers();
    mocks.build.mockResolvedValue({
      estimatedFeeLovelace: "190000",
      preview: { summary: "Deploy reference with 5 ADA" },
      referenceScriptOutputIndex: 0,
      signerAddress: "addr_test1_signer",
      txHex: "84a400"
    });
    mocks.signAndSubmit.mockResolvedValue("ef".repeat(32));
    mocks.detect
      .mockResolvedValueOnce(missingStore)
      .mockResolvedValueOnce({
        ...missingStore,
        activeReference: `${"ef".repeat(32)}#0`,
        matchingCount: 1,
        matchingReferences: [`${"ef".repeat(32)}#0`],
        status: "ready"
      });

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    await act(async () => undefined);

    expect(screen.getByText("Deploy reference with 5 ADA")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build setup transaction" })).not.toBeInTheDocument();
    expect(mocks.signAndSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign and deploy" }));
    await act(async () => undefined);
    expect(mocks.signAndSubmit).toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.save).toHaveBeenCalledWith(`${"ef".repeat(32)}#0`);
    expect(mocks.replace).toHaveBeenCalledWith("/");
    vi.useRealTimers();
  });

  it("keeps confirming after a cache write or provider read fails", async () => {
    vi.useFakeTimers();
    const reference = `${"ef".repeat(32)}#0`;
    mocks.build.mockResolvedValue({
      preview: { summary: "Deploy reference with 5 ADA" },
      referenceScriptOutputIndex: 0,
      signerAddress: "addr_test1_signer",
      txHex: "84a400"
    });
    mocks.signAndSubmit.mockResolvedValue("ef".repeat(32));
    mocks.save.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    mocks.detect
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({
        ...missingStore,
        activeReference: reference,
        matchingCount: 1,
        matchingReferences: [reference],
        status: "ready"
      });

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Sign and deploy" }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.detect).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledWith("/");
    vi.useRealTimers();
  });

  it("rechecks a submitted reference without signing another transaction", async () => {
    vi.useFakeTimers();
    const reference = `${"ef".repeat(32)}#0`;
    mocks.build.mockResolvedValue({
      preview: { summary: "Deploy reference with 5 ADA" },
      referenceScriptOutputIndex: 0,
      signerAddress: "addr_test1_signer",
      txHex: "84a400"
    });
    mocks.signAndSubmit.mockResolvedValue("ef".repeat(32));
    mocks.detect
      .mockResolvedValueOnce(missingStore)
      .mockResolvedValueOnce(missingStore)
      .mockResolvedValueOnce({
        ...missingStore,
        activeReference: reference,
        matchingCount: 1,
        matchingReferences: [reference],
        status: "ready"
      });

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Sign and deploy" }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.signAndSubmit).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/");
    vi.useRealTimers();
  });

  it("shows the checking label while the initial store lookup is pending", () => {
    mocks.detect.mockImplementation(() => new Promise(() => undefined));

    render(<SttReferenceSetup initialStore={null} />);

    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Build setup transaction" })).not.toBeInTheDocument();
  });

  it("shows phase labels while building and waiting for the wallet signature", async () => {
    let resolveBuild!: (value: unknown) => void;
    mocks.build.mockImplementation(() => new Promise((resolve) => {
      resolveBuild = resolve;
    }));

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    expect(screen.getByRole("button", { name: "Building…" })).toBeDisabled();

    await act(async () => {
      resolveBuild({
        estimatedFeeLovelace: "190000",
        preview: { summary: "Deploy reference with 5 ADA" },
        referenceScriptOutputIndex: 0,
        signerAddress: "addr_test1_signer",
        txHex: "84a400"
      });
    });

    mocks.signAndSubmit.mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Sign and deploy" }));
    expect(screen.getByRole("button", { name: "Waiting for your signature…" })).toBeDisabled();
  });

  it("keeps the confirming label while the submitted reference is being confirmed", async () => {
    mocks.detect.mockImplementation(() => new Promise(() => undefined));
    mocks.build.mockResolvedValue({
      estimatedFeeLovelace: "190000",
      preview: { summary: "Deploy reference with 5 ADA" },
      referenceScriptOutputIndex: 0,
      signerAddress: "addr_test1_signer",
      txHex: "84a400"
    });
    mocks.signAndSubmit.mockResolvedValue("ef".repeat(32));

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Sign and deploy" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("button", { name: "Confirming on-chain…" })).toBeDisabled();
  });

  it("renders the review fee in ADA instead of raw lovelace", async () => {
    mocks.build.mockResolvedValue({
      estimatedFeeLovelace: "190000",
      preview: { summary: "Deploy reference with 5 ADA" },
      referenceScriptOutputIndex: 0,
      signerAddress: "addr_test1_signer",
      txHex: "84a400"
    });

    render(<SttReferenceSetup initialStore={missingStore} />);
    fireEvent.click(screen.getByRole("button", { name: "Build setup transaction" }));
    await act(async () => undefined);

    expect(screen.getByText("Estimated network fee: 0.19 ADA.")).toBeInTheDocument();
    expect(screen.queryByText(/lovelace/)).not.toBeInTheDocument();
  });

  it("explains the locked ADA in plain English and expands STT behind the hint", () => {
    render(<SttReferenceSetup initialStore={missingStore} />);

    expect(
      screen.getByText(/locks a small amount of ADA in a reference output/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What STT means" }));
    expect(screen.getByText(/state-thread token/)).toBeInTheDocument();
  });

  it("copies the store address with the shared copy control", async () => {
    mocks.copyText.mockResolvedValue(true);

    render(<SttReferenceSetup initialStore={missingStore} />);
    expect(screen.getByText("Permanent store: addr_test1_store")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await act(async () => undefined);

    expect(mocks.copyText).toHaveBeenCalledWith("addr_test1_store");
  });
});
