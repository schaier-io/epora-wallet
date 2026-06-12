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
        <p>
          Epora Wallet is a non-custodial, permission-based Cardano wallet that lets one
          on-chain wallet be shared across multiple people. Owners control every rule.
          Spenders can spend up to a daily limit. Recovery contacts can recover access if owners
          lose their keys, after a wake-up timer (dead-man switch) expires. Per-spender
          spending limits, multi-signature approvals, scheduled ADA payments, staking
          rewards, and Cardano governance voting are all enforced on-chain by smart
          contracts.
        </p>
        <p>
          Connect any CIP-30 or CIP-45 Cardano wallet to open an existing Epora wallet or
          create a new one. Epora is non-custodial — you keep your keys, and funds stay in a
          Cardano smart contract. Currently live on the Cardano Preprod test network.
        </p>
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
