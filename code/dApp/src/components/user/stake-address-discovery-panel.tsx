"use client";

import { Button } from "@/components/ui/button";
import { OrphanUtxoNotice } from "@/components/user/orphan-utxo-notice";
import { useOrphanWalletUtxos } from "@/hooks/use-orphan-wallet-utxos";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

type StakeAddressDiscoveryPanelProps = {
  sttPolicyId: string;
  sttAssetNameHex: string;
  /// The canonical wallet address (payment credential + intended stake
  /// credential). Anything else discovered at the payment credential is an
  /// orphan / "Franken" UTxO.
  walletScriptAddress: string;
  enabled?: boolean;
  busy?: boolean;
  onConsolidate: (orphans: DiscoveredUtxo[]) => void;
};

/// A Tools panel that runs the orphan / Franken-address discovery (a direct,
/// client-side Koios query — on the user's machine) automatically when the
/// wallet opens, surfaces the popup when funds sit at a non-intended stake
/// address, and offers a manual "Re-check".
export function StakeAddressDiscoveryPanel({
  sttPolicyId,
  sttAssetNameHex,
  walletScriptAddress,
  enabled = true,
  busy = false,
  onConsolidate
}: StakeAddressDiscoveryPanelProps) {
  const { orphans, orphanLovelace, loading, error, refetch } = useOrphanWalletUtxos({
    sttPolicyId,
    sttAssetNameHex,
    walletScriptAddress,
    enabled
  });

  if (orphans.length > 0) {
    return (
      <OrphanUtxoNotice
        orphans={orphans}
        orphanLovelace={orphanLovelace}
        busy={busy}
        onConsolidate={onConsolidate}
        onRefresh={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/20 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {loading
          ? "Checking stake addresses…"
          : error
            ? "Couldn't reach the chain to check stake addresses right now — tap Re-check."
            : "All wallet funds are at your wallet address."}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => void refetch()}
      >
        Re-check
      </Button>
    </div>
  );
}
