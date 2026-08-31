// The link a signer is sent when a request needs them.
//
// The request already had a URL: `proposals-workspace.tsx` puts `?proposal=<id>` in the
// address bar so a request can be opened, bookmarked and reloaded. What the tree had no way
// to do was hand that URL to anyone: no copy control, no share, nothing. This builds the
// absolute form, with the wallet carried alongside the id so the recipient lands on the right
// wallet instead of whichever one the app would auto-pick for them.

export const PROPOSALS_PATH = "/user/proposals";

export function buildProposalShareUrl(
  origin: string,
  walletUnit: string,
  proposalId: string
): string {
  const params = new URLSearchParams();
  if (walletUnit) {
    params.set("wallet", walletUnit);
  }
  params.set("proposal", proposalId);
  return `${origin.replace(/\/+$/, "")}${PROPOSALS_PATH}?${params.toString()}`;
}
