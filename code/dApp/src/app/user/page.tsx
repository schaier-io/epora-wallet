import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { UserActionsPage } from "@/components/user/actions-page";
import { SkeletonCard } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  alternates: {
    canonical: "/user"
  }
};

export default function UserPage() {
  return (
    <main className="page-shell flex flex-1 flex-col md:overflow-x-clip">
      <header className="sr-only">
        <h1>Epora Wallet — Shared Cardano wallet with key recovery</h1>
      </header>
      <div className="container flex flex-1 flex-col py-3 md:py-4">
        <div className="flex min-h-0 flex-1 flex-col">
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Preparing wallet home…
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
    </main>
  );
}
