"use client";
import { useTranslations } from "next-intl";

import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const canSignIn = Boolean(activeAddress) && !isDemoWallet;
  // Every reason this page is not showing a list, in one slot with one chrome. They used to
  // render as two unrelated shapes, a bordered callout and a bare amber line, although they
  // answer the same question: what has to happen before this button works?
  //
  // The third reason is not a blocker at all: the button works, and pressing it is the fix.
  // It is here because the alternative was the bare gate, which reads as "you were signed
  // out" and says nothing about the wallet the user just switched to.
  const blocker = !activeAddress
    ? i18n("noWalletIsConnectedYetUseThe")
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
              reader jumping by heading found nothing to say what this page is. */}
          <CardTitle as="h1">{i18n("signInToSeeApprovalRequests")}</CardTitle>
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
        </CardContent>
      </Card>
    </div>
  );
}
