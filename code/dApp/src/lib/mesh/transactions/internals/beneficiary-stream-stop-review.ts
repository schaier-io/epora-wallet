import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import type { OnChainInteger } from "@/lib/contracts/on-chain-integer";

const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);

const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000n;

export function formatBeneficiaryStopTimestamp(value: OnChainInteger): string {
  const milliseconds = BigInt(value);
  if (milliseconds < -MAX_DATE_MILLISECONDS || milliseconds > MAX_DATE_MILLISECONDS) {
    return i18n("beneficiaryStreamStopRawTimestamp", { milliseconds: String(milliseconds) });
  }
  return new Date(Number(milliseconds)).toISOString().replace("T", " ").replace("Z", " UTC");
}
