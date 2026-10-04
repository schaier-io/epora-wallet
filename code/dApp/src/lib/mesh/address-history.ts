import type { IFetcherOptions, TransactionInfo } from "@meshsdk/common";
import { z } from "zod";
import { abortable } from "./build-cancellation";
import { BlockfrostResponseError } from "./blockfrost-reads";
import { meshHttpStatus } from "./http-error";

const HISTORY_PAGE_SIZE = 100;
const HISTORY_READ_CONCURRENCY = 8;
const Hash = z.string().regex(/^[0-9a-f]{64}$/i);
const Integer = z.number().int().nonnegative().safe();
const Page = z.array(z.object({ tx_hash: Hash, block_height: Integer, block_time: Integer })).max(HISTORY_PAGE_SIZE);
const Metadata = z.object({
  hash: Hash, block: Hash, slot: Integer, index: Integer, fees: z.string(), deposit: z.string(), size: Integer,
  invalid_before: z.string().nullable(), invalid_hereafter: z.string().nullable()
});
const Output = z.object({
  address: z.string().min(1), output_index: Integer,
  amount: z.array(z.object({ unit: z.string(), quantity: z.string() }))
}).passthrough();
const Io = z.object({ inputs: z.array(Output.extend({ tx_hash: Hash })), outputs: z.array(Output) });
type HistoryReader = { get(path: string): Promise<unknown> };

function parse<T>(schema: z.ZodType<T>, raw: unknown, path: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new BlockfrostResponseError(path, result.error);
  return result.data;
}

/** Load complete history pages with bounded hydration and no new work after cancellation. */
export async function fetchAddressHistory(
  provider: HistoryReader, address: string, options: Required<IFetcherOptions>, callerSignal?: AbortSignal
): Promise<TransactionInfo[]> {
  const failure = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, failure.signal]) : failure.signal;
  const read = async (path: string): Promise<unknown> => {
    signal.throwIfAborted();
    return abortable(signal, () => provider.get(path));
  };
  const history: TransactionInfo[] = [];
  try {
    for (let page = 1; page <= options.maxPage; page++) {
      const path = `/addresses/${encodeURIComponent(address)}/transactions?count=${HISTORY_PAGE_SIZE}&page=${page}&order=${options.order}`;
      let raw: unknown;
      try { raw = await read(path); }
      catch (error) {
        signal.throwIfAborted();
        if (meshHttpStatus(error) === 404) return history;
        throw error;
      }
      const rows = parse(Page, raw, path);
      if (!rows.length) break;
      const hydrated = new Array<TransactionInfo>(rows.length);
      let next = 0;
      const hydrate = async () => {
        try {
          while (next < rows.length) {
            signal.throwIfAborted();
            const index = next++;
            const row = rows[index]!;
            const txPath = `txs/${row.tx_hash}`;
            const metadata = parse(Metadata, await read(txPath), txPath);
            if (metadata.hash !== row.tx_hash) throw new BlockfrostResponseError(txPath, new Error("Transaction hash mismatch."));
            const ioPath = `${txPath}/utxos`;
            const io = parse(Io, await read(ioPath), ioPath);
            // Match Mesh's raw Blockfrost I/O representation. The activity query normalizes it.
            hydrated[index] = {
              hash: metadata.hash, block: metadata.block, slot: String(metadata.slot), index: metadata.index,
              fees: metadata.fees, deposit: metadata.deposit, size: metadata.size,
              invalidBefore: metadata.invalid_before ?? "", invalidAfter: metadata.invalid_hereafter ?? "",
              inputs: io.inputs as unknown as TransactionInfo["inputs"],
              outputs: io.outputs as unknown as TransactionInfo["outputs"],
              blockHeight: row.block_height, blockTime: row.block_time
            };
          }
        } catch (error) {
          failure.abort(error);
          throw error;
        }
      };
      await Promise.all(Array.from({ length: Math.min(HISTORY_READ_CONCURRENCY, rows.length) }, hydrate));
      history.push(...hydrated);
      if (rows.length < HISTORY_PAGE_SIZE) break;
    }
    signal.throwIfAborted();
    return history;
  } catch (error) {
    failure.abort(error);
    throw error;
  }
}
