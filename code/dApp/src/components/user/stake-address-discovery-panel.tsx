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
  onRecover?: (orphans: DiscoveredUtxo[]) => void;
};

/// Runs orphan / Franken-address discovery through the app's Koios proxy when the
/// wallet opens. The app server receives the queried payment credential; see
/// `lib/discovery/koios-client.ts`. Shows a notice for funds at another stake address
/// and renders nothing when no action is needed.
export function StakeAddressDiscoveryPanel({
  sttPolicyId,
  sttAssetNameHex,
  walletScriptAddress,
  enabled = true,
  busy = false,
  onConsolidate,
  onRecover
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
        onRecover={onRecover}
        onRefresh={() => void refetch()}
      />
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-border/40 bg-background/20 px-3 py-2 text-xs text-muted-foreground">
        {i18n("couldNotCheckWhereThisWalletSFunds")}
      </p>
    );
  }

  return null;
}
