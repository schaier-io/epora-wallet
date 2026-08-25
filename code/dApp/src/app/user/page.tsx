import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { UserActionsPage } from "@/components/user/actions-page";
import { SkeletonCard } from "@/components/ui/skeleton";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { workspaceTitleFragment } from "@/components/user/workspace/workspace-document-title";

/**
 * The workspace keeps its whole location in the query string, so a static title made every
 * state look the same in the history menu and in a saved bookmark. `searchParams` is parsed
 * with the very function the client parses it with, then run through the same title
 * derivation the workspace would use, so the two cannot drift apart.
 */
export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }
  const fragment = workspaceTitleFragment(parseWorkspaceRouteState(params));

  return {
    ...(fragment ? { title: fragment } : {}),
    alternates: {
      canonical: "/user"
    }
  };
}

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
