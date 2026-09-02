"use client";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronRight, Search } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { type AssetSelectionOption } from "@/components/user/workspace/types";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { cn } from "@/lib/utils/cn";

// Extracted from `primitives.tsx`, which had grown past the repo's 750-line cap. The
// i18n namespace stays `ComponentsUserWorkspaceEditorsPrimitives` so the existing
// message-catalog entries keep resolving without a catalog migration.
//
// ARIA shape: the WAI-ARIA "combobox with listbox popup" pattern. The trigger is a
// plain button (`aria-haspopup` + `aria-expanded` + `aria-controls`); the search field
// inside the popup is the actual combobox (`role="combobox"`) and owns
// `aria-activedescendant`, so keyboard focus stays on the search field while arrows
// move the highlighted option, the way a native select's typeahead does.

/** Enough room for the search row plus the max-height list; below that the panel opens upward. */
const PANEL_ROOM = 340;
/** The listbox's rendered cap (`max-h-64`); the chrome around it is what's left of PANEL_ROOM. */
const LIST_MAX_HEIGHT = 256;
const PANEL_CHROME = PANEL_ROOM - LIST_MAX_HEIGHT;
/** Floor for a cramped viewport, so a couple of options stay reachable by scroll. */
const MIN_LIST_HEIGHT = 96;
/** Gap between the panel and the trigger, applied on whichever side opens. */
const OPENING_GAP = 8;

