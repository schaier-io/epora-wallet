"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * The proposals workspace's module graph reaches the Cardano serialisation stack
 * (lib/proposals/verify, lib/mesh/transactions, lib/contracts/blueprint, ...).
 * Loading it client-only through this boundary turns that weight into an async
 * chunk, so it no longer sits on the /user/proposals route's first load
 * (issue #410; guarded by app/layout-mesh-boundary.test.ts). The workspace is an
 * interactive wallet screen: without JavaScript the server HTML was inert anyway,
 * so the shell renders a skeleton until the chunk arrives.
 */
const LazyProposalsWorkspace = dynamic(
  () =>
    import("@/components/user/proposals/proposals-workspace").then(mod => ({
      default: mod.ProposalsWorkspace
    })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy="true">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </div>
        <SkeletonCard />
      </div>
    )
  }
);

export { LazyProposalsWorkspace };
