import { useTranslations } from "next-intl";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { UserActionsPage } from "@/components/user/actions-page";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ScopedClientIntlProvider } from "@/i18n/scoped-client-provider";

export const metadata: Metadata = {
  alternates: {
    canonical: "/user"
  }
};

export default function UserPage() {
  const i18n = useTranslations("AppUserPage");
  return (
    <main className="page-shell flex flex-1 flex-col md:overflow-x-clip">
      <header className="sr-only">
        <h1>{i18n("eporaWalletASharedCardanoSmartWallet")}</h1>
        <p>
          {i18n("shareOneNonCustodialWalletAcrossOwnersAnd")}
        </p>
        <p>
          {i18n("connectACardanoBrowserWalletToCreateOr")}
        </p>
      </header>
      <ScopedClientIntlProvider
        prefixes={["ComponentsUser", "ComponentsUi", "ComponentsReactBits", "Hooks"]}
      >
        <div className="container flex flex-1 flex-col py-3 md:py-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <Suspense
              fallback={
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {i18n("preparingWalletHome")}
                  </div>
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              }
            >
              <UserActionsPage />
            </Suspense>
          </div>
        </div>
      </ScopedClientIntlProvider>
    </main>
  );
}
