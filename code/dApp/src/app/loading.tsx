import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

export default function RootLoading() {
  const i18n = useTranslations("AppLoading");
  return (
    <div className="page-shell flex flex-1 flex-col">
      <div className="container flex flex-1 flex-col space-y-4 py-6 md:py-10">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {i18n("loadingWallet")}
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
