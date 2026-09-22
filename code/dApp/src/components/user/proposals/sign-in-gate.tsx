"use client";
import { useEffect, useRef, useState } from "react";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import { useTranslations } from "next-intl";

import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageHeadingClass } from "@/components/ui/page-heading";
import { useWalletContext } from "@/providers/wallet-provider";
import { truncateMiddle } from "./format";
import type { ProposalSessionController } from "./use-proposal-session";

/**
 * Wallet sign-in gate for approval requests. There is no password and no account: the
 * wallet signs a server nonce (CIP-30 `signData`) and that signature is the login.
 */
export function SignInGate({ session }: { session: ProposalSessionController }) {
  const i18n = useTranslations("ComponentsUserProposalsSignInGate");
  const { activeAddress, activePaymentKeyHash, isDemoWallet } = useWalletContext();
  const [connectOpen, setConnectOpen] = useState(false);
  const canSignIn = Boolean(activeAddress) && !isDemoWallet;

  // Connecting and signing in were two presses with a modal between them, and the second
  // one is the only one that does anything here: registering as a signer IS the sign-in,
  // and the cookie it mints then lasts a week. So the press that opens the chooser also
  // arms the sign-in, and the wallet popup follows the connection without a second trip
  // to this card.
  //
  // A ref, not state: this is a latch the effect reads and clears, and clearing it through
  // setState inside the effect would be a cascading render. It also holds while the chooser
  // is open, so cancelling the connect simply never fires it.
  const signInWhenConnected = useRef(false);

  useEffect(() => {
    if (!signInWhenConnected.current) return;
    // Not armed again until the next press: a failed sign-in must leave the button as the
    // way to retry rather than re-opening the wallet popup on every render.
    if (!canSignIn || session.session || session.signingIn) return;
    signInWhenConnected.current = false;
    void session.signIn();
  }, [canSignIn, session]);
  // Every reason this page is not showing a list, in one slot with one chrome. They used to
  // render as two unrelated shapes, a bordered callout and a bare amber line, although they
  // answer the same question: what has to happen before this button works?
  //
  // The second reason is not a blocker at all: the button works, and pressing it is the fix.
  // It is here because the alternative was the bare gate, which reads as "you were signed
  // out" and says nothing about the wallet the user just switched to.
  //
  // No line while no wallet is connected: the heading, its description and the "Connect
  // wallet and sign in" button already say what has to happen, three times over.
  const blocker = !activeAddress
    ? null
    : isDemoWallet
      ? i18n("theDemoWalletCanLookButIt")
      : session.connectedWalletMismatch
        ? i18n("youSignedInAsSignedInKeyAnd", {
            signedInKey: truncateMiddle(session.session?.paymentKeyHash ?? "", 10, 6),
            connectedKey: truncateMiddle(activePaymentKeyHash ?? "", 10, 6)
          })
        : null;

  return (
    <div className="mx-auto flex max-w-xl flex-1 items-center justify-center py-10">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          {/* The gate replaces the whole page while nobody is signed in, and the `h1` it
              stands in for lives in the signed-in view. Left at the default `h3` the route
              had no page heading at all in the state most first visits land in, so a screen
              reader jumping by heading found nothing to say what this page is.

              `pageHeadingClass` for the same reason `/payee` carries it on its own
              `CardTitle as="h1"`: a card title standing in for the page heading should
              read at the page rung. Without it this route rendered its `h1` at 18px/500
              while the signed-in view of the same route renders one at 24px/600. */}
          <CardTitle as="h1" className={pageHeadingClass}>
            {i18n("signInToSeeApprovalRequests")}
          </CardTitle>
          <CardDescription>
            {i18n("yourWalletIsYourLoginHereItAsks")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {blocker ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{blocker}</span>
            </div>
          ) : null}

          {/*
            `role="alert"` because this text only ever appears after the user pressed the
            button and waited. Without it the wallet popup closes, the page looks unchanged,
            and a screen reader is told nothing at all.
          */}
          {session.error ? (
            <p role="alert" className="text-sm text-rose-300">
              {session.error}
            </p>
          ) : null}

          {!canSignIn ? (
            <Button
              className="w-full"
              onClick={() => {
                signInWhenConnected.current = true;
                setConnectOpen(true);
              }}
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              {i18n("connectWalletAndSignIn")}
            </Button>
          ) : (
          <Button
            type="button"
            className="w-full"
            disabled={!canSignIn || session.signingIn}
            aria-busy={session.signingIn}
            onClick={() => void session.signIn()}
          >
            {session.signingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {session.signingIn ? i18n("waitingForWallet") : i18n("signInWithWallet")}
          </Button>
          )}
          <WalletConnectionDialog open={connectOpen} onOpenChange={setConnectOpen} />
        </CardContent>
      </Card>
    </div>
  );
}
