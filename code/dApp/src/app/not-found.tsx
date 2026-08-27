import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export default function NotFound() {
  const i18n = useTranslations("AppNotFound");
  return (
    <main className="page-shell flex flex-1 flex-col">
      <div className="container flex flex-1 flex-col items-center justify-center py-12 text-center">
        <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-transparent" aria-hidden="true">
          <Image
            src="/logo-mark.svg"
            alt=""
            width={80}
            height={80}
            className="h-16 w-auto"
          />
        </span>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {i18n("message_404WrongTurn")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          {i18n("nothingLivesAtThisAddress")}
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          {i18n("yourWalletIsStillWhereYouLeftIt")}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/user" className={cn(buttonVariants({ size: "sm" }))}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {i18n("walletHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
