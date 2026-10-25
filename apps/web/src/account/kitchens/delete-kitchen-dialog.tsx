"use client";

import type { RefObject } from "react";

import { useAccountKitchensCopy } from "@/i18n/use-content";

import { AccountDialog } from "../account-dialog";
import type { ListedKitchen } from "./kitchens-answer";
import { RemoveFailureNotice } from "./remove-kitchen-parts";
import type { KitchenActions } from "./use-kitchen-actions";
import { useRemoveKitchen } from "./use-remove-kitchen";

// "Ștergi bucătăria?" (Lot 2 frames A9H). A destructive question, so it opens on "Anulează". Only a draft is deleted: the
// server answers a sent kitchen with `409`, and the card is then corrected to offer "Ascunde" instead.
//
// Mount it as a direct child of the screen's `<main>`, as `AccountDialog` asks.

export interface DeleteKitchenDialogProps {
  readonly kitchen: ListedKitchen;
  /** The name the card shows. */
  readonly kitchenName: string;
  readonly actions: KitchenActions;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function DeleteKitchenDialog({
  kitchen,
  kitchenName,
  actions,
  onClose,
  returnFocusRef,
}: DeleteKitchenDialogProps) {
  const copy = useAccountKitchensCopy();
  const { status, confirm } = useRemoveKitchen(
    () => actions.deleteDraft(kitchen),
    onClose,
  );

  return (
    <AccountDialog
      kind="destructive"
      title={copy.remove.deleteTitle(kitchenName)}
      description={copy.remove.deleteBody}
      confirm={{
        label: copy.remove.deleteConfirm,
        busyLabel: copy.remove.deleteBusy,
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
