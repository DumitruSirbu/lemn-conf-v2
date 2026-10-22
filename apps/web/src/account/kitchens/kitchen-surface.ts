"use client";

import { useCallback, useMemo, useState, type RefObject } from "react";

// Which of a card's own surfaces is open, and where it stands in the document. The menu and the dialogs are drawn in the
// screen's `<main>`, not inside the card: the modal behaviour marks the other bands of the `<main>` inert, and a surface
// nested in the card would sit in the one band that holds the whole list.

/** The surfaces drawn over the screen: the menu, and the three questions it leads to. */
export type OverlayKind = "menu" | "share" | "delete" | "hide";

export type KitchenSurface =
  | { readonly kind: "none" }
  /** The name's field, drawn in the card. */
  | { readonly kind: "rename" }
  | {
      readonly kind: OverlayKind;
      /** The `<main>` the surface is drawn in. */
      readonly screen: HTMLElement;
    };

export interface KitchenSurfaceControls {
  readonly surface: KitchenSurface;
  readonly openOverlay: (kind: OverlayKind) => void;
  readonly beginRename: () => void;
  readonly close: () => void;
}

export function useKitchenSurface(
  triggerRef: RefObject<HTMLElement | null>,
): KitchenSurfaceControls {
  const [surface, setSurface] = useState<KitchenSurface>({ kind: "none" });
  const openOverlay = useCallback(
    (kind: OverlayKind) => {
      const screen = triggerRef.current?.closest("main") ?? document.body;
      setSurface({ kind, screen });
    },
    [triggerRef],
  );
  const beginRename = useCallback(() => {
    setSurface({ kind: "rename" });
  }, []);
  const close = useCallback(() => {
    setSurface({ kind: "none" });
  }, []);
  return useMemo(
    () => ({ surface, openOverlay, beginRename, close }),
    [surface, openOverlay, beginRename, close],
  );
}

/**
 * Where focus goes when an overlay closes and what had it on open is gone: the "⋯" that opened the menu, or, once the
 * act removed the card with it, the list's own anchor. Read when the overlay closes, so it follows the card as it is
 * then.
 */
export function returnFocusTargetOf(
  triggerRef: RefObject<HTMLElement | null>,
  listFocusRef: RefObject<HTMLElement | null>,
): RefObject<HTMLElement | null> {
  return {
    get current() {
      return triggerRef.current ?? listFocusRef.current;
    },
  };
}
