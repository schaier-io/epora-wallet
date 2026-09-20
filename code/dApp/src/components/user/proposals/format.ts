// Small presentation helpers shared across the proposals UI.

import type { UserActionKind } from "@/components/user/flow-types";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserProposalsFormat.json";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

const i18n = createDefaultTranslator("ComponentsUserProposalsFormat", defaultMessages);

export function lovelaceToAda(lovelace: string | null): string {
  // "Not known", not a dash. This renders as the fee on the one screen whose job is to let
  // somebody check a transaction before they sign it, and a dash there reads as "zero" at a
  // glance. The `₳` symbol is the app's own convention for an amount (`wallet-hero-card.tsx:180`,
  // `review-panel-sections.tsx:184`, `orphan-utxo-notice.tsx:52`).
  return lovelace == null ? i18n("notKnown") : `${formatLovelaceAsAda(lovelace)} ₳`;
}

export function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * The zone is not named here, deliberately. This renders `proposal.createdAt` in the
 * proposal list (`proposal-list.tsx:196`), where it sits next to the signature progress as
 * context for how old a request is. It is not a time anyone acts on: the times a reader
 * acts on are a schedule's start and stop, and those go through `formatTimestampLabel`.
 * `defaultFormatter` already pins the configured zone (`i18n/config.ts`), so this label
 * agrees with every other timestamp in the product. Adding a zone suffix to this one alone
 * would make the quietest timestamp on the screen the loudest.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : defaultFormatter.dateTime(date, "short");
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
