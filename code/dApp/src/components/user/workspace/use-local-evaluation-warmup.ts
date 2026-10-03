import { useEffect } from "react";
import { warmLocalEvaluationWorker } from "@/lib/mesh/transactions/internals/local-evaluation-worker";

export function useLocalEvaluationWarmup({ walletReady, selectedWalletUnit, isRouteStateCurrent }: {
  walletReady: boolean;
  selectedWalletUnit: string;
  isRouteStateCurrent: boolean;
}) {
  useEffect(() => {
    if (!walletReady || !selectedWalletUnit || !isRouteStateCurrent) return;
    const controller = new AbortController();
    void warmLocalEvaluationWorker(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [walletReady, selectedWalletUnit, isRouteStateCurrent]);
}