export function SearchableAssetUnitDropdown({
  id,
  value,
  options,
  onChange,
  placeholder,
  emptyLabel
}: {
  id: string;
  value: string;
  options: AssetSelectionOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPrimitives");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // The panel renders through a portal with fixed coordinates instead of `absolute`
  // inside the form: every scroller between here and the page root clips absolutely
  // positioned children (`overflow-y: auto` forces `overflow-x` to clip too), so the
  // list used to be cut off at the form card's edge whenever it extended past it.
  const [panelRect, setPanelRect] = useState<{
    left: number;
    width: number;
    top: number;
    /** Distance from the viewport bottom to hang the panel from when it opens upward. */
    bottom: number;
    openUpward: boolean;
    /** List height clamped to the room the chosen side actually has. */
    maxListHeight: number;
  } | null>(null);

  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const closeDropdown = useCallback((refocusTrigger: boolean) => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
    // Escape/Enter/Tab unmount the portal under the caret; without the refocus the
    // browser drops focus on `<body>`. Outside-click closes keep focus wherever the
    // pointer took it.
    if (refocusTrigger) {
      triggerRef.current?.focus();
    }
  }, []);

  const openDropdown = useCallback(
    (initial: "first" | "last") => {
      const selectedIndex = options.findIndex((option) => option.unit === value);
      setActiveIndex(
        initial === "last"
          ? Math.max(0, options.length - 1)
          : selectedIndex >= 0
            ? selectedIndex
            : 0
      );
      setIsOpen(true);
    },
    [options, value]
  );

  const selectedOption = useMemo(
    () =>
      options.find((option) => option.unit === value) ??
      (value.trim()
        ? {
            unit: value,
            label: (() => {
              const id = resolveAssetIdentity(value);
              // No separator without a name behind it (ADA has none).
              return id.knownMeta?.name ? i18n("value1Value2", { value1: id.symbol, value2: id.knownMeta.name }) : id.symbol;
            })(),
            availableLabel: i18n("notInYourWalletYet"),
            searchableText: value.toLowerCase(),
            maxQuantity: "0"
          }
        : null),
    [options, value, i18n]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.searchableText.includes(normalizedQuery));
  }, [options, query]);

  // The stored index can drift out of range when filtering or an options change
  // shrinks the list; deriving the effective index keeps `aria-activedescendant`
  // pointing at a real option without a state-correcting effect.
  const highlightIndex = Math.min(activeIndex, filteredOptions.length - 1);

  const positionPanel = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const viewportHeight = window.innerHeight;
    const roomBelow = viewportHeight - rect.bottom;
    const roomAbove = rect.top;
    // Downward while it fits; otherwise the roomier side wins, so a trigger near
    // the bottom of a short viewport no longer opens into a clipping panel.
    const openUpward = roomBelow < PANEL_ROOM && roomAbove > roomBelow;
    const roomOnOpenSide = (openUpward ? roomAbove : roomBelow) - OPENING_GAP;
    const maxListHeight = Math.max(
      Math.min(LIST_MAX_HEIGHT, roomOnOpenSide - PANEL_CHROME),
      MIN_LIST_HEIGHT
    );
    setPanelRect({
      left: rect.left,
      width: rect.width,
      top: rect.bottom + OPENING_GAP,
      // Upward hangs the panel's bottom edge an 8px gap above the trigger's top; it
      // must come from rect.top, not the top coordinate (which is rect.bottom + 8),
      // or the panel lands on top of the trigger.
      bottom: viewportHeight - rect.top + OPENING_GAP,
      openUpward,
      maxListHeight
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    positionPanel();

    // Scroll on any ancestor (capture phase), not just the window: the trigger sits
    // inside the form column's scroller, and the panel must follow it.
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [isOpen, positionPanel]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        closeDropdown(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeDropdown, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // `?.` keeps jsdom (no scrollIntoView) from throwing in the component tests.
    document
      .getElementById(`${listboxId}-option-${highlightIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlightIndex, isOpen, listboxId]);

  const selectOption = (option: AssetSelectionOption) => {
    onChange(option.unit);
    closeDropdown(true);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = filteredOptions.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (count > 0) {
          setActiveIndex((index) => (Math.min(index, count - 1) + 1) % count);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (count > 0) {
          setActiveIndex((index) => (Math.min(index, count - 1) - 1 + count) % count);
        }
        break;
      case "Home":
        event.preventDefault();
        if (count > 0) {
          setActiveIndex(0);
        }
        break;
      case "End":
        event.preventDefault();
        if (count > 0) {
          setActiveIndex(count - 1);
        }
        break;
      case "Enter": {
        event.preventDefault();
        const option = filteredOptions[highlightIndex];
        if (option) {
          selectOption(option);
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeDropdown(true);
        break;
      case "Tab":
        // Swallowing Tab and returning to the trigger costs one extra keypress, but
        // letting it through sends focus past the end of the document: the search
        // field lives in a portal that is the last node in `<body>`.
        event.preventDefault();
        closeDropdown(true);
        break;
    }
  };

  const activeOptionId =
    highlightIndex >= 0 && highlightIndex < filteredOptions.length
      ? optionId(highlightIndex)
      : undefined;

  const panel = isOpen && panelRect ? (
    <div
      ref={panelRef}
      style={{
        left: panelRect.left,
        width: panelRect.width,
        ...(panelRect.openUpward
          ? { bottom: panelRect.bottom }
          : { top: panelRect.top })
      }}
      className="fixed z-50 space-y-1 rounded-xl border border-border/70 bg-background/95 shadow-xl backdrop-blur"
    >
      <div className="relative border-b border-border/60 px-3 py-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          // A placeholder is not a reliable accessible name (it vanishes on input and
          // some screen readers skip it), so the search field carries an explicit label.
          aria-label={placeholder ?? i18n("searchAvailableAssets")}
          placeholder={placeholder ?? i18n("searchAvailableAssets")}
          className="border-0 bg-transparent pl-9 pr-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          autoFocus
        />
      </div>
      {/* Rendered even when the filter matches nothing, so the combobox's and the
          trigger's `aria-controls` always point at a live element. The inline
          maxHeight clamps the list to the room the open side actually has. */}
      <div
        id={listboxId}
        role="listbox"
        aria-labelledby={id}
        style={{ maxHeight: panelRect.maxListHeight }}
        className={cn("space-y-1", filteredOptions.length > 0 && "overflow-auto p-3")}
      >
        {filteredOptions.map((option, index) => {
          const isSelected = option.unit === value;
          const isActive = index === highlightIndex;
          return (
            <button
              key={option.unit}
              type="button"
              role="option"
              id={optionId(index)}
              aria-selected={isSelected}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-primary/40 bg-primary/10"
                  : "border-transparent bg-muted/20 hover:border-primary/20 hover:bg-background/80",
                // The keyboard cursor uses the app's standard focus ring, so arrow-key
                // movement is visible without relying on hover styles a keyboard
                // cannot reach.
                isActive && "border-primary/30 ring-1 ring-ring"
              )}
              onClick={() => selectOption(option)}
            >
              <div className="min-w-0">
                {/* `break-words`, not `truncate`: units and token names differ at their
                    tail, so an ellipsis can hide the one part that tells two assets
                    apart. Wrapping only kicks in past the line's width; short labels
                    render exactly as before. */}
                <p className="whitespace-normal break-words text-sm font-medium text-foreground">
                  {option.label}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {option.availableLabel}
                </p>
              </div>
              {isSelected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
            </button>
          );
        })}
      </div>
      {filteredOptions.length === 0 ? (
        // Outside the listbox: a listbox's content model allows only options, and the
        // status role announces the miss to assistive tech without stealing focus.
        <p
          role="status"
          className="mb-3 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground"
        >
          {emptyLabel ?? i18n("noMatchingAssets")}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background/70 px-3 py-2 text-left ring-offset-background transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => {
          if (isOpen) {
            // `true`, not `false`: on Safari a click never focuses the trigger, and the
            // search input unmounts with the portal, so focus would land on `<body>`.
            closeDropdown(true);
            return;
          }
          openDropdown("first");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen) {
            closeDropdown(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openDropdown(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        <div className="min-w-0">
          {/* The CSS truncation here is visual only: the accessible name of the button is
              computed from the full text, so screen readers never see the ellipsis. No
              `title` fallback; a title-only hint is invisible to keyboard and touch. */}
          <p
            className={cn(
              "truncate text-sm",
              selectedOption ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {selectedOption?.label ?? i18n("chooseAnAsset")}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        />
      </button>

      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
