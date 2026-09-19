import { slotToBeginUnixTime } from "@/lib/cardano-slot-time";
import type { CstCollection, CstTransactionInput } from "@/lib/mesh/cst";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { assertExactInputUnspent } from "./internals/utxo";

// Leave time for the wallet prompt and propagation before the exclusive upper bound.
export const PREPARED_TRANSACTION_SIGNING_MARGIN_MS = 30_000;

export async function assertPreparedTransactionFresh(txHex: string): Promise<void> {
  // Loaded on demand: this module sits on the /user first-load path through the
  // submit flow, and a static value import would put the Mesh serialisation
  // chunk there (see app/layout-mesh-boundary.test.ts).
  const { deserializeTx } = await import("@/lib/mesh/cst");
  const body = deserializeTx(txHex).body();
  const start = body.validityStartInterval();
  const end = body.ttl();
  const slotTime = (slot: bigint | number) => {
    const value = Number(slot);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Prepared transaction has an invalid validity interval. Rebuild it.");
    }
    return slotToBeginUnixTime(value);
  };
  const startsAt = start === undefined ? undefined : slotTime(start);
  const expiresAt = end === undefined ? undefined : slotTime(end);
  const assertValidity = () => {
    const now = Date.now();
    if (startsAt !== undefined && now < startsAt) {
      throw new Error("Prepared transaction is not valid yet. Rebuild it.");
    }
    if (expiresAt !== undefined && now + PREPARED_TRANSACTION_SIGNING_MARGIN_MS >= expiresAt) {
      throw new Error("Prepared transaction expires too soon. Rebuild it.");
    }
  };
  assertValidity();

  const inputs = [
    ...(body.inputs() as CstCollection<CstTransactionInput>).values(),
    ...(body.referenceInputs()?.values() ?? []),
    ...(body.collateral()?.values() ?? [])
  ];
  const fetcher = new ServerFetcher();
  // Deduplicate only within this check. Every later check requests fresh chain state.
  const requests = new Map<string, Promise<unknown>>();
  const currentFetcher = {
    get(path: string) {
      let request = requests.get(path);
      if (!request) {
        request = fetcher.get(path);
        requests.set(path, request);
      }
      return request;
    }
  };
  await Promise.all(inputs.map((input) => assertExactInputUnspent(currentFetcher, {
    txHash: input.transactionId().toString(),
    outputIndex: Number(input.index())
  }, "Prepared transaction input", true)));
  assertValidity();
}
