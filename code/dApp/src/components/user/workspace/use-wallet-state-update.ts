"use client";

import { useEffect } from "react";
import { useAtomValue, useStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { assertExactInputUnspent } from "@/lib/mesh/transactions/internals/utxo";
import { txInfoQueryOptions } from "@/lib/query/chain";
import { sttWalletQueryOptions } from "@/lib/query/stt-inventory";
import { invalidateChainQueries } from "@/lib/query/invalidation";
import { STT_STATE_REFRESH_POLL_MS } from "./constants";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import {
  completeWalletStateUpdateAtom, pendingWalletStateUpdatesAtom,
  type PendingWalletStateUpdate, walletStateChecksAtom, walletStateRetryAtom
} from "./atoms/wallet-state-update.atoms";

// #433: a changed reference is not evidence that the output is spendable.
export async function readUsableWalletReplacement(
  client: QueryClient, pending: PendingWalletStateUpdate, signal: AbortSignal
) {
  const fetcher = new ServerFetcher({ signal });
  // The confirmation watcher and activity read the same entry, so one hit serves all.
  // The query owns its request signal. An abort here only stops this reader; the
  // shared read finishes and fills the cache for the other readers.
  const readTxInfo = (hash: string) => client.fetchQuery({ ...txInfoQueryOptions(hash), retry: false });
  try {
    await readTxInfo(pending.submittedTxHash);
  } catch (error) {
    const original = await fetcher.get(`txs/${pending.spentRef.txHash}/utxos`) as {
      outputs?: { output_index?: number; consumed_by_tx?: unknown }[]
    } | null;
    const spentBy = Array.isArray(original?.outputs)
      ? original.outputs.find(output => output.output_index === pending.spentRef.outputIndex)?.consumed_by_tx
      : undefined;
    if (typeof spentBy === "string" && /^[0-9a-f]{64}$/i.test(spentBy)) {
      // Another transaction may win the race. Follow the confirmed spender instead
      // of waiting forever for our rejected candidate to appear.
      await readTxInfo(spentBy);
    } else {
      // Only chain progress plus a verified original input can release a submission
      // whose acceptance is unknown. A browser clock or timeout is insufficient.
      const submittedTxMissing = typeof error === "object" && error !== null && "status" in error && error.status === 404;
      if (pending.invalidHereafter === undefined) {
        if (submittedTxMissing) return null;
        throw error;
      }
      const tip = await fetcher.get("blocks/latest") as { slot?: unknown } | null;
      if (typeof tip?.slot !== "number" || !Number.isSafeInteger(tip.slot)) throw error;
      if (tip.slot < pending.invalidHereafter) {
        if (submittedTxMissing) return null;
        throw error;
      }
      await assertExactInputUnspent(fetcher, pending.spentRef, "STT input", true);
      signal.throwIfAborted();
      return { replacementRef: pending.spentRef, expired: true };
    }
  }
  signal.throwIfAborted();
  const options = sttWalletQueryOptions(pending.walletUnit.slice(0, 56), pending.walletUnit, client, true);
  await client.cancelQueries({ queryKey: options.queryKey, exact: true });
  const detected = await client.fetchQuery({ ...options, staleTime: 0, retry: false });
  signal.throwIfAborted();
  const candidates = detected.tokens.filter(token => token.unit === pending.walletUnit);
  if (candidates.length !== 1) return null;
  const replacement = candidates[0]!.utxo.input;
  if (replacement.txHash.toLowerCase() === pending.spentRef.txHash.toLowerCase() &&
    replacement.outputIndex === pending.spentRef.outputIndex) return null;
  await assertExactInputUnspent(fetcher, replacement, "STT input", true);
  signal.throwIfAborted();
  return { replacementRef: replacement, expired: false };
}

/** The persisted record owns the wait. Navigation only stops this reader. */
export function useWalletStateUpdate(walletUnit?: string): void {
  const store = useStore();
  const client = useAtomValue(queryClientAtom);
  const selectedUnit = useAtomValue(routeStateAtom).selectedWalletUnit;
  const updates = useAtomValue(pendingWalletStateUpdatesAtom);
  const unit = walletUnit ?? selectedUnit;
  const retry = useAtomValue(walletStateRetryAtom);
  useEffect(() => {
    const pendingUpdates = unit === null ? Object.values(updates) : updates[unit] ? [updates[unit]] : [];
    const abort = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const poll = async (pending: PendingWalletStateUpdate) => {
      let phase: "waiting" | "unavailable" = "waiting";
      try {
        const result = await readUsableWalletReplacement(client, pending, abort.signal);
        if (result && store.set(completeWalletStateUpdateAtom, { pending, ...result })) {
          void invalidateChainQueries(client).catch(error => console.error("[wallet-state:refresh]", error));
          return;
        }
      } catch {
        // Only a completed State check can report normal waiting. Other failures
        // include missing exact inputs and do not attest a successful chain check.
        phase = "unavailable";
      }
      if (abort.signal.aborted) return;
      store.set(walletStateChecksAtom, current => ({ ...current, [pending.walletUnit]: {
        txHash: pending.submittedTxHash, checkedAt: Date.now(), phase,
        lastSuccessfulAt: phase === "waiting" ? Date.now() : current[pending.walletUnit]?.txHash === pending.submittedTxHash ? current[pending.walletUnit]!.lastSuccessfulAt : null
      } }));
      const timer = setTimeout(() => {
        timers.delete(timer);
        void poll(pending);
      }, STT_STATE_REFRESH_POLL_MS);
      timers.add(timer);
    };
    pendingUpdates.forEach(pending => void poll(pending));
    return () => { abort.abort(); timers.forEach(clearTimeout); };
  }, [client, updates, unit, retry, store]);
}
