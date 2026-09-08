import { atom } from "jotai";
import { RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT } from "../constants";
import { uniqueTransactionHashes } from "../helpers/transactions";
import { submitHashAtom } from "../atoms/transaction-flow.atoms";
import { lockedContractUtxosAtom } from "./locked-utxos.atoms";
import { selectedDetectedTokenAtom } from "./token-identity.atoms";

export const activityAnchorTxHashesAtom = atom((get) =>
  uniqueTransactionHashes([
    get(selectedDetectedTokenAtom)?.utxo.input.txHash,
    get(submitHashAtom),
    ...get(lockedContractUtxosAtom).map((utxo) => utxo.input.txHash)
  ]).slice(0, RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT)
);
