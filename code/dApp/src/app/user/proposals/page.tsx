import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ScopedClientIntlProvider } from "@/i18n/scoped-client-provider";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ProposalsWorkspace } from "@/components/user/proposals/proposals-workspace";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await getTranslations("AppUserProposalsPage");
  return {
    title: i18n("approvalRequests"),
    alternates: {
      canonical: "/user/proposals"
    }
  };
}

export default function ProposalsPage() {
  const i18n = useTranslations("AppUserProposalsPage");
  return (
    <main className="page-shell flex flex-1 flex-col">
      <ScopedClientIntlProvider prefixes={["ComponentsUserProposals", "ComponentsUi"]}>
        <div className="container flex flex-1 flex-col py-3 md:py-4">
          <Suspense
            fallback={
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {i18n("loadingApprovalRequests")}
              </div>
            }
          >
            <ProposalsWorkspace />
          </Suspense>
        </div>
      </ScopedClientIntlProvider>
    </main>
  );
}
