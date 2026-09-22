// The link a signer is sent, and the drafts that carry it.
//
// The request already had a URL: `proposals-workspace.tsx` puts `?proposal=<id>` in the
// address bar so a request can be opened, bookmarked and reloaded. What the tree had no way
// to do was hand that URL to anyone: no copy control, no share, nothing. This builds the
// absolute form, with the wallet carried alongside the id so the recipient lands on the right
// wallet instead of whichever one the app would auto-pick for them.

export const PROPOSALS_PATH = "/user/proposals";

function buildUrl(origin: string, params: URLSearchParams): string {
  const query = params.toString();
  return `${origin.replace(/\/+$/, "")}${PROPOSALS_PATH}${query ? `?${query}` : ""}`;
}

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
  return buildUrl(origin, params);
}

/**
 * The link a co-signer is sent to register, before any request exists for them.
 *
 * Registration is nothing more than signing in once with the key the owner wrote into
 * State, and the sign-in gate is the proposals page. So the invite is the same page with
 * no proposal: the recipient lands on the right wallet, signs in, and is from then on a
 * signer the owner can see.
 */
export function buildSignerInviteUrl(origin: string, walletUnit: string): string {
  const params = new URLSearchParams();
  if (walletUnit) {
    params.set("wallet", walletUnit);
  }
  return buildUrl(origin, params);
}

/**
 * `application/x-www-form-urlencoded` is not URI encoding, and the difference matters
 * here: `URLSearchParams` writes a space as `+`, which a mail client shows literally in
 * the subject and body. `encodeURIComponent` writes `%20`, which every client decodes
 * back to a space. The separators stay raw so the client still sees real parameters.
 */
function draftQuery(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&");
}

/** A mail draft opened in the owner's own client. Nothing is sent from the app. */
export function buildInviteMailtoUrl(subject: string, body: string): string {
  const query = draftQuery({ subject, body });
  return `mailto:${query ? `?${query}` : ""}`;
}

/** A text-message draft opened in the owner's own client. Nothing is sent from the app. */
export function buildInviteSmsUrl(body: string): string {
  const query = draftQuery({ body });
  return `sms:${query ? `?${query}` : ""}`;
}
