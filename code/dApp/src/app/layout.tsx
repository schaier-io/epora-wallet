import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTimeZone, getTranslations } from "next-intl/server";
import "@/app/globals.css";
import "@/app/globals/animations.css";
import "@/components/ProfileCard.css";
import "@/components/ProfileCard-overrides.css";
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
import {
  pickMessageNamespaces,
  ROOT_CLIENT_NAMESPACES,
  type MessageCatalog
} from "@/i18n/client-messages";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Display/heading now uses the same sans family — no serif anywhere.
const geistDisplay = Geist({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap"
});

const siteUrl = getSiteUrl();

export async function generateMetadata(): Promise<Metadata> {
  const metadataI18n = await getTranslations("Metadata");
  return {
  metadataBase: new URL(siteUrl),
  title: {
    default: metadataI18n("defaultTitle"),
    template: metadataI18n("titleTemplate")
  },
  description: metadataI18n("description"),
  keywords: metadataI18n("keywords").split("|"),
  applicationName: metadataI18n("appName"),
  category: "finance",
  // Icons are intentionally NOT set here: Next derives them from the app-router
  // file conventions (favicon.ico, icon.svg, apple-icon.tsx in src/app/), which
  // emit correct <link rel/type> tags and serve /favicon.ico for the browsers
  // and crawlers that request it directly. A manual override here would suppress
  // the .ico and drop the type hints.
  openGraph: {
    type: "website",
    title: metadataI18n("socialTitle"),
    description: metadataI18n("socialDescription"),
    siteName: metadataI18n("appName")
  },
  twitter: {
    card: "summary_large_image",
    title: metadataI18n("socialTitle"),
    description: metadataI18n("socialDescription")
  },
  robots: {
    index: true,
    follow: true
  }
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1F2D" },
    { media: "(prefers-color-scheme: light)", color: "#0E1F2D" }
  ]
};

async function buildJsonLd() {
  const metadataI18n = await getTranslations("Metadata");
  return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#app`,
      name: metadataI18n("appName"),
      alternateName: metadataI18n("alternateName"),
      url: siteUrl,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: metadataI18n("structuredDescription"),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      },
      featureList: [
        metadataI18n("featureSharedControl"),
        metadataI18n("featureLimits"),
        metadataI18n("featurePayments"),
        metadataI18n("featureApprovals"),
        metadataI18n("featureRecovery"),
        metadataI18n("featureGovernance")
      ]
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#org`,
      name: metadataI18n("appName"),
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
      mainEntity: [
        {
          "@type": "Question",
          name: metadataI18n("faqWhatQuestion"),
          acceptedAnswer: {
            "@type": "Answer",
            text: metadataI18n("faqWhatAnswer")
          }
        },
        {
          "@type": "Question",
          name: metadataI18n("faqCustodyQuestion"),
          acceptedAnswer: {
            "@type": "Answer",
            text: metadataI18n("faqCustodyAnswer")
          }
        },
        {
          "@type": "Question",
          name: metadataI18n("faqDifferenceQuestion"),
          acceptedAnswer: {
            "@type": "Answer",
            text: metadataI18n("faqDifferenceAnswer")
          }
        },
        {
          "@type": "Question",
          name: metadataI18n("faqNetworkQuestion"),
          acceptedAnswer: {
            "@type": "Answer",
            text: metadataI18n("faqNetworkAnswer")
          }
        },
        {
          "@type": "Question",
          name: metadataI18n("faqTimerQuestion"),
          acceptedAnswer: {
            "@type": "Answer",
            text: metadataI18n("faqTimerAnswer")
          }
        }
      ]
    }
  ]
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requestHeaders, locale, messages, timeZone, t, jsonLd] = await Promise.all([
    headers(),
    getLocale(),
    getMessages(),
    getTimeZone(),
    getTranslations("Common"),
    buildJsonLd()
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
                  <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-panel focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {t("skipToContent")}
                  </a>
                  <div className="flex min-h-screen min-h-dvh flex-col">
                    <TopNav />
                    <BetaNotice />
                    <ErrorBoundary>
                      <div id="main" className="flex min-h-0 flex-1 flex-col">
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
