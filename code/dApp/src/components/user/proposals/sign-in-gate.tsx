"use client";
import { KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWalletContext } from "@/providers/wallet-provider";
import type { ProposalSessionController } from "./use-proposal-session";

// Wallet sign-in gate. Visibility into proposals requires proving control of a
// wallet via CIP-30 signData — there is no password and no account.
export function SignInGate({ session }: { session: ProposalSessionController }) {
  const { activeAddress, isDemoWallet } = useWalletContext();
  const canSignIn = Boolean(activeAddress) && !isDemoWallet;

  return (
    <div className="mx-auto flex max-w-xl flex-1 items-center justify-center py-10">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle>Sign in to multi-sig proposals</CardTitle>
          <CardDescription>
            Prove control of your wallet to view, verify and sign proposed transactions. You
            sign a one-time challenge — nothing leaves your wallet and no funds move.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!activeAddress ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Connect a browser wallet from the menu in the top-right, then sign in.</span>
            </div>
          ) : null}

          {isDemoWallet ? (
            <p className="text-sm text-amber-200">
              The demo wallet is read-only. Connect a real browser wallet to sign in.
            </p>
          ) : null}

          {session.error ? <p className="text-sm text-rose-300">{session.error}</p> : null}

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
