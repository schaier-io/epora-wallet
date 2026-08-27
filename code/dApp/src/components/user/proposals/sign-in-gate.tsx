"use client";
import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWalletContext } from "@/providers/wallet-provider";
import type { ProposalSessionController } from "./use-proposal-session";

/**
 * Wallet sign-in gate for approval requests. There is no password and no account: the
 * wallet signs a server nonce (CIP-30 `signData`) and that signature is the login.
 */
export function SignInGate({ session }: { session: ProposalSessionController }) {
  const { activeAddress, isDemoWallet } = useWalletContext();
  const canSignIn = Boolean(activeAddress) && !isDemoWallet;
  // Both reasons the button is off, in one slot with one chrome. They used to render as two
  // unrelated shapes, a bordered callout and a bare amber line, although they answer the same
  // question: what has to happen before this button works?
  const blocker = !activeAddress
    ? "No wallet is connected yet. Use the Connect button at the top of this page, then sign in here."
    : isDemoWallet
      ? "The demo wallet can look, but it cannot sign. Connect your own wallet to sign in."
      : null;

  return (
    <div className="mx-auto flex max-w-xl flex-1 items-center justify-center py-10">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle>Sign in to see approval requests</CardTitle>
          <CardDescription>
            Your wallet is your login here. It asks you to sign a short message, so we can
            check the key is yours. Nothing is spent and your key stays in your wallet.
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
            {session.signingIn ? "Waiting for wallet…" : "Sign in with wallet"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
