import { z } from "zod";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import type { AddressTransactionPageEntry, SttChainClient } from "@/lib/stt-cache/types";

const AddressTransactionsSchema = z.array(
  z.object({
    tx_hash: z.string().min(1),
    tx_index: z.number().int().nonnegative(),
    block_height: z.number().int().nullable().optional(),
    block_time: z.number().int().nullable().optional()
  })
);

function normalizeAddressTransactionPageEntry(
  entry: z.infer<typeof AddressTransactionsSchema>[number]
): AddressTransactionPageEntry {
  return {
    txHash: entry.tx_hash,
    txIndex: entry.tx_index,
    blockHeight: entry.block_height ?? null,
    blockTime: entry.block_time ?? null
  };
}

function normalizeCollectionCursor(cursor: number | string | undefined) {
  if (typeof cursor === "number") {
    return cursor;
  }

  if (typeof cursor === "string") {
    const parsed = Number(cursor);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function createDefaultSttChainClient(): SttChainClient {
  const provider = getBlockfrostProvider();

  return {
    fetchCollectionAssets(policyId, cursor) {
      return provider.fetchCollectionAssets(policyId, normalizeCollectionCursor(cursor));
    },
    fetchAddressUTxOs(address, asset) {
      return provider.fetchAddressUTxOs(address, asset);
    },
    async fetchAddressTransactionsPage(address, page, order) {
      const raw: unknown = await provider.get(
        `/addresses/${address}/transactions?page=${page}&order=${order}`
      );
      const parsed = AddressTransactionsSchema.parse(raw);
      return parsed.map(normalizeAddressTransactionPageEntry);
    },
    fetchTxInfo(hash) {
      return provider.fetchTxInfo(hash);
    }
  };
}
