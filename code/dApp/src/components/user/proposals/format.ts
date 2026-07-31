// Small presentation helpers shared across the proposals UI.

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

export function actionKindLabel(actionKind: string): string {
  return actionKind
    .split("-")
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}
