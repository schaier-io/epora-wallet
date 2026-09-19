"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * The setup form's module graph reaches the Cardano serialisation stack
 * (lib/mesh/detection, lib/mesh/transactions, lib/contracts/blueprint, ...).
 * Loading it client-only through this boundary turns that weight into an async
 * chunk, so it no longer sits on the /setup route's first load (issue #410;
 * guarded by app/layout-mesh-boundary.test.ts). The form is an interactive
 * wallet screen: without JavaScript the server HTML was inert anyway, so the
 * shell renders a skeleton until the chunk arrives. `initialStore` is a plain
 * object read on the server, so it stays RSC-serialisable across this boundary.
 */
const LazySttReferenceSetup = dynamic(
  () =>
    import("@/components/setup/stt-reference-setup").then(mod => ({
      default: mod.SttReferenceSetup
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

export { LazySttReferenceSetup };
