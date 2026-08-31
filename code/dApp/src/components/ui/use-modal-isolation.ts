"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type ModalIsolationOptions = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: () => void;
};

/** Traps focus, restores it on close, locks scrolling, and isolates background content. */
export function useModalIsolation({
  open,
  containerRef,
  initialFocusRef,
  onEscape
}: ModalIsolationOptions) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const inerted: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let current = containerRef.current;

    while (current?.parentElement) {
      const parent = current.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        inerted.push({ element: sibling, wasInert: sibling.hasAttribute("inert") });
        sibling.setAttribute("inert", "");
      }
      if (parent === document.body) break;
      current = parent;
    }

    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (initialFocusRef?.current ?? first ?? container)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
      ).filter((element) => !element.hasAttribute("data-focus-skip"));
      if (focusables.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const { element, wasInert } of inerted) {
        if (!wasInert) element.removeAttribute("inert");
      }
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [containerRef, initialFocusRef, open]);
}
