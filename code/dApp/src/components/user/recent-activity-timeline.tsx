"use client";

import { ArrowUpDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

/**
 * Flat, presentation-only shape so the timeline doesn't know about wallet
 * transaction internals. Workspace formats events into this shape before
 * passing them in.
 */
type TimelineEvent = {
  id: string;
  title: string;
  label: string;
  badgeClassName?: string;
  amountSummary: string;
  amountClassName?: string;
  /** Pre-formatted relative or absolute time (e.g. "5m ago"). */
  timestampDisplay: string;
  /** Long tooltip (e.g. "Jan 12, 14:32 UTC · Slot 1234"). */
  timestampTooltip?: string;
};

type RecentActivityTimelineProps = {
  events: TimelineEvent[];
  /** Optional cap. Defaults to 5. */
  limit?: number;
  /** Header "See all" action. Hidden when nothing to see. */
  onSeeAll?: () => void;
  /** Per-event click. */
  onEventClick?: (event: TimelineEvent) => void;
  /** Loading + error states drive the inner placeholder. */
  loading?: boolean;
};

function dotToneClass(amountClassName?: string) {
  if (amountClassName?.includes("text-emerald")) return "bg-emerald-400";
  if (amountClassName?.includes("text-rose") || amountClassName?.includes("text-red"))
    return "bg-rose-400";
  return "bg-primary";
}

function dotHaloClass(amountClassName?: string) {
  if (amountClassName?.includes("text-emerald")) return "bg-emerald-400/40";
  if (amountClassName?.includes("text-rose") || amountClassName?.includes("text-red"))
    return "bg-rose-400/40";
  return "bg-primary/40";
}

export function RecentActivityTimeline({
  events,
  limit = 5,
  onSeeAll,
  onEventClick,
  loading
}: RecentActivityTimelineProps) {
  const sliced = events.slice(0, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ArrowUpDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Recent activity
        </p>
        {events.length > 0 && onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
          >
            See all
            <ChevronRight
              className="ml-0.5 inline h-3 w-3 -translate-y-px"
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {loading && events.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-3 text-xs text-muted-foreground">
          <ArrowUpDown
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          Loading recent activity.
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-background/30 px-3 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/50">
              <ArrowUpDown
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">No activity yet</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Sends, receives, and wallet updates will appear here as they happen.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ol
          className="relative overflow-hidden rounded-lg border border-border/60 bg-background/40 px-3 py-2"
          aria-label="Recent activity timeline"
        >
          {/* Vertical rail */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 left-[1.375rem] top-3 w-px bg-gradient-to-b from-border/0 via-border/70 to-border/0"
          />
          {sliced.map((event, index) => {
            const isFirst = index === 0;
            const isLast = index === sliced.length - 1;
            return (
              <li
                key={event.id}
                className={cn(
                  "list-stagger-item relative pl-7",
                  !isFirst && "pt-2",
                  !isLast && "pb-2"
                )}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Dot anchor on the rail */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[0.6875rem] top-[1.0625rem] block h-1.5 w-1.5 rounded-full ring-2 ring-background",
                    dotToneClass(event.amountClassName)
                  )}
                />
                {isFirst ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-[0.5625rem] top-[0.9375rem] block h-[0.625rem] w-[0.625rem] rounded-full opacity-60",
                      dotHaloClass(event.amountClassName),
                      "animate-[pill-pulse_2200ms_cubic-bezier(0.22,1,0.36,1)_infinite]"
                    )}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onEventClick?.(event)}
                  className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background/65 focus-visible:bg-background/65 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm text-foreground">{event.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px] uppercase tracking-[0.12em]",
                          event.badgeClassName
                        )}
                      >
                        {event.label}
                      </Badge>
                    </div>
                    <p
                      className="mt-0.5 text-[11px] text-muted-foreground"
                      title={event.timestampTooltip}
                    >
                      {event.timestampDisplay}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-right text-sm tabular-nums",
                      event.amountClassName
                    )}
                  >
                    {event.amountSummary}
                  </p>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground/0 transition-[transform,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:text-muted-foreground/80"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
