import { resolveScriptHash, type LanguageVersion } from "@meshsdk/core";
import { z } from "zod";
import { resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { SHARED_HELPER_UNAVAILABLE_CODE } from "@/lib/http/errors";
import type { TxFetcher } from "./tx-context";
import { inspectSharedSttReferenceStore } from "./transactions/internals/reference-scripts";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const AddressOutputsSchema = z.array(z.object({
  tx_hash: z.string().regex(/^[0-9a-f]{64}$/),
  output_index: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  reference_script_hash: z.string().regex(/^[0-9a-f]{56}$/).nullable()
})).max(PAGE_SIZE);

/** Read raw pages because the SDK address adapter converts provider errors into empty arrays. */
export async function discoverSharedSttReference(
  fetcher: TxFetcher,
  script: { code: string; version: LanguageVersion }
) {
  const storeAddress = resolveSttReferenceStoreAddress();
  const expectedHash = resolveScriptHash(script.code, script.version);
  const stage = "server:discover-shared-stt-reference";
  for (let page = 1; page <= MAX_PAGES; page++) {
    const outputs = AddressOutputsSchema.parse(await fetcher.get(
      `addresses/${storeAddress}/utxos?count=${PAGE_SIZE}&page=${page}&order=asc`
    ));
    for (const output of outputs) {
      if (output.reference_script_hash !== expectedHash) continue;
      // Metadata only selects a candidate. The exact read verifies bytes and liveness.
      return inspectSharedSttReferenceStore(fetcher, {
        script, configuredReference: `${output.tx_hash}#${output.output_index}`, stage
      });
    }
    if (outputs.length < PAGE_SIZE) {
      return inspectSharedSttReferenceStore(fetcher, { script, configuredReference: "", stage });
    }
  }
  // The capped scan cannot prove absence. Report unavailable rather than missing.
  throw new Error(SHARED_HELPER_UNAVAILABLE_CODE);
}
