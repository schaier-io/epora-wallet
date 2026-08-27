import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DiscoveredUtxo } from "@/lib/discovery/types";

const holder = vi.hoisted(() => ({
  result: {
    orphans: [] as DiscoveredUtxo[],
    orphanLovelace: 0n,
    loading: false,
    error: null as string | null,
    canCheck: true,
    refetch: vi.fn(async () => {})
  }
}));

vi.mock("@/hooks/use-orphan-wallet-utxos", () => ({
  useOrphanWalletUtxos: () => holder.result
}));

vi.mock("@/components/user/orphan-utxo-notice", () => ({
  OrphanUtxoNotice: () => <div data-testid="orphan-notice" />
}));

const { StakeAddressDiscoveryPanel } = await import(
  "@/components/user/stake-address-discovery-panel"
);

function renderPanel({
  enabled = true,
  ...overrides
}: Partial<typeof holder.result> & { enabled?: boolean } = {}) {
  holder.result = {
    orphans: [],
    orphanLovelace: 0n,
    loading: false,
    error: null,
    canCheck: true,
    refetch: vi.fn(async () => {}),
    ...overrides
  };
  return render(
    <StakeAddressDiscoveryPanel
      sttPolicyId="policy"
      sttAssetNameHex="asset"
      walletScriptAddress="addr_test1wallet"
      enabled={enabled}
      onConsolidate={vi.fn()}
    />
  );
}

/**
 * `useOrphanWalletUtxos` clears `orphans` and reports no error when it cannot run
 * (`src/hooks/use-orphan-wallet-utxos.ts:57-63,82-85`), so an empty list means either
 * "found nothing" or "never looked". The panel used to render the all-clear for both.
 */
describe("an unrun check is not an all-clear", () => {
  it("does not claim the funds are in place when it could not look", () => {
    renderPanel({ canCheck: false });

    expect(screen.getByText("This wallet's funds have not been checked yet.")).toBeInTheDocument();
    expect(screen.queryByText(/All of this wallet's funds are at its current address/)).not.toBeInTheDocument();
  });

  it("names the network when that is the reason it cannot look", () => {
    renderPanel({ canCheck: false, enabled: false });

    expect(
      screen.getByText(
        "This wallet's funds have not been checked. This check runs on the Preprod test network only."
      )
    ).toBeInTheDocument();
  });

  it("turns Re-check off when pressing it would do nothing", () => {
    renderPanel({ canCheck: false });

    expect(screen.getByRole("button", { name: "Re-check" })).toBeDisabled();
  });

  it("still gives the all-clear once a check has actually run", () => {
    renderPanel({ canCheck: true });

    expect(
      screen.getByText("All of this wallet's funds are at its current address.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-check" })).toBeEnabled();
  });
});

describe("copy", () => {
  it("drops the em dash and the mobile-only verb from the error line", () => {
    renderPanel({ error: "Discovery failed" });

    expect(
      screen.getByText("Could not check where this wallet's funds sit. Choose Re-check to try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/tap Re-check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });

  it("says what it is checking without naming stake addresses", () => {
    renderPanel({ loading: true });

    expect(screen.getByText("Checking where this wallet's funds sit…")).toBeInTheDocument();
    expect(screen.queryByText(/stake addresses/)).not.toBeInTheDocument();
  });
});

describe("depth", () => {
  it("rounds the same as the notice this slot swaps to", () => {
    const { container } = renderPanel();

    expect(container.querySelector(".rounded-lg")).not.toBeNull();
    expect(container.querySelector(".rounded-xl")).toBeNull();
  });
});

describe("orphans", () => {
  it("hands over to the notice when funds are stranded", () => {
    renderPanel({
      orphans: [{ txHash: "aa", outputIndex: 0 } as unknown as DiscoveredUtxo],
      orphanLovelace: 5_000_000n
    });

    expect(screen.getByTestId("orphan-notice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-check" })).not.toBeInTheDocument();
  });
});
