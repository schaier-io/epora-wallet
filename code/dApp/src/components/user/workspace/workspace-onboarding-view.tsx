"use client";
import { useTranslations } from "next-intl";

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

import { ProductFaqList } from "@/components/user/product-faq-list";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceOnboardingView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceOnboardingView");
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
                <CardContent className="space-y-6">
                  <ol className="divide-y divide-border/40">
                    {[
                      {
                        n: "01",
                        title: i18n("oneWalletManyKeys"),
                        body:
                          i18n("ownersControlTheRulesSpendersPayWithinDaily")
                      },
                      {
                        n: "02",
                        title: i18n("automationBuiltIn"),
                        body:
                          i18n("scheduledPaymentsLeaveOnTimeMultiSignatureWhen")
                      },
                      {
                        n: "03",
                        title: i18n("recoveryWithoutBackdoors"),
                        body:
                          i18n("recoveryContactsCanStepInOnlyAfterA")
                      }
                    ].map((row, index) => (
                      <li
                        key={row.n}
                        className="list-stagger-item grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4 py-4 first:pt-0 last:pb-0"
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
                  <div className="space-y-3 border-t border-border/60 pt-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        onClick={() => {
                          setWalletConnectionDialogOpen(true);
                          void refreshDetectedTokens();
                          void refreshPermissionWalletSummaries();
                        }}
                      >
                        <PlugZap className="h-4 w-4" aria-hidden="true" />
                        {i18n("connectCardanoWallet")}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {i18n("worksWithLaceEternlNamiVesprAndOther")}
                      </span>
                    </div>
                    {/* What connecting actually grants. The dialogs disclosed one sentence
                        between them, so the decision to hand a wallet to an unaudited beta was
                        made with no statement of what it permits. */}
                    <p className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                      {i18n("connectingLetsEporaReadYourAddressAndBalance")}
                    </p>
                  </div>

                  <ProductFaqList />
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
  );
}
