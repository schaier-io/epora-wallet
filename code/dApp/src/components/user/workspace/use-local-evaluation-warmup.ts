import { useEffect, useRef } from "react";
import type { UserFlowStep } from "@/components/user/flow-types";
import { retainLocalEvaluationWorker, warmLocalEvaluationWorker } from "@/lib/mesh/transactions/internals/local-evaluation-worker";

export function useLocalEvaluationWarmup({ walletReady, selectedWalletUnit, isRouteStateCurrent,
  flowStep = "configure", session, editorActive = flowStep !== "overview", creatingWallet = false }: {
  walletReady: boolean;
  selectedWalletUnit: string;
  isRouteStateCurrent: boolean;
  flowStep?: UserFlowStep;
  session?: object;
  editorActive?: boolean;
  creatingWallet?: boolean;
}) {
  const reviewing = flowStep === "review";
  const previouslyReviewing = useRef(reviewing);
  const ready = walletReady && Boolean(selectedWalletUnit || creatingWallet) && isRouteStateCurrent && editorActive;
  useEffect(() => {
    if (!ready) return;
    let stop: (() => void) | undefined;
    const update = () => {
      if (document.hidden) {
        stop?.();
        stop = undefined;
      } else if (!stop) {
        const controller = new AbortController();
        const release = retainLocalEvaluationWorker();
        stop = () => { controller.abort(); release(); };
        void warmLocalEvaluationWorker(controller.signal).catch(() => undefined);
      }
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      stop?.();
    };
  }, [ready, selectedWalletUnit, creatingWallet, session]);

  useEffect(() => {
    const enteredReview = reviewing && !previouslyReviewing.current;
    previouslyReviewing.current = reviewing;
    if (!enteredReview || !ready || document.hidden) return;
    const controller = new AbortController();
    const abortWhenHidden = () => { if (document.hidden) controller.abort(); };
    document.addEventListener("visibilitychange", abortWhenHidden);
    void warmLocalEvaluationWorker(controller.signal).catch(() => undefined);
    return () => {
      document.removeEventListener("visibilitychange", abortWhenHidden);
      controller.abort();
    };
  }, [reviewing, ready, selectedWalletUnit, session]);
}
