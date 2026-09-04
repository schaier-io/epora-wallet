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
        // A modal isolates what sits behind it, and must not isolate what is meant to sit
        // above it. The toast host is a sibling of the app root, so inerting it leaves a
        // toast raised from inside the modal painted on screen but unannounced, unfocusable
        // and impossible to dismiss.
        if (sibling.hasAttribute("data-modal-passthrough")) continue;
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
      const container = containerRef.current;
      const active = document.activeElement as HTMLElement | null;

      // Focus can sit on the container itself, which is where this hook puts it when a
      // modal names its own container as the initial focus, and where a click on any
      // non-focusable part of the modal leaves it. The container is not one of its own
      // descendants, so it matches neither boundary below, and a backward Tab from there
      // walks out of the modal to whatever precedes it in the document. `inert` on the
      // background hides that from the mouse and the screen reader, not from the keyboard
      // in every engine, so the boundary is enforced here too.
      if (!active || active === container || !container?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
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
