import type { ReactElement } from "react";
import { createQueryTestWrapper } from "@/test/query-client";
import { render as renderUI, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

let context: ReturnType<typeof createQueryTestWrapper>;
const render = (ui: ReactElement) => renderUI(ui, { wrapper: context.wrapper });
beforeEach(() => {
  context = createQueryTestWrapper();
  countSttTokens.mockReset().mockResolvedValue(6);
});
afterEach(() => context.queryClient.clear());

const countSttTokens = vi.fn<(policyId: string, signal?: AbortSignal) => Promise<number>>(async () => 6);
vi.mock("@/lib/mesh/detection", () => ({ countSttTokens }));
vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() })
}));

const { WalletMembershipCard } = await import("@/components/user/wallet-membership-card");

/**
 * "Founding member" is a claim about being inside the first thousand wallets minted. The card
 * used it as its fallback, and the fallback is not a rare path: the count is fetched from the
 * chain after the first paint, so every card started there, and a failed query stayed there
 * forever. The card is built to be saved as a PNG and shared, so an unearned claim on it does
 * not stay inside the app.
 */
describe("wallet membership card", () => {
  it("does not claim founding membership before it knows the number", () => {
    const { container } = render(
      <WalletMembershipCard walletName="Smart wallet" policyId={null} />
    );

    expect(screen.getByText("Member")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Founding/);
  });

  it("claims it once the number says so", async () => {
    render(<WalletMembershipCard walletName="Smart wallet" policyId="abc" />);

    await waitFor(() => {
      expect(screen.getByText("Founding member · No. 6")).toBeTruthy();
    });
  });
});

describe("wallet membership card asset name", () => {
  const policyId = "a".repeat(56);

  it("shows a printable asset name without the old STT prefix", () => {
    render(<WalletMembershipCard walletName="W" policyId={policyId} sttUnit={`${policyId}5553444d`} />);

    expect(screen.getByText("USDM")).toBeTruthy();
    expect(screen.queryByText(/STT ·/)).toBeNull();
  });

  it.each(["01", "ff", "abc", "zz"])("uses the wallet label for unreadable asset name %s", (assetName) => {
    render(<WalletMembershipCard walletName="W" policyId={policyId} sttUnit={`${policyId}${assetName}`} />);

    expect(screen.getByText("Smart wallet")).toBeTruthy();
    expect(screen.queryByText(assetName)).toBeNull();
  });

  it("keeps the wallet label for an empty asset name", () => {
    render(<WalletMembershipCard walletName="W" policyId={policyId} sttUnit={policyId} />);

    expect(screen.getByText("Smart wallet")).toBeTruthy();
  });
});

it("clears the prior policy's number while the next policy is loading", async () => {
  countSttTokens.mockResolvedValueOnce(6).mockImplementation(() => new Promise(() => {}));
  const view = render(<WalletMembershipCard walletName="W" policyId="policy-a" />);
  await waitFor(() => expect(screen.getByText("Founding member · No. 6")).toBeInTheDocument());
  view.rerender(<WalletMembershipCard walletName="W" policyId="policy-b" />);
  expect(screen.queryByText("Founding member · No. 6")).not.toBeInTheDocument();
  expect(screen.getByText("Member")).toBeInTheDocument();
  view.rerender(<WalletMembershipCard walletName="W" policyId={null} />);
  expect(countSttTokens.mock.calls[1][1]?.aborted).toBe(true);
});

it("shares counts for one policy and isolates a different network", async () => {
  const view = render(<>
    <WalletMembershipCard walletName="A" policyId="policy" network="Preprod" />
    <WalletMembershipCard walletName="B" policyId="policy" network="preprod" />
  </>);
  await waitFor(() => expect(screen.getAllByText("Founding member · No. 6")).toHaveLength(2));
  expect(countSttTokens).toHaveBeenCalledTimes(1);
  countSttTokens.mockResolvedValueOnce(7);
  view.rerender(<WalletMembershipCard walletName="W" policyId="policy" network="Preview" />);
  expect(screen.queryByText("Founding member · No. 6")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Founding member · No. 7")).toBeInTheDocument());
  expect(countSttTokens).toHaveBeenCalledTimes(2);
});
