import { countAddressUtxos, countAssetUtxos } from "./asset-amounts";
import { normalizeBlockTimeMs } from "./formatters";
import { RECENT_WALLET_TRANSACTION_FETCH_PAGES } from "@/components/user/workspace/constants";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type WalletInputRef } from "@/lib/types/contracts";
import { type TransactionInfo } from "@meshsdk/common";
import { type UTxO } from "@meshsdk/core";

export function transactionTouchesAddress(transaction: TransactionInfo, address: string) {
  return (
    countAddressUtxos(transaction.inputs, address) > 0 ||
    countAddressUtxos(transaction.outputs, address) > 0
  );
}

/**
 * The provider's `fetchTxInfo` passes Blockfrost's tx-utxos entries through raw: an
 * entry carries `{ address, amount, output_index, transaction: { hash, index } }`, while
 * every counter, classifier, and view here expects the Mesh `UTxO` shape
 * (`{ input: { txHash, outputIndex }, output: { address, amount } }`). Untranslated, the
 * shape mismatch read as zero inputs and zero outputs everywhere — address filters
 * dropped the wallet's whole history (only txs anchored by a current UTxO survived) and
 * the event classifier fell through to its "referenced" guesses.
 */
function normalizeTransactionUtxo(entry: unknown, fallbackTxHash: string): UTxO | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as {
    input?: { txHash?: string; outputIndex?: number };
    output?: { address?: string; amount?: Array<{ unit: string; quantity: string }> };
    address?: string;
    amount?: Array<{ unit: string; quantity: string }>;
    output_index?: number;
    transaction?: { hash?: string; index?: number };
  };

  // Already Mesh-shaped: leave it untouched.
  if (candidate.input?.txHash && candidate.output?.address) {
    return candidate as unknown as UTxO;
  }

  const txHash = candidate.transaction?.hash ?? fallbackTxHash;
  const address = candidate.address;
  if (!txHash || !address) {
    return null;
  }

  return {
    input: {
      txHash,
      outputIndex: candidate.output_index ?? candidate.transaction?.index ?? 0
    },
    output: {
      address,
      amount: Array.isArray(candidate.amount) ? candidate.amount : []
    }
  };
}

export function normalizeTransactionIo(transaction: TransactionInfo): TransactionInfo {
  const txHash = transaction.hash ?? "";
  return {
    ...transaction,
    inputs: (transaction.inputs ?? [])
      .map((entry) => normalizeTransactionUtxo(entry, txHash))
      .filter((entry): entry is UTxO => entry !== null),
    outputs: (transaction.outputs ?? [])
      .map((entry) => normalizeTransactionUtxo(entry, txHash))
      .filter((entry): entry is UTxO => entry !== null)
  };
}

export function transactionTouchesAsset(transaction: TransactionInfo, unit: string) {
  return (
    countAssetUtxos(transaction.inputs, unit) > 0 ||
    countAssetUtxos(transaction.outputs, unit) > 0
  );
}

export function normalizeTransactionHash(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

export function uniqueTransactionHashes(values: Array<string | null | undefined>) {
  const unique = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeTransactionHash(value);
    if (normalized) {
      unique.add(normalized);
    }
  });

  return [...unique];
}

export function selectVisibleWalletTransactions(
  transactions: TransactionInfo[],
  anchorTxHashes: string[],
  limit: number
) {
  const anchorSet = new Set(anchorTxHashes);
  const selectedByHash = new Map<string, TransactionInfo>();

  transactions.slice(0, limit).forEach((transaction) => {
    selectedByHash.set(transaction.hash.toLowerCase(), transaction);
  });

  transactions.forEach((transaction) => {
    if (anchorSet.has(transaction.hash.toLowerCase())) {
      selectedByHash.set(transaction.hash.toLowerCase(), transaction);
    }
  });

  return mergeAndSortTransactions([[...selectedByHash.values()]]);
}

