"use client";
import { useTranslations } from "next-intl";

import { useState, useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Mail, MessageSquare, QrCode, Share2, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ReceiveAddressQrCode } from "./primitives";
import { selectedDetectedTokenUnitAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import {
  buildInviteMailtoUrl,
  buildInviteSmsUrl,
  buildSignerInviteUrl
} from "@/components/user/proposals/share-link";
import { proposalSessionQueryOptions, walletSignersQueryOptions } from "@/lib/proposals/query";

// `window` and `navigator` do not exist while this renders on the server, and reading them
// during the first client render would make the markup disagree with the server's. Both come
// through useSyncExternalStore, which is what the toast provider already uses for the same
// problem: the server snapshot renders, then the client snapshot replaces it after hydration.
// Neither value ever changes for a given page, so there is nothing to subscribe to.
const emptySubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";
const getCanShare = () => typeof navigator.share === "function";
const getServerCanShare = () => false;

/**
 * The missing step after granting someone the co-signer chip: telling them.
 *
 * Granting the chip writes their key into State. It does not reach them, and there is no
 * outbound channel in this app -- no mail server, no push -- so the owner delivers the
 * invite themselves. Everything here builds a link or a draft and hands it to the owner's
 * own client; nothing is sent from the app, and no address of theirs is collected.
 *
 * Registering is only signing in once with the key the owner added, so the invite points at
 * the co-signing page for this wallet.
 */
export function SignerInvite({ walletHashes }: { walletHashes: string[] }) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsSignerInvite");
  const walletUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const session = useQuery(proposalSessionQueryOptions());
  const signers = useQuery(
    walletSignersQueryOptions(session.data?.paymentKeyHash ?? "", walletUnit)
  );

  // The origin is whatever host the owner is already trusting, never a configured one.
  const origin = useSyncExternalStore(emptySubscribe, getOrigin, getServerOrigin);
  const canShare = useSyncExternalStore(emptySubscribe, getCanShare, getServerCanShare);
  const [showQr, setShowQr] = useState(false);
  // Empty until BOTH are known. Without the origin there is no absolute link to give
  // anyone, and without the wallet the link names no wallet, which is worse than no
  // link: it lands the recipient on whichever wallet the app auto-picks for them.
  const inviteUrl = origin && walletUnit ? buildSignerInviteUrl(origin, walletUnit) : "";

  // Three states, and they are not the same question. Without a wallet id there is nobody
  // to invite yet. With one, the registration answer is either known or unavailable, and
  // "unavailable" is not "pending": the read needs a co-signing session the owner may not
  // have, so claiming they have not registered would be a guess.
  const registered = signers.data;
  const hasWalletId = walletHashes.length > 0;
  // Both sides are lowercased before they are compared. The indexer stores every key hash
  // lowercased (stt-cache/participants.ts `normalizeHash`), but the wallet-id field keeps
  // whatever the owner typed or pasted, so an uppercase hash made a co-signer who had
  // already registered read as pending for good.
  const ownedHashes = walletHashes.map((hash) => hash.trim().toLowerCase());
  const isRegistered = Boolean(
    registered?.some((hash) => ownedHashes.includes(hash.trim().toLowerCase()))
  );
  const statusKnown = Array.isArray(registered);

  // There is nothing to invite anyone to until the wallet exists on chain: `walletUnit` is
  // empty throughout the create-wallet flow, which would produce a link naming no wallet and
  // a status query that never runs. `inviteUrl` is empty in the server snapshot for the same
  // reason the origin is, so it gates the controls too rather than only the copy button.
  const canInvite = hasWalletId && Boolean(inviteUrl);

  const mailBody = i18n("mailBody", { link: inviteUrl });

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow text-muted-foreground">{i18n("inviteToCoSign")}</p>
        {!hasWalletId ? (
          <Badge variant="outline">{i18n("noWalletIdYet")}</Badge>
        ) : isRegistered ? (
          <Badge variant="secondary">
            <Check className="h-3 w-3" aria-hidden="true" /> {i18n("readyToCoSign")}
          </Badge>
        ) : statusKnown ? (
          <Badge variant="outline">
            <Clock className="h-3 w-3" aria-hidden="true" /> {i18n("hasNotSignedInYet")}
          </Badge>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {!hasWalletId
          ? i18n("askThisPersonForTheirWalletIdFirst")
          : !walletUnit
            ? i18n("youCanInviteThemOnceThisWalletExists")
            : isRegistered
              ? i18n("theySignedInAndCanCoSignRequests")
              : i18n("sendThemThisLinkTheySignInOnce")}
      </p>

      {canInvite ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {canShare ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // A rejected share is the user closing the sheet, which needs no report.
                  void navigator.share({ title: i18n("mailSubject"), url: inviteUrl }).catch(() => {});
                }}
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> {i18n("share")}
              </Button>
            ) : null}
            <CopyButton
              value={inviteUrl}
              label={i18n("copyLink")}
              copiedLabel={i18n("linkCopied")}
            />
            {/* Anchors, not buttons: a draft is a navigation the browser hands to the
                owner's mail or messages app, and only a real href lets them long-press,
                open in another app, or see where it goes before they commit. */}
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={buildInviteMailtoUrl(i18n("mailSubject"), mailBody)}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {i18n("email")}
            </a>
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={buildInviteSmsUrl(mailBody)}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {i18n("text")}
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showQr}
              onClick={() => setShowQr((open) => !open)}
            >
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
              {showQr ? i18n("hideQrCode") : i18n("showQrCode")}
            </Button>
          </div>

          {showQr ? (
            <div className="flex flex-col items-start gap-2">
              {/* The same local renderer the receive address uses. It encodes whatever
                  string it is given and never reaches a third-party QR service, which
                  matters as much for an invite link as for an address. */}
              <ReceiveAddressQrCode address={inviteUrl} />
              <p className="text-xs text-muted-foreground">{i18n("theyCanScanThisInsteadOfOpening")}</p>
            </div>
          ) : null}
        </>
      ) : !hasWalletId ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          {i18n("addTheirWalletIdBelowToInviteThem")}
        </p>
      ) : null}
    </div>
  );
}
