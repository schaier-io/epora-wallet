import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LockedAssetsOverviewPanel } from "@/components/user/locked-assets-panel";

/**
 * Neither state below can be produced with the fixture wallet, which holds one asset in one
 * fund pool, so both are held here.
 *
 * "Fund pool" is the app's own coinage for a UTxO and it appears across 24 files. The only
 * explanation of it anywhere was a `title` attribute on this pill, which never opens on a
 * touch screen and is not reachable from the keyboard. It is an `InfoHint` now, which is the
 * component 19c fixed for exactly this.
 *
 * And the empty panel used to say the wallet was empty three times: a count line
 * ("Nothing inside this wallet yet."), a headline ("Wallet ready. Fund it to begin.") and the
 * caller's hint. The count line is gone, because a count of zero is not a count.
 */
describe("locked assets panel", () => {
  it("explains its own term somewhere a phone can open", () => {
    render(<LockedAssetsOverviewPanel utxoCount={2} assets={[]} />);

    expect(screen.getByText("2 fund pools")).toBeTruthy();
    const hint = screen.getByRole("button", { name: "What a fund pool is" });
    fireEvent.click(hint);
    // The shared definition, not a panel-local paraphrase: it names the Cardano term the
    // coinage stands in for (UTxO) and the word the receipt copy uses for the same money
    // ("locked"), because the panel is where a reader meets both.
    expect(screen.getByText(/separate chunks called UTxOs/)).toBeTruthy();
    expect(screen.getByText(/called locked/)).toBeTruthy();
  });

  it("does not say the wallet is empty twice", () => {
    const { container } = render(
      <LockedAssetsOverviewPanel
        utxoCount={0}
        assets={[]}
        emptyHint="Send ADA to this smart wallet's address."
        emptyCta={{ label: "Add funds", onClick: vi.fn() }}
      />
    );

    expect(screen.getByText("Wallet ready. Fund it to begin.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Nothing inside this wallet yet/);
  });

  it("counts the assets it actually lists", () => {
    render(
      <LockedAssetsOverviewPanel
        utxoCount={1}
        assets={[{ unit: "lovelace", quantity: "8000000" }]}
      />
    );

    expect(screen.getByText("1 asset in this wallet.")).toBeTruthy();
  });
});
