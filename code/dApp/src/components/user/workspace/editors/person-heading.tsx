"use client";
import { AddressCopyButton } from "@/components/ui/address-copy-button";
import type { ReactNode } from "react";

/**
 * The heading row for one person in the access-control editors: the stable
 * person label plus a copy button for the wallet ID it truncates, so the
 * shortened hash never dead-ends a reader who needs the full value. The label
 * stays in the caller's JSX so each editor keeps its own wording.
 */
export function PersonHeading({
  person,
  children
}: {
  person: { id: string; wallets: string[] };
  children: ReactNode;
}) {
  const firstWallet = person.wallets.find((wallet) => wallet.trim().length > 0);

  return (
    <div className="flex items-center gap-1.5">
      <p className="font-medium text-foreground">{children}</p>
      <AddressCopyButton value={firstWallet} />
    </div>
  );
}