/**
 * The same transaction reaches the feed from several fetch paths — the wallet-address
 * listing, the STT-script-address listing, and the by-hash detail — and their payloads
 * differ in completeness: an address-scoped listing carries only some of the tx's inputs.
 * A balance delta computed from a partial payload sees outputs with no matching inputs and
 * invents phantom funds (a 9-in/9-out consolidation read as "+9 ₳"). Since a tx's on-chain
 * IO is immutable, completeness is the primary criterion for coalescing duplicates and
 * recency only breaks ties between equally complete views.
 */
function ioEntryCount(transaction: TransactionInfo) {
  return (transaction.inputs?.length ?? 0) + (transaction.outputs?.length ?? 0);
}

export function mergeAndSortTransactions(groups: TransactionInfo[][]) {
  const transactionsByHash = new Map<string, TransactionInfo>();

  groups.flat().forEach((transaction) => {
    const existing = transactionsByHash.get(transaction.hash);

    if (!existing) {
      transactionsByHash.set(transaction.hash, transaction);
      return;
    }

    if (ioEntryCount(transaction) > ioEntryCount(existing)) {
      transactionsByHash.set(transaction.hash, transaction);
      return;
    }

    const existingTime = normalizeBlockTimeMs(existing.blockTime) ?? 0;
    const nextTime = normalizeBlockTimeMs(transaction.blockTime) ?? 0;
    const existingSlot = Number(existing.slot ?? 0);
    const nextSlot = Number(transaction.slot ?? 0);

    if (
      ioEntryCount(transaction) === ioEntryCount(existing) &&
      (nextTime > existingTime || nextSlot > existingSlot)
    ) {
      transactionsByHash.set(transaction.hash, transaction);
    }
  });

  return [...transactionsByHash.values()].sort((left, right) => {
    const leftTime = normalizeBlockTimeMs(left.blockTime) ?? 0;
    const rightTime = normalizeBlockTimeMs(right.blockTime) ?? 0;
    const leftSlot = Number(left.slot ?? 0);
    const rightSlot = Number(right.slot ?? 0);

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    if (leftSlot !== rightSlot) {
      return rightSlot - leftSlot;
    }

    return right.hash.localeCompare(left.hash);
  });
}

export function getUtxoRefKey(utxo: UTxO) {
  const txHash = utxo?.input?.txHash;
  if (!txHash) return null;
  return `${txHash.toLowerCase()}#${utxo.input.outputIndex ?? 0}`;
}

export function dedupeUtxosByRef(utxos: UTxO[]) {
  const seen = new Set<string>();
  const result: UTxO[] = [];

  utxos.forEach((utxo) => {
    if (!utxo) return;
    const key = getUtxoRefKey(utxo);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(utxo);
  });

  return result;
}

export function findMatchingLockedUtxo(utxos: UTxO[], ref: WalletInputRef) {
  return utxos.find(
    (utxo) =>
      utxo.input.txHash === ref.txHash && utxo.input.outputIndex === ref.outputIndex
  );
}

export async function fetchScriptUtxos(address: string) {
  const fetcher = new ServerFetcher();
  return fetcher.fetchAddressUTxOs(address);
}

export async function fetchAddressTransactions(
  address: string,
  maxPage = RECENT_WALLET_TRANSACTION_FETCH_PAGES
) {
  const fetcher = new ServerFetcher();
  const transactions = await fetcher.fetchAddressTxs(address, {
    maxPage,
    order: "desc"
  });
  return transactions.map(normalizeTransactionIo);
}

export async function fetchTransactionsByHash(txHashes: string[]) {
  if (txHashes.length === 0) {
    return [];
  }

  const fetcher = new ServerFetcher();
  const results = await Promise.allSettled(
    txHashes.map((txHash) => fetcher.fetchTxInfo(txHash))
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? [normalizeTransactionIo(result.value)] : []
  );
}

