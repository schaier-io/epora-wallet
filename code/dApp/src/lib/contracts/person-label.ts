import { shortenIdentifier } from "@/lib/utils/explorer";

/**
 * Heading for one person in the access-control editors.
 *
 * The editors used to print the row's position (`Owner {index + 1}`), which
 * renumbers everyone below whenever someone is removed — so "Owner 2" pointed
 * at a different person after every edit. Two stable identifiers already exist
 * and neither was being used:
 *
 * - the first wallet ID the person was added with, which is the thing the owner
 *   actually verified, and
 * - `id`, which serialises to the on-chain `User.id` / `Beneficiary.id`.
 *   `nextGeneratedId` (`state-form.ts`) is max + 1, so ids are never reused.
 *
 * The wallet ID wins because a hash the reader can compare beats a bare number.
 * `id` is the fallback for a person who has been added but has no wallet ID yet.
 */
export function personLabel(
  role: string,
  entry: { id: string; wallets: string[] }
): string {
  const firstWallet = entry.wallets.find((wallet) => wallet.trim().length > 0);

  if (!firstWallet) {
    return `${role} #${entry.id}`;
  }

  return `${role} · ${shortenIdentifier(firstWallet.trim(), 8, 6)}`;
}
