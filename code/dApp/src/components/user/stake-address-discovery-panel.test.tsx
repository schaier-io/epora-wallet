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
 * The panel used to fill a sidebar slot in every state: an all-clear line with a Re-check
 * button when healthy, "not checked yet" when it could not look, a spinner while looking.
 * None of those give the reader anything to do. Only stranded funds and a failed check do.
 */
describe("nothing to act on renders nothing", () => {
  it("is empty when every fund is where it belongs", () => {
    const { container } = renderPanel({ canCheck: true });

    expect(container).toBeEmptyDOMElement();
  });

  it("is empty when it could not look", () => {
    const { container } = renderPanel({ canCheck: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("is empty while it is looking", () => {
    const { container } = renderPanel({ loading: true });

    expect(container).toBeEmptyDOMElement();
  });

  it("has no Re-check button in any state", () => {
    renderPanel({ error: "Discovery failed" });

    expect(screen.queryByRole("button", { name: "Re-check" })).not.toBeInTheDocument();
  });
});

describe("a failed check", () => {
  it("says so in one plain line", () => {
    renderPanel({ error: "Discovery failed" });

    expect(
      screen.getByText("Could not check where this wallet's funds sit. Reload the page to try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Re-check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });
});

describe("orphans", () => {
  it("hands over to the notice when funds are stranded", () => {
    renderPanel({
      orphans: [{ txHash: "aa", outputIndex: 0 } as unknown as DiscoveredUtxo],
      orphanLovelace: 5_000_000n
    });

    expect(screen.getByTestId("orphan-notice")).toBeInTheDocument();
  });
});
