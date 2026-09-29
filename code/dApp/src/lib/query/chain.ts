import { queryOptions } from "@tanstack/react-query";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { queryKeys, queryPolicy } from "./keys";

export const addressUtxosQueryOptions = (address: string) => queryOptions({
  queryKey: queryKeys.addressUtxos(address),
  queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchAddressUTxOs(address)
});
// A transaction the indexer has returned does not change. Misses are errors, which
// hold no data, so an unindexed hash is still fetched again on the next read.
export const txInfoQueryOptions = (hash: string) => queryOptions({
  queryKey: queryKeys.txInfo(hash),
  staleTime: Infinity,
  queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchTxInfo(hash)
});
export const accountInfoQueryOptions = (address: string) => queryOptions({
  queryKey: queryKeys.accountInfo(address),
  queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchAccountInfo(address)
});
export const protocolParametersQueryOptions = (epoch?: number) => queryOptions({
  queryKey: queryKeys.protocolParameters(epoch),
  staleTime: queryPolicy.protocolStaleMs,
  queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchProtocolParameters(epoch)
});
export const assetMetadataQueryOptions = (unit: string) => queryOptions({
  queryKey: queryKeys.assetMetadata(unit),
  staleTime: queryPolicy.metadataStaleMs,
  gcTime: queryPolicy.metadataGcMs,
  queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchAssetMetadata(unit)
});
