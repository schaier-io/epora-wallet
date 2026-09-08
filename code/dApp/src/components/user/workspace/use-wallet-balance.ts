import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { signerUtxosKeyAtom, signerUtxosQueryAtom } from "./queries/signer-balance";

export type WalletBalanceController = { refreshWalletBalance: () => Promise<void> };

/** All consumers share one account-scoped SDK read. */
export function useWalletBalance(): WalletBalanceController {
  const client = useQueryClient();
  const queryKey = useAtomValue(signerUtxosKeyAtom);
  useAtomValue(signerUtxosQueryAtom);
  const refreshWalletBalance = useCallback(async () => {
    await client.invalidateQueries({ queryKey, exact: true });
  }, [client, queryKey]);
  return { refreshWalletBalance };
}
