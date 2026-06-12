"use client";
import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  PlugZap
} from "lucide-react";

import {
  AnimatedContent
} from "@/components/react-bits/primitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceOnboardingView() {
  const state = useWorkspaceActions();
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  const {
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
  } = state;

  return (
          <div className="flex min-h-0 flex-1 items-start justify-center pt-2 md:pt-6">
            <AnimatedContent className="w-full max-w-3xl" distance={24}>
              <Card className="user-surface w-full">
                <CardContent className="space-y-8 p-6 md:p-8">
                  <ol className="divide-y divide-border/40">
                    {[
                      {
                        n: "01",
                        title: "One wallet, many keys.",
                        body:
                          "Owners control the rules. Spenders pay within daily limits you set."
                      },
                      {
                        n: "02",
                        title: "Automation built in.",
                        body:
                          "Scheduled payments leave on time. Multi-signature when amounts cross your threshold."
                      },
                      {
                        n: "03",
                        title: "Recovery without backdoors.",
                        body:
                          "Recovery contacts can step in only after a wake-up timer expires. No support tickets, no third parties."
                      }
                    ].map((row, index) => (
                      <li
                        key={row.n}
                        className="list-stagger-item grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-5 py-5 first:pt-0 last:pb-0"
                        style={{ animationDelay: `${index * 110}ms` }}
                      >
                        <span
                          aria-hidden="true"
                          className="font-sans text-4xl font-semibold leading-none text-primary/70 tabular-nums tracking-[-0.04em] md:text-5xl"
                        >
                          {row.n}
                        </span>
                        <div className="space-y-1">
                          <p className="font-sans text-lg font-semibold leading-snug tracking-[-0.02em] text-foreground md:text-xl">
                            {row.title}
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {row.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-6">
                    <Button
                      type="button"
                      onClick={() => {
                        setWalletConnectionDialogOpen(true);
                        void refreshDetectedTokens();
                        void refreshPermissionWalletSummaries();
                      }}
                    >
                      <PlugZap className="h-4 w-4" aria-hidden="true" />
                      Connect Cardano wallet
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Use any Cardano signer on Preprod: Lace, Eternl, Nami, Vespr, and others.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
  );
}
