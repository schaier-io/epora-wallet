import type { FieldErrors } from "@/components/user/flow-types";

export function flattenFieldErrors(fieldErrors: FieldErrors) {
  return Object.entries(fieldErrors).flatMap(([key, messages]) =>
    messages.map((message) => ({ key, message }))
  );
}
