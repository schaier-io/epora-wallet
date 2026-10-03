import { useEffect, useRef } from "react";
import type { UserFlowStep } from "@/components/user/flow-types";
import { warmLocalEvaluationWorker } from "@/lib/mesh/transactions/internals/local-evaluation-worker";

export function useLocalEvaluationWarmup({ walletReady, selectedWalletUnit, isRouteStateCurrent, flowStep = "configure", session }: {
  walletReady: boolean;
  selectedWalletUnit: string;
  isRouteStateCurrent: boolean;
  flowStep?: UserFlowStep;
  session?: object;
}) {
  const reviewing = flowStep === "review";
  const previouslyReviewing = useRef(reviewing);
  useEffect(() => {
    if (!walletReady || !selectedWalletUnit || !isRouteStateCurrent) return;
    const controller = new AbortController();
    void warmLocalEvaluationWorker(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [walletReady, selectedWalletUnit, isRouteStateCurrent, session]);

  useEffect(() => {
    const enteredReview = reviewing && !previouslyReviewing.current;
    previouslyReviewing.current = reviewing;
    if (!enteredReview || !walletReady || !selectedWalletUnit || !isRouteStateCurrent) return;
    const controller = new AbortController();
    void warmLocalEvaluationWorker(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [reviewing, walletReady, selectedWalletUnit, isRouteStateCurrent, session]);
}
