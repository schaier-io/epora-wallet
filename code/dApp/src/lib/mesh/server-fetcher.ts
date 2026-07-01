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

function isRpcEnvelope(value: unknown): value is RpcEnvelope {
  return typeof value === "object" && value !== null;
}

async function rpc<T>(method: ChainMethod, args: unknown[]): Promise<T> {
  const payload: ChainRpcRequest = { method, args };

  const response = await fetch("/api/mesh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw: unknown = await response.json();

  if (!isRpcEnvelope(raw)) {
    throw new Error(`Mesh RPC call returned malformed payload for ${method}`);
  }

  if (!response.ok || typeof raw.error !== "undefined") {
    const message = getErrorMessage(raw.error, `Mesh RPC call failed for ${method}`);
    const details =
      typeof raw.details === "undefined" ? undefined : JSON.stringify(raw.details, null, 2);
    throw new Error(details ? `${message}\n${details}` : message);
  }

  if (typeof raw.result === "undefined") {
    throw new Error(`Mesh RPC call returned no result for ${method}`);
  }

  return raw.result as T;
}

export class ServerFetcher implements IFetcher, IEvaluator {
  fetchAccountInfo(address: string): Promise<AccountInfo> {
    return rpc("fetchAccountInfo", [address]);
  }

  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    return rpc("fetchAddressUTxOs", [address, asset]);
  }

  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions | undefined
  ): Promise<TransactionInfo[]> {
    return rpc("fetchAddressTxs", [address, options]);
  }

  fetchAssetAddresses(asset: string): Promise<{ address: string; quantity: string }[]> {
    return rpc("fetchAssetAddresses", [asset]);
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    return rpc("fetchAssetMetadata", [asset]);
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    return rpc("fetchBlockInfo", [hash]);
  }

  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string | undefined
  ): Promise<{ assets: Asset[]; next?: string | number | null | undefined }> {
    return rpc("fetchCollectionAssets", [policyId, cursor]);
  }

  fetchProtocolParameters(epoch?: number): Promise<Protocol> {
    return rpc("fetchProtocolParameters", [epoch]);
  }

  fetchCostModels(epoch?: number): Promise<number[][]> {
    return rpc("fetchCostModels", [epoch]);
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    return rpc("fetchTxInfo", [hash]);
  }

  fetchUTxOs(hash: string, index?: number | undefined): Promise<UTxO[]> {
    return rpc("fetchUTxOs", [hash, index]);
  }

  fetchGovernanceProposal(
    txHash: string,
    certIndex: number
  ): Promise<GovernanceProposalInfo> {
    return rpc("fetchGovernanceProposal", [txHash, certIndex]);
  }

  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[]
  ): Promise<Omit<Action, "data">[]> {
    return rpc("evaluateTx", [tx, additionalUtxos, additionalTxs]);
  }

  get(url: string): Promise<unknown> {
    return rpc("get", [url]);
  }

  submitTx(tx: string): Promise<string> {
    return rpc("submitTx", [tx]);
  }
}
