"use client";

// **The document-level half of dismissing a disclosure**: a press outside it, and Escape.
//
// Two hooks, because the two consumers differ in one deliberate way. The room's wall help closes on
// Escape wherever focus is. The locale menu answers Escape on its own trigger and options instead,
// because its Escape also returns focus to the trigger (`locale-menu.tsx`), so it takes the pointer
// half alone. Both listen only while open and neither calls `stopPropagation` — the rule the
// application's other document-level Escape handler states (`global-settings.tsx`'s
// `useEscapeToDismiss`).
import { type RefObject, useEffect } from "react";

export interface DismissalTarget {
  /** The disclosure's root: a press on it or inside it is not "outside". */
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly isOpen: boolean;
  /** Must be stable across renders, or the listeners are re-registered on every one. */
  readonly dismiss: () => void;
}

export function useDismissOnOutsidePointerOrEscape(
  target: DismissalTarget,
): void {
  useDismissOnOutsidePointer(target);
  useDismissOnEscape(target);
}

export function useDismissOnOutsidePointer({
  rootRef,
  isOpen,
  dismiss,
}: DismissalTarget): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const dismissOnOutsidePointer = (event: PointerEvent): void => {
      const pressed = event.target;
      if (pressed instanceof Node && rootRef.current?.contains(pressed)) return;
      dismiss();
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
    };
  }, [rootRef, isOpen, dismiss]);
}

function useDismissOnEscape({ isOpen, dismiss }: DismissalTarget): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [isOpen, dismiss]);
}
