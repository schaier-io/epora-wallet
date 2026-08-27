"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

type InfoHintProps = {
  children: ReactNode;
  label?: string;
  className?: string;
  contentClassName?: string;
};

export function InfoHint({
  children,
  label,
  className,
  contentClassName
}: InfoHintProps) {
  const i18n = useTranslations("ComponentsUiInfoHint");
  const resolvedLabel = label ?? i18n("moreDetails");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={resolvedLabel}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-6 sm:w-6",
              className
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className={contentClassName}>{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
