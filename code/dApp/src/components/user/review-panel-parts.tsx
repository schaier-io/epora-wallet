import { describeFieldErrorKey } from "@/components/user/field-error-keys";
import type { FieldErrors } from "@/components/user/flow-types";

// The one boundary where a field-error identity becomes text. `key` stays the identity, for
// React keys and for matching a readiness issue; `label` is what the reader is shown.
export function flattenFieldErrors(fieldErrors: FieldErrors) {
  return Object.entries(fieldErrors).flatMap(([key, messages]) =>
    messages.map((message) => ({ key, label: describeFieldErrorKey(key), message }))
  );
}
