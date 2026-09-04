import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTimeZone, getTranslations } from "next-intl/server";
import {
  pickMessageNamespaces,
  ROOT_CLIENT_NAMESPACES,
  type MessageCatalog
} from "@/i18n/client-messages";
import { COPY } from "@/lib/copy";
import "@/app/globals.css";
import "@/app/globals/animations.css";
import "@/components/ProfileCard.css";
import { WalletProvider } from "@/providers/wallet-provider";
import { WalletConnectProvider } from "@/providers/walletconnect-provider";
import { SmartWalletDisplayProvider } from "@/providers/smart-wallet-display";
import { ToastProvider } from "@/providers/toast-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { WalletConnectErrorBridge } from "@/components/layout/wallet-connect-error-bridge";
import { GlobalBackground } from "@/components/layout/global-background";
import { TopNav } from "@/components/layout/top-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { KeyboardShortcutsHelp } from "@/components/layout/shortcuts-help";
import { RiskDisclaimerGate } from "@/components/layout/risk-disclaimer-gate";
import { BetaNotice } from "@/components/layout/beta-notice";
import { Geist, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils/cn";
import { getSiteUrl } from "@/lib/env/server-env";
import { buildFaqJsonLdEntities } from "@/lib/product-faq";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Display/heading now uses the same sans family, so no serif anywhere.
const geistDisplay = Geist({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap"
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: COPY.brand.titleDefault,
    template: COPY.brand.titleTemplate
  },
  description:
    "A non-custodial Cardano wallet you share across owners and spenders, with on-chain daily limits, multisig, scheduled ADA payments, and key recovery once a proof of life expires. Live on Cardano Preprod.",
  keywords: [
    "Cardano wallet",
    "non-custodial Cardano wallet",
    "Cardano smart contract wallet",
    "permission-based wallet",
    "shared Cardano wallet",
    "multi-signature wallet",
    "Cardano multisig",
    "dead man switch wallet",
    "Cardano recovery wallet",
    "ADA inheritance wallet",
    "Cardano DAO treasury",
    "Cardano governance wallet",
    "spending limits",
    "scheduled payments"
  ],
  applicationName: "Epora Wallet",
  category: "finance",
  // Icons are intentionally NOT set here: Next derives them from the app-router
  // file conventions (favicon.ico, icon.svg, apple-icon.tsx in src/app/), which
  // emit correct <link rel/type> tags and serve /favicon.ico for the browsers
  // and crawlers that request it directly. A manual override here would suppress
  // the .ico and drop the type hints.
  openGraph: {
    type: "website",
    title: "Epora Wallet: Lose your keys, not your ADA",
    description:
      "A non-custodial Cardano wallet you share across owners and spenders. On-chain limits, multisig, and key recovery. Open source, Catalyst-funded, live on Preprod.",
    siteName: "Epora Wallet"
  },
  twitter: {
    card: "summary_large_image",
    title: "Epora Wallet: Lose your keys, not your ADA",
    description:
      "A non-custodial Cardano wallet you share across owners and spenders. On-chain limits, multisig, and key recovery. Open source, Catalyst-funded, live on Preprod."
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1F2D" },
    { media: "(prefers-color-scheme: light)", color: "#0E1F2D" }
  ]
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#app`,
      name: "Epora Wallet",
      alternateName: "Permission-based Cardano wallet",
      url: siteUrl,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "Epora Wallet is a non-custodial, permission-based Cardano wallet. Share one on-chain wallet across owners, spenders, and recovery contacts, with per-spender daily limits, multisig approvals, scheduled ADA payments, staking, governance voting, and a dead-man switch that lets recovery contacts recover the wallet if owners lose their keys.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      },
      featureList: [
        "Shared control with owners, spenders, and recovery contacts",
        "Daily spending limits per spender",
        "Scheduled recurring payments",
        "Multi-signature approvals",
        "Proof of life (dead-man switch) for recovery",
        "Experimental Cardano staking and governance surfaces"
      ]
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#org`,
      name: "Epora Wallet",
      url: siteUrl,
      sameAs: [
        "https://projectcatalyst.io/funds/11/cardano-use-cases-concept/dead-man-switch-permission-based-wallet",
        "https://discord.gg/2uh4BynQBW",
        "https://x.com/eporawallet"
      ]
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      // Same entries the pre-connect screen renders, so the answers a crawler gets and the
      // answers a person gets cannot drift apart.
      mainEntity: buildFaqJsonLdEntities()
    }
  ]
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requestHeaders, locale, messages, timeZone, i18n] = await Promise.all([
    headers(),
    getLocale(),
    getMessages(),
    getTimeZone(),
    getTranslations("AppLayout")
  ]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const clientMessages = pickMessageNamespaces(messages as MessageCatalog, ROOT_CLIENT_NAMESPACES);

  return (
    <html
      lang={locale}
      className={cn("dark font-sans", geist.variable, geistDisplay.variable, jetbrains.variable)}
    >
      <head>
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider
          messages={clientMessages as MessageCatalog}
          locale={locale}
          timeZone={timeZone}
        >
          <GlobalBackground />
          <RiskDisclaimerGate />
          <ToastProvider>
            <WalletProvider>
              <WalletConnectProvider>
              <SmartWalletDisplayProvider>
              <WalletConnectErrorBridge />
              <KeyboardShortcutsHelp />
              {/* The one visible string in the app that was still hard-coded English. The
                  copy scanners walk `src/` but did not report it, so `pnpm i18n:check`
                  passed with it in place. */}
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-panel focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {i18n("skipToContent")}
              </a>
              <div className="flex min-h-screen min-h-dvh flex-col">
                <TopNav />
                <BetaNotice />
                <ErrorBoundary>
                  <div id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
                    {children}
                  </div>
                </ErrorBoundary>
                <SiteFooter />
              </div>
              </SmartWalletDisplayProvider>
              </WalletConnectProvider>
            </WalletProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
