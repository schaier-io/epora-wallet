"use client";
import { useTranslations } from "next-intl";

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

/// Runs the orphan / Franken-address discovery (a direct, client-side Koios query, on
/// the user's machine) automatically when the wallet opens and surfaces the notice when
/// funds sit at a non-intended stake address. Renders nothing when there is nothing to
/// act on: the all-clear strip and its Re-check button sat in every healthy sidebar and
/// told the reader about a problem they did not have.
export function StakeAddressDiscoveryPanel({
  sttPolicyId,
  sttAssetNameHex,
  walletScriptAddress,
  enabled = true,
  busy = false,
  onConsolidate
}: StakeAddressDiscoveryPanelProps) {
  const i18n = useTranslations("ComponentsUserStakeAddressDiscoveryPanel");
  const { orphans, orphanLovelace, error, refetch } = useOrphanWalletUtxos({
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

  if (error) {
    return (
      <p className="rounded-lg border border-border/40 bg-background/20 px-3 py-2 text-xs text-muted-foreground">
        {i18n("couldNotCheckWhereThisWalletSFunds")}
      </p>
    );
  }

  return null;
}
