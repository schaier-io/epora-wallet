import { parseRetryAfterMs } from "@/lib/http/retry-after";
export { parseRetryAfterMs } from "@/lib/http/retry-after";
import type {
  Action,
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  Protocol,
  TransactionInfo,
  UTxO
} from "@meshsdk/common";
import type { ChainMethod, ChainRpcRequest } from "@/lib/types/contracts";
import { getErrorMessage } from "@/lib/http/errors";

type RpcEnvelope = {
  result?: unknown;
  error?: unknown;
  details?: unknown;
};

export class MeshRpcError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = "MeshRpcError";
  }
}

function isRpcEnvelope(value: unknown): value is RpcEnvelope {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rpc<T>(method: ChainMethod, args: unknown[], signal?: AbortSignal): Promise<T> {
  const payload: ChainRpcRequest = { method, args };

  const response = await fetch("/api/mesh", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  // Preserve the HTTP status when a gateway returns a non-JSON error page.
  const raw: unknown = await response.json().catch(() => {
    signal?.throwIfAborted();
    return undefined;
  });
  const retryDelay = parseRetryAfterMs(response.headers.get("Retry-After"));

  if (!isRpcEnvelope(raw)) {
    throw new MeshRpcError(
      response.ok
        ? `Mesh RPC call returned malformed payload for ${method}`
        : `Mesh RPC call failed for ${method} (HTTP ${response.status})`,
      response.status,
      retryDelay
    );
  }

  if (!response.ok || typeof raw.error !== "undefined") {
    const message = getErrorMessage(raw.error, `Mesh RPC call failed for ${method}`);
    const details =
      typeof raw.details === "undefined" ? undefined : JSON.stringify(raw.details, null, 2);
    throw new MeshRpcError(details ? `${message}\n${details}` : message, response.status, retryDelay);
  }

  if (typeof raw.result === "undefined") {
    throw new MeshRpcError(`Mesh RPC call returned no result for ${method}`, response.status);
  }

  return raw.result as T;
}

export class ServerFetcher implements IFetcher, IEvaluator {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  private rpc<T>(method: ChainMethod, args: unknown[]): Promise<T> {
    return rpc(method, args, this.options.signal);
  }

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    return this.rpc("fetchAccountInfo", [address]);
  }

  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    return this.rpc("fetchAddressUTxOs", [address, asset]);
  }

  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions | undefined
  ): Promise<TransactionInfo[]> {
    return this.rpc("fetchAddressTxs", [address, options]);
  }

  fetchAssetAddresses(asset: string): Promise<{ address: string; quantity: string }[]> {
    return this.rpc("fetchAssetAddresses", [asset]);
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    return this.rpc("fetchAssetMetadata", [asset]);
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    return this.rpc("fetchBlockInfo", [hash]);
  }

  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string | undefined
  ): Promise<{ assets: Asset[]; next?: string | number | null | undefined }> {
    return this.rpc("fetchCollectionAssets", [policyId, cursor]);
  }

  fetchProtocolParameters(epoch?: number): Promise<Protocol> {
    return this.rpc("fetchProtocolParameters", [epoch]);
  }

  fetchCostModels(epoch?: number): Promise<number[][]> {
    return this.rpc("fetchCostModels", [epoch]);
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    return this.rpc("fetchTxInfo", [hash]);
  }

  fetchUTxOs(hash: string, index?: number | undefined): Promise<UTxO[]> {
    return this.rpc("fetchUTxOs", [hash, index]);
  }

  fetchGovernanceProposal(
    txHash: string,
    certIndex: number
  ): Promise<GovernanceProposalInfo> {
    return this.rpc("fetchGovernanceProposal", [txHash, certIndex]);
  }

  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[]
  ): Promise<Omit<Action, "data">[]> {
    return this.rpc("evaluateTx", [tx, additionalUtxos, additionalTxs]);
  }

  get(url: string): Promise<unknown> {
    return this.rpc("get", [url]);
  }

  submitTx(tx: string): Promise<string> {
    return this.rpc("submitTx", [tx]);
  }
}
