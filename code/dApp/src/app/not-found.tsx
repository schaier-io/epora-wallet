import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export default function NotFound() {
  return (
    <main className="page-shell flex flex-1 flex-col">
      <div className="container flex flex-1 flex-col items-center justify-center py-10 text-center">
        {/*
          No radius and no background here. The span is a fixed 80px box that centres the
          64px mark; `rounded-3xl` had nothing to round, since the box has no background,
          no border, no shadow and `overflow: visible` (measured: radius 22px, background
          rgba(0,0,0,0), border 0px, shadow none). The `<Image>` already carries `alt=""`,
          so the wrapper does not need to hide itself twice either.
        */}
        <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center">
          <Image
            src="/logo-mark.svg"
            alt=""
            width={80}
            height={80}
            className="h-16 w-auto"
          />
        </span>
        {/*
          `.eyebrow`, not a hand-rolled one. This was `text-xs uppercase tracking-[0.18em]`,
          which measures 12px/2.16px against the shared rung's 11px/1.76px, so the product
          had two uppercase treatments a click apart.
        */}
        <p className="eyebrow mt-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-muted-foreground">
          404 · Page not found
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          This page doesn&apos;t exist.
        </h1>
        {/*
          This used to read "The page you wanted isn't here. Head back to your wallet home
          to keep going." The first sentence restated the heading above it and the second
          restated the button below it, so the only paragraph on the screen said nothing
          the reader could not already see. A 404 has exactly one thing to add: why.
        */}
        <p className="mt-3 max-w-lg text-sm text-muted-foreground">
          The address may be mistyped, or the page may have moved.
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
