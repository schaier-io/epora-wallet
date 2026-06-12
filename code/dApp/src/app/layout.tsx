import type { Metadata, Viewport } from "next";
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

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Display/heading now uses the same sans family — no serif anywhere.
const geistDisplay = Geist({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap"
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Epora Wallet — Shared Cardano wallet with key recovery",
    template: "%s · Epora Wallet"
  },
  description:
    "A non-custodial Cardano wallet you share across owners and spenders — with on-chain daily limits, multisig, scheduled ADA payments, and key recovery if a signer is lost. Live on Cardano Preprod.",
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
    title: "Epora Wallet — Lose your keys, not your ADA",
    description:
      "A non-custodial Cardano wallet you share across owners and spenders. On-chain limits, multisig, and key recovery. Open source, Catalyst-funded, live on Preprod.",
    siteName: "Epora Wallet"
  },
  twitter: {
    card: "summary_large_image",
    title: "Epora Wallet — Lose your keys, not your ADA",
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
        "Wake-up timer (dead-man switch) for recovery",
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
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Epora Wallet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Epora Wallet is a non-custodial, permission-based wallet on Cardano. It keeps funds in an on-chain smart contract and lets one wallet be shared across people with different roles: owners control the rules, spenders can spend up to a daily limit, and recovery contacts can recover access if owners lose their keys. You authorize every action by signing with your own CIP-30 or CIP-45 Cardano wallet."
          }
        },
        {
          "@type": "Question",
          name: "Does Epora Wallet hold my keys or funds?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Epora is non-custodial. Your ADA stays in a Cardano smart contract governed by rules you set, and every action is authorized by your own connected wallet. Epora never takes custody of your keys or funds."
          }
        },
        {
          "@type": "Question",
          name: "How is Epora Wallet different from a regular Cardano wallet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A regular Cardano wallet has one key and one owner — lose the key and the ADA is gone for good. Epora keeps funds in an on-chain smart contract with rules on top: per-spender daily limits, multi-signature approvals, scheduled payments, and a dead-man switch that lets recovery contacts recover access after a period of inactivity."
          }
        },
        {
          "@type": "Question",
          name: "Is Epora Wallet on Cardano mainnet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Not yet. Epora Wallet currently runs on the Cardano Preprod test network while the project is in active development under its Project Catalyst grant. Funds and signatures on Preprod have no monetary value, so you can try every feature risk-free."
          }
        },
        {
          "@type": "Question",
          name: "What is a dead-man switch wallet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A dead-man switch wallet starts a recovery process automatically when the main owners stop using it for a set period. In Epora Wallet, owners configure a wake-up timer; if no owner signs a Cardano transaction before the timer expires, recovery contacts can step in and recover the wallet — useful for inheritance, or for a team that can't risk losing access to its treasury."
          }
        }
      ]
    }
  ]
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("dark font-sans", geist.variable, geistDisplay.variable, jetbrains.variable)}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
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
              Skip to content
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
      </body>
    </html>
  );
}
