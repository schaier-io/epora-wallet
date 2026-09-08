import { queryOptions } from "@tanstack/react-query";
import { countSttTokens } from "@/lib/mesh/detection";
import { queryKeys } from "./keys";

export const sttCountQueryOptions = (policyId: string, network: string) => queryOptions({
  queryKey: queryKeys.sttCount(policyId, network),
  queryFn: ({ signal }) => countSttTokens(policyId, signal)
});
