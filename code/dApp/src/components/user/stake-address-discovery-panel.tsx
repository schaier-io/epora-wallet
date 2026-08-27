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
/// client-side Koios query, on the user's machine) automatically when the
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
  const { orphans, orphanLovelace, loading, error, canCheck, refetch } = useOrphanWalletUtxos({
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
    // rounded-lg, matching the orphan notice this slot swaps to and the Advanced panel
    // above it (`workspace/workspace-sidebar-view.tsx:227`). It was rounded-xl, so the one
    // slot rounded differently depending on what it found.
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/20 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {/* The all-clear used to show whenever the list was empty, including when the query
            never ran: `useOrphanWalletUtxos` clears `orphans` and reports no error when it
            cannot run, so the panel promised that every fund was in place without having
            looked. That happens off Preprod, and on Preprod for as long as the wallet's
            address is still resolving (`orphanDiscoveryWalletAddressAtom` returns "" until
            the policy id and asset name arrive). */}
        {loading
          ? "Checking where this wallet's funds sit…"
          : !canCheck
            ? enabled
              ? "This wallet's funds have not been checked yet."
              : "This wallet's funds have not been checked. This check runs on the Preprod test network only."
            : error
              ? "Could not check where this wallet's funds sit. Choose Re-check to try again."
              : "All of this wallet's funds are at its current address."}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading || !canCheck}
        onClick={() => void refetch()}
      >
        Re-check
      </Button>
    </div>
  );
}
