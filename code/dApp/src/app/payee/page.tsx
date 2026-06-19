import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PayeeView } from "@/components/payee/payee-view";
import { SkeletonCard } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Scheduled payments to you",
  alternates: {
    canonical: "/payee"
  }
};

export default function PayeePage() {
  return (
    <main className="page-shell flex flex-1 flex-col md:overflow-x-clip">
      <header className="sr-only">
        <h1>Scheduled payments to you</h1>
        <p>
          See the scheduled (streaming) payments other Epora wallets send to your
          connected wallet, and stop any of them. Stopping a payment ends its future
          accrual from now on; anything already owed to you is preserved on-chain.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          fallback={
            <div className="container space-y-4 py-3 md:py-4">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Preparing your payments…
              </div>
              <SkeletonCard />
            </div>
          }
        >
          <PayeeView />
        </Suspense>
      </div>
    </main>
  );
}
