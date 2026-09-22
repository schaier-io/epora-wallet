"use client";
import { useTranslations } from "next-intl";


import { useAtom } from "jotai";
import { ShieldAlert } from "lucide-react";
import { shortcutsHelpOpenAtom } from "@/components/layout/shortcuts-help.atoms";
import { DISCORD_INVITE_URL, GITHUB_NEW_ISSUE_URL } from "@/lib/site-links";

const FOOTER_LINK_CLASS =
  "rounded-sm py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function FooterSeparator() {
  return (
    <span aria-hidden="true" className="text-border">
      ·
    </span>
  );
}

export function SiteFooter() {
  const i18n = useTranslations("ComponentsLayoutSiteFooter");
  // The one pointer/touch path to the shortcuts dialog. The `?` key answers only to a
  // keyboard, so without this button touch users could never see the shortcut list at all.
  const [, setShortcutsHelpOpen] = useAtom(shortcutsHelpOpenAtom);

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/40">
      <div className="container flex flex-col gap-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:py-4">
        <p className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          {i18n("preprodTestNetwork")}
        </p>
        {/* `-my-1` absorbs the children's `py-1`: the targets reach 24px without the
            footer getting taller. `gap-x-4` outside plus `gap-2` inside is what makes
            the separator dot express a grouping instead of a uniform gap. */}
        <div className="-my-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/*
            The old hint was a static span here, hidden below `sm`, until it was dropped
            entirely. It is a button now and visible at every width: on a phone there is no
            `?` key to press and the hint text alone would be a dead end, so the whole
            string opens the dialog. The focus ring matches the footer's links -- a bare
            outline swap lost the ring once before on this exact row.
          */}
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-2 rounded-sm py-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* The explicit `{" "}` nodes are load-bearing: the accessible name is the
                concatenation of the button's text, and without them it is
                "Press?for shortcuts" -- glued, because the visual spacing lives in flex
                `gap-2`, which the name algorithm never sees. Whitespace-only text nodes
                create no flex item, so nothing renders twice. */}
            {i18n("press")}{" "}
            <kbd className="rounded border border-border/60 bg-background/60 px-1 font-mono text-xs">?</kbd>{" "}
            {i18n("forShortcuts")}
          </button>
          <div className="flex flex-wrap items-center gap-2">
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={FOOTER_LINK_CLASS}
          >
            {i18n("discord")}
          </a>
          <FooterSeparator />
          <a
            href={GITHUB_NEW_ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={FOOTER_LINK_CLASS}
          >
            {i18n("reportAnIssue")}
          </a>
          <FooterSeparator />
          <a
            href="https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet"
            target="_blank"
            rel="noopener noreferrer"
            className={FOOTER_LINK_CLASS}
          >
            {i18n("catalystProposal")}
          </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
