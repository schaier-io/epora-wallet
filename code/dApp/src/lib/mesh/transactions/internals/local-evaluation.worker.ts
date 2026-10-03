import type { IFetcher } from "@meshsdk/common";
import type { LocalEvaluationRequest } from "./local-evaluation-worker";

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LocalEvaluationRequest>) => void) | null;
  postMessage(value: unknown): void;
};

workerScope.onmessage = (event) => {
  void (async () => {
    try {
      const { txHex, utxos, additionalTxs, network, costModels } = event.data;
      if (!Array.isArray(costModels) || costModels.length !== 3 ||
        costModels.some(model => !Array.isArray(model) || model.length === 0 || model.some(cost => !Number.isSafeInteger(cost)))) {
        throw new Error("Local evaluation requires explicit live cost models.");
      }
      const { OfflineEvaluatorScalus } = await import("@meshsdk/core-cst");
      // The SDK only reads fetchUTxOs here. All required outputs arrive from the
      // build cache. A missing output must stop local evaluation without RPC.
      const fetcher = { fetchUTxOs: () => Promise.reject(new Error("Local evaluation is missing an input output.")) } as unknown as IFetcher;
      const evaluator = new OfflineEvaluatorScalus(fetcher, network, undefined, costModels);
      const actions = await evaluator.evaluateTx(txHex, utxos, additionalTxs);
      workerScope.postMessage({ ok: true, actions });
    } catch (error) {
      // Internal diagnostics trigger remote fallback. The UI does not display this message.
      const message = error instanceof Error ? error.message : "Local evaluation failed.";
      workerScope.postMessage({ ok: false, error: message });
    }
  })();
};
