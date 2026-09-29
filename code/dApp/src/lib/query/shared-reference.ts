import { queryOptions } from "@tanstack/react-query";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { detectSharedSttReferenceStore } from "@/lib/mesh/detection";
import { queryKeys, queryPolicy } from "./keys";

export function sharedReferenceQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.sharedReference(getSttMintPolicyId()),
    queryFn: ({ signal }) => detectSharedSttReferenceStore(signal),
    staleTime: queryPolicy.helperStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}
