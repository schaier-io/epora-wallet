import { createQueryTestWrapper } from "@/test/query-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProposalDetailDto, ProposalVerification } from "@/lib/proposals/types";
import type * as ProposalClient from "@/lib/proposals/client";

const api = vi.hoisted(() => ({
  session: vi.fn(), list: vi.fn(), detail: vi.fn(), verify: vi.fn(), sign: vi.fn()
}));
const wallet = vi.hoisted(() => ({ signTx: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("proposal=proposal-1")
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({ activeWallet: wallet, isDemoWallet: false })
}));
vi.mock("@/lib/proposals/client", async (importOriginal) => ({
  ...await importOriginal<typeof ProposalClient>(),
  fetchProposalSession: api.session,
  listProposals: api.list,
  fetchProposal: api.detail,
  signProposal: api.sign
}));
vi.mock("@/lib/proposals/verify", () => ({
  MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS: 8,
  verifyProposal: api.verify
}));
vi.mock("@/lib/proposals/assemble", () => ({ normalizeWitnessSetHex: () => "witness" }));
vi.mock("@/lib/proposals/rebuild", () => ({
  RebuildUnsupportedError: class extends Error {},
  isAutoRebuildable: () => false,
  rebuildProposalTx: vi.fn()
}));

import { ToastProvider } from "@/providers/toast-provider";
import { ProposalsWorkspace } from "./proposals-workspace";

const SIGNER = "dd".repeat(28);
const BODY_HASH = "bb".repeat(32);
let record: ProposalDetailDto;

function verification(detail: ProposalDetailDto): ProposalVerification {
  return {
    validity: "valid", reasons: [], bodyHashMatches: true,
    stateTransition: { txBodyHash: detail.txBodyHash, outputIndex: 0, changes: [] },
    effect: { inputs: [], outputs: [], feeLovelace: "200000", validUntilMs: null },
    signers: {
      authorityPath: "multisig", requiredSigners: [],
      signedKeyHashes: detail.signerKeyHashes,
      satisfiedPower: detail.signatureCount, threshold: 1,
      satisfied: detail.signatureCount > 0
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  record = {
    id: "proposal-1", walletUnit: `${"aa".repeat(28)}01`, walletPolicyId: "aa".repeat(28),
    title: "Pay the supplier", description: null, actionKind: "use", authorityPath: "multisig",
    status: "OPEN", txBodyHash: BODY_HASH, submittedTxHash: null, createdByKeyHash: "cc".repeat(28),
    createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
    signatureCount: 0, signerKeyHashes: [], unsignedTxHex: "80", buildContextJson: null,
    summaryJson: null, signatures: []
  };
  api.session.mockResolvedValue({ paymentKeyHash: SIGNER, address: "addr_test1signer" });
  api.list.mockImplementation(async () => ({ proposals: [{ ...record }], nextCursor: null }));
  api.detail.mockImplementation(async () => ({ ...record }));
  api.verify.mockImplementation(async (detail: ProposalDetailDto) => verification(detail));
  wallet.signTx.mockResolvedValue("wallet-witness");
  api.sign.mockImplementation(async () => ({ ...record }));
});

it.each([
  ["CANCELLED", "This request was withdrawn. Nobody can sign it now."],
  ["SUBMITTING", "This request is being sent to the blockchain. Do not build it again."],
  ["SUBMITTED", null]
] as const)("refreshes a remote %s status in the open detail", async (status, message) => {
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  await screen.findByRole("button", { name: "Sign this request" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
  record = { ...record, status };

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  if (message) expect(await screen.findByText(message)).toBeInTheDocument();
  else expect(await screen.findByRole("link", { name: /bbbb/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sign this request" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit transaction" })).not.toBeInTheDocument();
});

it("signs the refreshed body after the proposer rebuilds the open request", async () => {
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  await screen.findByRole("button", { name: "Sign this request" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
  record = { ...record, title: "Rebuilt request", txBodyHash: "ee".repeat(32), unsignedTxHex: "81" };

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("heading", { name: "Rebuilt request" });
  fireEvent.click(await screen.findByRole("button", { name: "Sign this request" }));

  await waitFor(() => expect(wallet.signTx).toHaveBeenCalledWith("81", true));
  expect(api.sign).toHaveBeenCalledWith("proposal-1", {
    txBodyHash: "ee".repeat(32), witnessSetHex: "witness"
  });
});

it("keeps the signing progress visible while Refresh waits for the wallet", async () => {
  let finishSignature!: (value: string) => void;
  wallet.signTx.mockReturnValue(new Promise<string>((resolve) => { finishSignature = resolve; }));
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Sign this request" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  const signButton = screen.getByRole("button", { name: "Sign this request" });
  expect(signButton).toBeDisabled();
  expect(signButton).toHaveAttribute("aria-busy", "true");
  record = { ...record, status: "CANCELLED" };
  await act(async () => { finishSignature("wallet-witness"); });
  expect(await screen.findByText("This request was withdrawn. Nobody can sign it now.")).toBeInTheDocument();
  expect(wallet.signTx).toHaveBeenCalledTimes(1);
});

it("refreshes the open detail after another signer adds the required signature", async () => {
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  expect(await screen.findByRole("button", { name: "Sign this request" })).toBeEnabled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());

  record = {
    ...record, signatureCount: 1, signerKeyHashes: [SIGNER],
    signatures: [{ signerKeyHash: SIGNER, current: true, createdAt: record.updatedAt, witnessSetHex: "witness" }]
  };
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  expect(await screen.findByRole("button", { name: "Submit transaction" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Sign this request" })).not.toBeInTheDocument();
});


it("hides signing while the manual detail refresh is still pending", async () => {
  let finishDetail!: (value: ProposalDetailDto) => void;
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  await screen.findByRole("button", { name: "Sign this request" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
  api.detail.mockReturnValue(new Promise<ProposalDetailDto>((resolve) => { finishDetail = resolve; }));

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  expect(screen.queryByRole("button", { name: "Sign this request" })).not.toBeInTheDocument();
  await act(async () => { finishDetail({ ...record, status: "CANCELLED" }); });
  expect(await screen.findByText("This request was withdrawn. Nobody can sign it now.")).toBeInTheDocument();
});


it("refreshes background checks even when the server list is unchanged", async () => {
  render(<ToastProvider><ProposalsWorkspace /></ToastProvider>, { wrapper: createQueryTestWrapper().wrapper });
  await screen.findByRole("button", { name: "Sign this request" });
  const backgroundCalls = () => api.verify.mock.calls.filter(([, options]) =>
    (options as { maxInputLookups?: number }).maxInputLookups === 8).length;
  await waitFor(() => expect(backgroundCalls()).toBe(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(backgroundCalls()).toBe(2));
});
