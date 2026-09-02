import { render, screen, waitFor } from "@testing-library/react";
import type * as Jotai from "jotai";
import { describe, expect, it, vi } from "vitest";

const transactionsModule = vi.hoisted(() => ({ requested: false }));

vi.mock("@/components/user/workspace/workspace-transactions-view", () => {
  transactionsModule.requested = true;
  return new Promise(() => {});
});

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof Jotai>()),
  useAtomValue: () => ({ unit: "detected-wallet" })
}));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    resolvedGuidedOverviewSection: "transactions"
  })
}));

const { TechnicalDetail, WorkspaceWalletDashboardView } = await import(
  "@/components/user/workspace/workspace-wallet-dashboard-view"
);

describe("transactions bundle boundary", () => {
  it("does not load the transactions view with the wallet dashboard module", () => {
    expect(transactionsModule.requested).toBe(false);
  });

  it("announces activity while the transactions view loads", async () => {
    render(<WorkspaceWalletDashboardView />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading activity…");
    await waitFor(() => expect(transactionsModule.requested).toBe(true));
  });
});

/**
 * "Advanced wallet details" says what it is for: "support, exports, or block-explorer
 * lookups". Every one of those starts by getting the value out of the page, and two of the
 * three rows used to offer no way to do that. The token id had no link and no button at all,
 * so the only route to it was selecting 64 characters of monospace by hand.
 *
 * So the rule this holds is not about layout: every row that has a value offers a copy, and a
 * row without a value says so instead of rendering an empty control.
 */
function renderDetail(value: string | null, href: string | null) {
  const onCopy = vi.fn(async () => {});
  const result = render(
    <TechnicalDetail
      title="Token ID"
      hint="The name of this wallet's on-chain token."
      value={value}
      href={href}
      copyLabel="Token ID copied"
      copyFeedback={null}
      onCopy={onCopy}
    />
  );
  return { ...result, onCopy };
}

describe("technical detail row", () => {
  it("copies the value it shows", () => {
    const { onCopy } = renderDetail("abc123", null);

    screen.getByLabelText("Copy Token ID").click();
    expect(onCopy).toHaveBeenCalledWith("abc123", "Token ID copied");
  });

  it("offers an explorer link only when there is somewhere to send the reader", () => {
    const withLink = renderDetail("abc123", "https://preprod.cardanoscan.io/transaction/abc123");
    expect(withLink.container.querySelectorAll("a")).toHaveLength(1);
    withLink.unmount();

    const withoutLink = renderDetail("abc123", null);
    expect(withoutLink.container.querySelectorAll("a")).toHaveLength(0);
  });

  it("says the value is missing rather than offering a control that copies nothing", () => {
    const { container } = renderDetail(null, null);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
