import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrphanUtxoNotice } from "@/components/user/orphan-utxo-notice";
import { mergeDiscoveredWalletUtxos } from "@/lib/discovery/orphan-utxos";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

function orphans(count: number): DiscoveredUtxo[] {
  return Array.from({ length: count }, (_, index) => ({ index }) as unknown as DiscoveredUtxo);
}

/**
 * The notice renders in the sidebar, in the same slot as the idle "All wallet funds are at
 * your wallet address" row, alongside three `rounded-lg` panels. It was `rounded-xl` (14px),
 * the radius of the Card holding it, so it read as floating loose rather than nested.
 */
describe("orphan utxo notice", () => {
  it("nests inside the sidebar Card rather than matching it", () => {
    const { container } = render(
      <OrphanUtxoNotice orphans={orphans(1)} orphanLovelace={12_000_000n} onConsolidate={() => {}} />
    );

    const panel = container.querySelector("[role='alert']");
    expect(panel?.className).toContain("rounded-lg");
    expect(panel?.className).not.toContain("rounded-xl");
  });

  it("leads with the amount, not the UTxO count", () => {
    render(
      <OrphanUtxoNotice orphans={orphans(3)} orphanLovelace={12_000_000n} onConsolidate={() => {}} />
    );

    expect(screen.getByText(/12 ₳ is in the wrong spot/)).toBeTruthy();
  });

  it("passes every discovered UTxO to consolidation", () => {
    const discovered = orphans(3);
    const onConsolidate = vi.fn();
    render(
      <OrphanUtxoNotice
        orphans={discovered}
        orphanLovelace={12_000_000n}
        onConsolidate={onConsolidate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Move it back" }));

    expect(onConsolidate).toHaveBeenCalledWith(discovered);
  });

  it("offers a noncanonical six-native-asset UTxO to final-beneficiary recovery", () => {
    const discovered: DiscoveredUtxo[] = [
      {
        txHash: "ab".repeat(32),
        outputIndex: 2,
        address: "addr_test1_noncanonical_stake_credential",
        lovelace: "3000000",
        assets: Array.from({ length: 6 }, (_, index) => ({
          unit: `${"cd".repeat(28)}${index.toString(16).padStart(2, "0")}`,
          quantity: String(index + 1)
        }))
      }
    ];
    const onConsolidate = vi.fn();
    const onRecover = vi.fn();

    const loaded = mergeDiscoveredWalletUtxos([], discovered);
    expect(loaded[0]?.output.address).toBe(discovered[0]?.address);
    expect(loaded[0]?.output.amount).toEqual([
      { unit: "lovelace", quantity: "3000000" },
      ...discovered[0]!.assets
    ]);
    expect(mergeDiscoveredWalletUtxos(loaded, discovered)).toHaveLength(1);

    render(
      <OrphanUtxoNotice
        orphans={discovered}
        orphanLovelace={3_000_000n}
        onConsolidate={onConsolidate}
        onRecover={onRecover}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Recover funds" }));

    expect(onRecover).toHaveBeenCalledWith(discovered);
    expect(onConsolidate).not.toHaveBeenCalled();
  });
});

it("keeps re-check available while stale recovery actions are disabled", () => {
  const onConsolidate = vi.fn();
  const onRecover = vi.fn();
  const onRefresh = vi.fn();
  render(<OrphanUtxoNotice orphans={orphans(1)} orphanLovelace={1n} actionsDisabled
    onConsolidate={onConsolidate} onRecover={onRecover} onRefresh={onRefresh} />);
  expect(screen.getByRole("button", { name: "Move it back" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Recover funds" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Re-check" }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
