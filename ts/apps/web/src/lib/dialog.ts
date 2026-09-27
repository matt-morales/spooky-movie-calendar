import { useEffect, type KeyboardEvent, type RefObject } from "react";

// Helpers shared by the review modal and the flipped movie card.

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Stops the page behind a modal from scrolling, keeping its place. Only
 * <html> is locked: `overflow: hidden` there applies to the window. On <body>
 * (which is height: 100%) it would shrink the page to one screen, and the
 * browser would jump to the top. Nested modals restore in order.
 */
export function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);
}

/**
 * Moves focus into a dialog while `active`, and returns a keydown handler that
 * closes it on Escape and keeps Tab inside it. With `restoreFocus`, focus goes
 * back to whatever had it before the dialog opened.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { active = true, restoreFocus = true }: { active?: boolean; restoreFocus?: boolean } = {},
) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus({ preventScroll: true });
    return () => {
      if (restoreFocus) previous?.focus?.({ preventScroll: true });
    };
  }, [ref, active, restoreFocus]);

  return (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((i) => !i.closest("[inert]"));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
