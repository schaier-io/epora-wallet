import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const countSttTokens = vi.fn(async () => 6);
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
