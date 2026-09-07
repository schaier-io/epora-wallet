import { extractErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceBeneficiaryStreamStopModel.json";
import { deriveBeneficiaryStreamStopStateDatum } from "@/lib/contracts/beneficiary-stream-stop";
import { parseNonNegativeIntegerString } from "@/lib/contracts/state-form-encode";
import { stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import { getValidityWindow } from "@/lib/mesh/transactions";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceBeneficiaryStreamStopModel", defaultMessages);

/** Advisory estimate only. The builder repeats this against the consumed State. */
export function deriveBeneficiaryStreamStopPreview(
  form: StateFormState,
  signer: string | null,
  streamId: string,
  nowMs: number
) {
  try {
    if (!signer) throw new Error(i18n("connect"));
    if (!streamId.trim()) throw new Error(i18n("select"));
    if (nowMs <= 0) throw new Error(i18n("clock"));
    const window = getValidityWindow(nowMs);
    const details = deriveBeneficiaryStreamStopStateDatum({
      stateDatum: stateFormToDatum(form),
      beneficiarySignerKeyHash: signer,
      streamingPaymentId: parseNonNegativeIntegerString(streamId, "Scheduled payment ID"),
      txEarliestTimeMs: window.earliestTimeMs,
      txLatestTimeMs: window.latestTimeMs
    });
    return { details, error: null };
  } catch (error) {
    return { details: null, error: extractErrorMessage(error, i18n("unavailable")) };
  }
}
