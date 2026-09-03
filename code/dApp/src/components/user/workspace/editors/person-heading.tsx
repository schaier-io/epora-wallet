"use client";
import { AddressCopyButton } from "@/components/ui/address-copy-button";
import { personLabel } from "@/lib/contracts/person-label";

/**
 * The heading row for one person in the access-control editors: the stable
 * person label plus a copy button for the wallet ID it truncates, so the
 * shortened hash never dead-ends a reader who needs the full value.
 */
export function PersonHeading({
  role,
  person
}: {
  role: string;
  person: { id: string; wallets: string[] };
}) {
  const firstWallet = person.wallets.find((wallet) => wallet.trim().length > 0);

  return (
    <div className="flex items-center gap-1.5">
      <p className="font-medium text-foreground">{personLabel(role, person)}</p>
      <AddressCopyButton value={firstWallet} />
    </div>
  );
}
