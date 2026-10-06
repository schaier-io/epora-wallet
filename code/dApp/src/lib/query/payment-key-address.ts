import { paymentCredentialHash, serializePaymentKeyCredential } from "@/lib/cardano-addresses";
import { MeshRpcError, ServerFetcher } from "@/lib/mesh/server-fetcher";
import { queryKeys, queryPolicy } from "./keys";

// One Blockfrost page, not every page: a busy wallet must not cost dozens of reads per
// field. A second address that only appears beyond this page goes unseen.
const UTXO_SAMPLE_SIZE = 100;

/**
 * The one address the sampled UTxOs sit at, or null. A person entry stores only the
 * payment key hash, and an address also needs the stake part, which the hash does not
 * hold. The chain can supply it, but only when the key holds funds right now, and only
 * unambiguously when every UTxO shares one address: the same key under two stake parts
 * is two different addresses, and picking one would name an address the person may
 * not recognise. Rows whose payment part is not this hash are ignored.
 */
export function soleAddressForPaymentKey(paymentKeyHash: string, rows: unknown): string | null {
  if (!Array.isArray(rows)) return null;
  const hash = paymentKeyHash.toLowerCase();
  const addresses = new Set<string>();
  for (const row of rows) {
    const address = (row as { address?: unknown } | null)?.address;
    if (typeof address === "string" && paymentCredentialHash(address) === hash) {
      addresses.add(address);
    }
  }
  return addresses.size === 1 ? [...addresses][0]! : null;
}

export function paymentKeyAddressQueryOptions(paymentKeyHash: string) {
  const hash = paymentKeyHash.toLowerCase();
  return {
    queryKey: queryKeys.paymentKeyAddress(hash),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      let rows: unknown;
      try {
        rows = await new ServerFetcher({ signal }).get(
          `addresses/${serializePaymentKeyCredential(hash)}/utxos?count=${UTXO_SAMPLE_SIZE}`
        );
      } catch (error) {
        // Blockfrost answers 404 for a key it has never seen. That is an answer, not a
        // fault: kept as data it stays fresh, where an error refetched on every focus.
        if (error instanceof MeshRpcError && error.status === 404) return null;
        throw error;
      }
      return soleAddressForPaymentKey(hash, rows);
    },
    staleTime: queryPolicy.metadataStaleMs,
    gcTime: queryPolicy.metadataGcMs
  };
}
