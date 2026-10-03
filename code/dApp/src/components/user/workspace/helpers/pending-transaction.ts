import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime, type UTxO } from "@meshsdk/core";
import { type TransactionInfo } from "@meshsdk/common";
import { deserializeTx, type CstTransactionInput, type CstTransactionOutput } from "@/lib/mesh/cst";
import { NETWORK } from "@/lib/mesh/transactions/internals/constants";

const refKey = (txHash: string, outputIndex: number) => `${txHash.toLowerCase()}#${outputIndex}`;

export type DecodedPendingTransaction = {
  transaction: TransactionInfo;
  /** The body's `invalid_hereafter` as wall time. After it the ledger cannot accept the tx. */
  validUntilMs: number | null;
};

// `.outputs()` is a plain array; `.inputs()` is a CborSet. Same runtime normalization
// as the proposals decoder (`lib/proposals/verify.ts`).
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const candidate = value as { values?: () => T[] };
  return typeof candidate.values === "function" ? candidate.values() : [];
}

/**
 * A submitted transaction as the activity feed would read it once confirmed, built from
 * the CBOR the wallet signed. The indexer returns 404 for a hash until a block holds it,
 * so this is the only source for the row in the meantime.
 *
 * Outputs come from the body. A body names its inputs by reference only, so each input is
 * resolved against the UTxOs the app already held when it built the transaction (the smart
 * wallet's funds, its STT, the signer's UTxOs). An input none of them knows is left out:
 * a guessed address or amount would put a false balance change on the row. Inputs at the
 * smart wallet are always known, because they were built from those same sets.
 */
export function decodePendingTransaction(
  txHash: string,
  txHex: string,
  knownUtxos: readonly UTxO[]
): DecodedPendingTransaction | null {
  try {
    const body = deserializeTx(txHex).body();
    const known = new Map(knownUtxos.map((utxo) => [refKey(utxo.input.txHash, utxo.input.outputIndex), utxo]));
    const inputs = toArray<CstTransactionInput>(body.inputs())
      .map((input) => known.get(refKey(input.transactionId().toString(), Number(input.index()))))
      .filter((utxo): utxo is UTxO => utxo !== undefined);
    const outputs = toArray<CstTransactionOutput>(body.outputs()).map((output, outputIndex): UTxO => {
      const value = output.amount();
      const assets = Array.from(value.multiasset()?.entries() ?? [], ([unit, quantity]) => ({
        unit: unit.toString(),
        quantity: quantity.toString()
      }));
      const plutusData = output.datum()?.asInlineData?.()?.toCbor();
      return {
        input: { txHash, outputIndex },
        output: {
          address: output.address().toBech32().toString(),
          amount: [{ unit: "lovelace", quantity: value.coin().toString() }, ...assets],
          ...(plutusData ? { plutusData } : {})
        }
      };
    });
    const ttl = body.ttl();
    return {
      transaction: {
        index: 0,
        block: "",
        hash: txHash,
        slot: "",
        fees: body.fee().toString(),
        size: txHex.length / 2,
        deposit: "0",
        invalidBefore: "",
        invalidAfter: ttl === undefined || ttl === null ? "" : String(ttl),
        inputs,
        outputs
      },
      validUntilMs: ttl === undefined || ttl === null
        ? null
        : slotToBeginUnixTime(Number(ttl), SLOT_CONFIG_NETWORK[NETWORK])
    };
  } catch {
    // A body the decoder cannot read (a Byron output address, a malformed hex) gets no
    // pending row. The confirmed row still arrives from the indexer.
    return null;
  }
}
