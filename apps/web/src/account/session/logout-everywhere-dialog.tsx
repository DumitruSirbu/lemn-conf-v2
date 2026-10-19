"use client";

import type { RefObject } from "react";

import { useAccountKitCopy, useLogoutEverywhereCopy } from "@/i18n/use-content";

import { AccountDialog } from "../account-dialog";
import { FormNotice } from "../account-form-parts";
import {
  useSignOutEverywhere,
  type SignOutEverywhereStatus,
} from "./use-logout";

// "Ieși de pe toate dispozitivele?" (Lot 2 frames A14B, A14C, A14E, A14F). It is a destructive question, so it opens on
// "Anulează"; it stays that kind in every state, since a dialog that changed its role while open would be re-announced.
// Accepted disagreement with frame A14F, which draws the retry as a primary button: that would be this very role change.
// The frame also leaves the description out while offline; it stays, so the dialog does not change height when a retry
// goes busy. A success is not drawn here: the document leaves for the login page, where the notice is (A14D).
//
// Mount it as a direct child of the screen's `<main>`, as `AccountDialog` asks.

export interface LogoutEverywhereDialogProps {
  /** The way out: "Anulează", Escape and the scrim. */
  readonly onClose: () => void;
  /** Where focus goes when the control that opened the dialog has gone by the time it closes. */
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

export function LogoutEverywhereDialog({
  onClose,
  returnFocusFallbackRef,
}: LogoutEverywhereDialogProps) {
  const copy = useLogoutEverywhereCopy();
  const kit = useAccountKitCopy();
  const { status, confirm } = useSignOutEverywhere();
  const isOffline = status === "offline";

  return (
    <AccountDialog
      kind="destructive"
      title={copy.title}
      description={copy.description}
      confirm={{
        label: isOffline ? kit.retry : copy.confirm,
        busyLabel: copy.busy,
        isBusy: status === "busy",
        onPress: confirm,
      }}
      cancel={{ label: copy.cancel, onPress: onClose }}
      returnFocusFallbackRef={returnFocusFallbackRef}
    >
      <FailureNotice status={status} />
    </AccountDialog>
  );
}

/** What the last attempt left in the dialog: nothing before one and while it is out, the server's refusal or the dropped
 *  connection after. */
function FailureNotice({
  status,
}: {
  readonly status: SignOutEverywhereStatus;
}) {
  const copy = useLogoutEverywhereCopy();
  const kit = useAccountKitCopy();
  switch (status) {
    case "unavailable":
      return <FormNotice tone="error">{copy.unavailable}</FormNotice>;
    case "offline":
      return (
        <FormNotice tone="error" title={kit.offline.title}>
          {kit.offline.body}
        </FormNotice>
      );
    case "ready":
    case "busy":
      return null;
  }
}
