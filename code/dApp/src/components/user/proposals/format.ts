// Small presentation helpers shared across the proposals UI.

import type { UserActionKind } from "@/components/user/flow-types";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

export function lovelaceToAda(lovelace: string | null): string {
  return lovelace == null ? "—" : `${formatLovelaceAsAda(lovelace)} ₳`;
}

export function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// The user-facing name of an action, from the same catalog the workspace renders. Title
// -casing the kebab id is only the fallback: it turned `use` into "Use" and
// `manage-streaming-payments` into "Manage Streaming Payments", neither of which appears
// anywhere else in the product. The catalog calls them "Send funds" and "Scheduled
// payments". The fallback stays because `actionKind` arrives as a plain string from the
// database and may name an action this build no longer defines.
export function actionKindLabel(actionKind: string): string {
  const defined = USER_ACTION_DEFINITION_MAP[actionKind as UserActionKind];
  if (defined) {
    return defined.label;
  }
  return actionKind
    .split("-")
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}
