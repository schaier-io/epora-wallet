import { Loader2 } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";
import { COPY } from "@/lib/copy";

/**
 * Route-level fallback for every segment without one of its own, which today is `/` (a
 * redirect to `/user`) and `/payee`.
 *
 * It used to read "Loading wallet…". A payee owns no wallet here -- `/payee` exists so
 * someone who is *paid* by an Epora wallet can see what is owed -- so the one noun on the
 * screen named a thing the reader does not have. Naming the product is true on both routes.
 *
 * `aria-busy` and `aria-live` are here because the text is: a live region with nothing to
 * read announces nothing, and text with no live region is never announced. `app/user/loading.tsx`
 * had the region without the text; this had the text without the region.
 */
export default function RootLoading() {
  return (
    <div
      className="page-shell flex flex-1 flex-col"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="container flex flex-1 flex-col space-y-4 py-3 md:py-4">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading {COPY.brand.name}…
        </div>
        <SkeletonCard />
      </div>
    </div>
  );
}
