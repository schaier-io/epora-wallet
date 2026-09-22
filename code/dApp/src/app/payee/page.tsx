import { getTranslations } from "next-intl/server";
import { ScopedClientIntlProvider } from "@/i18n/scoped-client-provider";
import type { Metadata } from "next";
import { PageTransition } from "@/components/layout/page-transition";
import { Suspense } from "react";
import { LazyPayeeView } from "@/components/payee/lazy-payee-view";
import { PayeeCardFallback } from "@/components/payee/payee-card-fallback";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await getTranslations("AppPayeePage");
  return {
    title: i18n("scheduledPaymentsToYou"),
    alternates: {
      canonical: "/payee"
    }
  };
}

export default function PayeePage() {
  return (
    <PageTransition>
      <main className="page-shell flex flex-1 flex-col md:overflow-x-clip">
        {/* `AppPayeePage` ships too because the loading fallback (payee-card-fallback)
            reads its "Preparing your payments" line on the client as well as the server. */}
        <ScopedClientIntlProvider
          prefixes={["ComponentsPayee", "ComponentsUi", "AppPayeePage"]}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {/* The fallback is the card shell, so the heading and note paragraph paint in
                the server HTML. Before issue #502 they waited inside the view's async
                chunk, and the note paragraph was the route's LCP element at about 14.5 s
                while sibling routes sat at 4 to 5 s. The live view swaps in with the same
                header plus the refresh control and the real content. */}
            <Suspense fallback={<PayeeCardFallback />}>
              <LazyPayeeView />
            </Suspense>
          </div>
        </ScopedClientIntlProvider>
      </main>
    </PageTransition>
  );
}
