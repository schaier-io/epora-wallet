import { getSttSpendScript, resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { resolveScriptHash } from "@meshsdk/core";

function storageKey() {
  const script = getSttSpendScript();
  return `epora:stt-reference:${resolveSttReferenceStoreAddress()}:${resolveScriptHash(script.code, script.version)}`;
}

/** Cached locator only. Every build checks the referenced output and script. */
export function readSavedSttReference(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(storageKey()) || undefined;
  } catch {
    return undefined;
  }
}

export function saveSttReference(reference: string): void {
  if (!/^[0-9a-f]{64}#\d+$/i.test(reference)) {
    throw new Error("STT reference must use txHash#index.");
  }
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey(), reference);
}
