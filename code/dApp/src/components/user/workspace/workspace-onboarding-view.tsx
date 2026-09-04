"use client";
import { useTranslations } from "next-intl";

import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  PlugZap
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";

import { ProductFaqList } from "@/components/user/product-faq-list";

export function WorkspaceOnboardingView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceOnboardingView");
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);

  return (
          <div className="flex min-h-0 flex-1 items-start justify-center pt-2 md:pt-6">
            {/*
              A CSS entrance, not the JS one. `AnimatedContent` starts at `opacity: 0` as an
              inline style and only reaches 1 after hydration plus an IntersectionObserver
              callback, because `usePrefersReducedMotion` reads `matchMedia` in an effect and
              so returns false on the server and on the first client render. This card is the
              first screen of the product (`/` redirects to `/user`), and hydration here
              waits on the whole Cardano stack, so the server sent the copy and then hid it:
              HTML complete at 57ms, card visible at 540ms on localhost with a warm cache.
              `.section-transition` animates from the stylesheet, so the card is painted as
              soon as the CSS lands and the fade is the browser's, not React's. It carries its
              own `prefers-reduced-motion` guard.
            */}
            <div className="section-transition w-full max-w-3xl">
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
                        className="list-stagger-item grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-4 first:pt-0 last:pb-0"
                        style={{ animationDelay: `${index * 110}ms` }}
                      >
                        {/*
                          A marker, not a display numeral. At `text-4xl md:text-5xl` these three
                          digits were the largest thing on the route -- 48px against the welcome
                          header's own `h2` at 16px -- so the screen led with its decoration and
                          the connect button, the only thing here to act on, ranked below it. A
                          24px badge still counts the steps and still owns its gutter, which a
                          shrunken bare numeral would not.
                        */}
                        <span
                          aria-hidden="true"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-xs font-semibold text-primary tabular-nums"
                        >
                          {row.n}
                        </span>
                        <div className="space-y-1">
                          {/* One rung under the old `text-lg md:text-xl`, which put these three
                              above the `h2` that heads the screen. They now match it. */}
                          <p className="font-sans text-base font-semibold leading-snug tracking-[-0.02em] text-foreground md:text-lg">
                            {row.title}
                          </p>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {row.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="space-y-4 border-t border-border/60 pt-6">
                    {/*
                      The button owns its own line and the wallet list sits under it. On one
                      wrapping row the two competed: the list is the longer of the two, so at
                      768 it took the width and the only thing here to act on read as an aside
                      beside it. `w-full` below `sm` because at 390 the row wrapped anyway and
                      left a 197px button against a 358px card.
                    */}
                    <div className="space-y-2">
                      <Button
                        type="button"
                        size="lg"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setWalletConnectionDialogOpen(true);
                        }}
                      >
                        <PlugZap className="h-4 w-4" aria-hidden="true" />
                        {i18n("connectCardanoWallet")}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        {i18n("worksWithLaceEternlVesprAndOtherWallets")}
                      </p>
                    </div>
                    {/* What connecting actually grants. The dialogs disclosed one sentence
                        between them, so the decision to hand a wallet to an unaudited beta was
                        made with no statement of what it permits. `text-sm`, the same rung as
                        every other body line on this card: at `text-xs` the one paragraph
                        stating what the app may do with a wallet was the least readable text on
                        the screen. */}
                    <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                      {i18n("connectingLetsEporaReadYourAddressAndBalance")}
                    </p>
                  </div>

                  {/* Divided like the block above it, so the card reads as three sections rather
                      than a list that keeps going. The FAQ lost its own box when its rows moved
                      onto the card's rail, and with nothing in its place the card ended in an
                      undifferentiated run of rows. */}
                  <div className="border-t border-border/60 pt-6">
                    <ProductFaqList />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
  );
}
