"use client";

import { createPortal } from "react-dom";
import type { RefObject } from "react";

import { DeleteKitchenDialog } from "./delete-kitchen-dialog";
import { HideKitchenDialog } from "./hide-kitchen-dialog";
import { KitchenMenu, type KitchenChoice } from "./kitchen-menu";
import type { KitchenSurface } from "./kitchen-surface";
import type { ListedKitchen } from "./kitchens-answer";
import { ShareKitchenSheet } from "./share-kitchen-sheet";
import type { KitchenActions } from "./use-kitchen-actions";

// The menu of a card and the questions it leads to, drawn in the `<main>` the surface was opened on.

export interface KitchenOverlaysProps {
  readonly surface: KitchenSurface;
  readonly kitchen: ListedKitchen;
  /** The name the card shows. */
  readonly kitchenName: string;
  readonly actions: KitchenActions;
  readonly onChoose: (choice: KitchenChoice) => void;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function KitchenOverlays(props: KitchenOverlaysProps) {
  const { surface } = props;
  if (surface.kind === "none" || surface.kind === "rename") return null;
  return createPortal(<OpenOverlay {...props} />, surface.screen);
}

function OpenOverlay({
  surface,
  kitchen,
  kitchenName,
  actions,
  onChoose,
  onClose,
  returnFocusRef,
}: KitchenOverlaysProps) {
  switch (surface.kind) {
    case "menu":
      return (
        <KitchenMenu
          kitchenName={kitchenName}
          isSent={kitchen.isSent}
          isCopying={actions.isCopying}
          onChoose={onChoose}
          onClose={onClose}
          returnFocusRef={returnFocusRef}
        />
      );
    case "share":
      return (
        <ShareKitchenSheet
          kitchenId={kitchen.id}
          onClose={onClose}
          returnFocusRef={returnFocusRef}
        />
      );
    case "delete":
      return (
        <DeleteKitchenDialog
          kitchen={kitchen}
          kitchenName={kitchenName}
          actions={actions}
          onClose={onClose}
          returnFocusRef={returnFocusRef}
        />
      );
    case "hide":
      return (
        <HideKitchenDialog
          kitchen={kitchen}
          actions={actions}
          onClose={onClose}
          returnFocusRef={returnFocusRef}
        />
      );
    case "none":
    case "rename":
      return null;
  }
}
