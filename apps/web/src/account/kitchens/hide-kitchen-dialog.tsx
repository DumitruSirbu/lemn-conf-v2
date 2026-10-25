"use client";

import type { RefObject } from "react";

import { useAccountKitchensCopy } from "@/i18n/use-content";

import { renderStrong } from "../account-form-parts";
import { AccountDialog } from "../account-dialog";
import type { ListedKitchen } from "./kitchens-answer";
import { RemoveFailureNotice } from "./remove-kitchen-parts";
import type { KitchenActions } from "./use-kitchen-actions";
import { useRemoveKitchen } from "./use-remove-kitchen";

// "Ascunzi o bucătărie trimisă?" (Lot 2 frames A17A to A17D). A destructive question, so it opens on "Anulează". Only a
// sent kitchen is hidden: the server answers a draft with `409`, and the card is then corrected to offer "Șterge" instead.
//
// Mount it as a direct child of the screen's `<main>`, as `AccountDialog` asks.

export interface HideKitchenDialogProps {
  readonly kitchen: ListedKitchen;
  readonly actions: KitchenActions;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function HideKitchenDialog({
  kitchen,
  actions,
  onClose,
  returnFocusRef,
}: HideKitchenDialogProps) {
  const copy = useAccountKitchensCopy();
  const { status, confirm } = useRemoveKitchen(
    () => actions.hideSent(kitchen),
    onClose,
  );

  return (
    <AccountDialog
      kind="destructive"
      title={copy.remove.hideTitle}
      description={copy.remove.hideBody(renderStrong)}
      confirm={{
        label: copy.remove.hideConfirm,
        busyLabel: copy.remove.hideBusy,
        isBusy: status.kind === "busy",
        onPress: confirm,
      }}
      cancel={{ label: copy.remove.cancel, onPress: onClose }}
      returnFocusFallbackRef={returnFocusRef}
    >
      <RemoveFailureNotice status={status} />
    </AccountDialog>
  );
}
