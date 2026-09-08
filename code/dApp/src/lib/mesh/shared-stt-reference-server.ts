import "server-only";
import { resolveScriptHash } from "@meshsdk/core";
import { getSttMintPolicyId, getSttSpendScript } from "@/lib/contracts/blueprint";
import { getServerEnv } from "@/lib/env/server-env";
import { SHARED_HELPER_UNAVAILABLE_CODE } from "@/lib/http/errors";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import type { SharedSttReferenceStoreInfo } from "@/lib/mesh/detection";
import { discoverSharedSttReference } from "./shared-stt-reference-discovery";
import { inspectSharedSttReferenceStore } from "./transactions/internals/reference-scripts";

const READY_CACHE_MS = 60_000;
const RETRY_CACHE_MS = 5_000;
const DISCOVERY_TIMEOUT_MS = 15_000;
let cached: Promise<SharedSttReferenceStoreInfo> | undefined;
let expiresAt = 0;

async function inspect(): Promise<SharedSttReferenceStoreInfo> {
  const configuredReference = getServerEnv().SHARED_STT_REFERENCE ?? "";
  const script = getSttSpendScript();
  const fetcher = getBlockfrostProvider();
  const inspection = configuredReference
    ? await inspectSharedSttReferenceStore(fetcher, {
      script, configuredReference, stage: "server:shared-stt-reference"
    })
    : await discoverSharedSttReference(fetcher, script);
  const matchingReferences = inspection.matchingReferences.map(({ reference }) => reference);
  return {
    policyId: getSttMintPolicyId(),
    sttScriptHash: resolveScriptHash(script.code, script.version),
    storeAddress: inspection.storeAddress,
    status: matchingReferences.length ? "ready" : "missing",
    activeReference: matchingReferences[0] ?? null,
    matchingReferences,
    matchingCount: matchingReferences.length,
    checkedReferenceCount: inspection.checkedReferenceCount
  };
}

async function inspectWithTimeout(): Promise<SharedSttReferenceStoreInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      inspect(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Shared STT reference discovery timed out.")), DISCOVERY_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Shares discovery across callers. Builders still verify the returned output before use. */
export function resolveSharedSttReferenceServer(): Promise<SharedSttReferenceStoreInfo> {
  if (!cached || Date.now() >= expiresAt) {
    expiresAt = Infinity;
    cached = inspectWithTimeout().then(
      (result) => {
        expiresAt = Date.now() + (result.status === "ready" ? READY_CACHE_MS : RETRY_CACHE_MS);
        return result;
      },
      (error: unknown) => {
        expiresAt = Date.now() + RETRY_CACHE_MS;
        throw error;
      }
    );
  }
  return cached;
}

export async function requireSharedSttReferenceServer(): Promise<string> {
  try {
    const result = await resolveSharedSttReferenceServer();
    if (!result.activeReference) throw new Error(SHARED_HELPER_UNAVAILABLE_CODE);
    return result.activeReference;
  } catch (cause) {
    throw new Error(SHARED_HELPER_UNAVAILABLE_CODE, { cause });
  }
}
