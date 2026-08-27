import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrphanUtxoNotice } from "@/components/user/orphan-utxo-notice";
import { MAX_ORPHAN_SWEEP_INPUTS } from "@/components/user/workspace/constants";
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

  it("warns that a large sweep takes more than one signature", () => {
    render(
      <OrphanUtxoNotice
        orphans={orphans(MAX_ORPHAN_SWEEP_INPUTS + 1)}
        orphanLovelace={12_000_000n}
        onConsolidate={() => {}}
      />
    );

    expect(screen.getByText(/This takes 2 transactions/)).toBeTruthy();
  });
});
