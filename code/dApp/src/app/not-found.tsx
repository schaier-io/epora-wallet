import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export default function NotFound() {
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
          404 · Page not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          This page doesn&apos;t exist.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          The page you wanted isn&apos;t here. Head back to your wallet home to keep going.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/user" className={cn(buttonVariants({ size: "sm" }))}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Wallet home
          </Link>
        </div>
      </div>
    </main>
  );
}
