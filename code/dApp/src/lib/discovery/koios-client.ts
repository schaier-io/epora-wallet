// Koios client for the orphan / "Franken" UTxO check. Koios's public API does
// NOT send an `access-control-allow-origin` header, so the browser cannot call
// it cross-origin (every fetch fails with "Failed to fetch") — unlike Blockfrost,
// which returns `*`. So the one call we need is routed through a same-origin
// server proxy (`/api/koios/credential-utxos`) which reaches Koios server-side.
//
// Trade-off vs. the old direct-from-browser design: the app server now sees the
// queried payment credential (it cannot work from the browser otherwise).
// Override the upstream endpoint with the server env var `KOIOS_URL`.

import type { DiscoveredUtxo } from "@/lib/discovery/types";

const CREDENTIAL_UTXOS_PROXY = "/api/koios/credential-utxos";

type KoiosAsset = {
  policy_id: string;
  asset_name: string | null;
  quantity: string;
};

type KoiosUtxo = {
  tx_hash: string;
  tx_index: number;
  address: string;
  value: string;
  asset_list?: KoiosAsset[] | null;
};

/// Fetch every unspent UTxO at `paymentCredentialHex` (a 28-byte blake2b-224
/// script/key hash, hex), across ALL stake credentials — including base-address
/// ("Franken") variants that an address-based Blockfrost query would miss.
export async function fetchCredentialUtxos(
  paymentCredentialHex: string,
  network = "preprod"
): Promise<DiscoveredUtxo[]> {
  const response = await fetch(CREDENTIAL_UTXOS_PROXY, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      paymentCredential: paymentCredentialHex,
      network
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Koios credential_utxos failed (${response.status}): ${body.slice(0, 200)}`
    );
  }

  const rows = (await response.json()) as KoiosUtxo[];
  return rows.map((row) => ({
    txHash: row.tx_hash,
    outputIndex: row.tx_index,
    address: row.address,
    lovelace: row.value,
    assets: (row.asset_list ?? []).map((asset) => ({
      unit: `${asset.policy_id}${asset.asset_name ?? ""}`,
      quantity: asset.quantity
    }))
  }));
}
