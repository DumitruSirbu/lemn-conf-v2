"use client";

import { useCallback, useState } from "react";

import type { SignedInOutcome } from "@/account/account-answer";
import { sendSignedInRequest } from "@/account/send-account-request";

import { raiseStaffSessionExpired } from "./staff-session-expiry";
import type { StaffKitchenWire } from "./staff-kitchens-wire-contract";
import {
  isWaitingOut,
  useOneWriteAtATime,
  writeFailureOf,
  type KitchenEditing,
  type WriteFailure,
} from "./use-one-write-at-a-time";

// Making a kitchen its client hid visible again (frames S3D and S3E). A press sends one request and never another by itself.
// The server's word that the kitchen is not hidden, or is gone, is applied to the page as it is said.

/** What the page says once the dialog has gone. `was-visible` and `gone` promise no re-read; `was-visible-reread` says the
 *  kitchen was read again, and is told only once the page shows that reading. */
export type UnhideAnnouncement =
  | "done"
  | "was-visible"
  | "was-visible-reread"
  | "gone";

/** A failure the dialog can stay open with: the one `404` closes it instead. */
export type UnhideFailure = Exclude<
  WriteFailure,
  { readonly kind: "kitchen-unavailable" }
>;

export interface UnhideAction {
  readonly isDialogOpen: boolean;
  readonly isBusy: boolean;
  /** Why the last confirmation did nothing; shown in the dialog, which stays open. */
  readonly failure: UnhideFailure | undefined;
  readonly announcement: UnhideAnnouncement | undefined;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly confirm: () => void;
}

export function useUnhide(
  designId: string,
  editing: KitchenEditing,
): UnhideAction {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<UnhideFailure>();
  const [announcement, setAnnouncement] = useState<UnhideAnnouncement>();
  const confirm = useConfirm(designId, editing, {
    setIsBusy,
    setIsDialogOpen,
    setAnnouncement,
    setFailure,
  });

  const openDialog = useCallback(() => {
    setFailure((current) =>
      current !== undefined && isWaitingOut(current) ? current : undefined,
    );
    setIsDialogOpen(true);
  }, []);
  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  return {
    isDialogOpen,
    isBusy,
    failure,
    announcement,
    openDialog,
    closeDialog,
    confirm,
  };
}

interface UnhideSetters {
  readonly setIsBusy: (isBusy: boolean) => void;
  readonly setIsDialogOpen: (isOpen: boolean) => void;
  readonly setAnnouncement: (announcement: UnhideAnnouncement) => void;
  readonly setFailure: (failure: UnhideFailure | undefined) => void;
}

/** One confirmation at a time; its answer closes the dialog, or keeps it open with the failure. */
function useConfirm(
  designId: string,
  editing: KitchenEditing,
  setters: UnhideSetters,
): () => void {
  const { setIsBusy, setIsDialogOpen, setFailure } = setters;
  const { begin, settle } = useOneWriteAtATime();
  const react = useResultReaction(editing, setters);
  return useCallback(() => {
    if (!begin()) return;
    setIsBusy(true);
    setFailure(undefined);
    void sendSignedInRequest({ flow: "staff-unhide", id: designId }).then(
      (outcome) => {
        setIsBusy(false);
        const result = unhideResultOf(outcome);
        settle(result.kind === "stays-open" ? result.failure : result);
        if (leavesTheDialog(result)) setIsDialogOpen(false);
        react(result);
      },
    );
  }, [begin, designId, react, setFailure, setIsBusy, setIsDialogOpen, settle]);
}

/** The dialog stays for a failure, and for a session that ended (it is the person's to go on with once signed in again). */
function leavesTheDialog(result: UnhideResult): boolean {
  return (
    result.kind === "unhidden" ||
    result.kind === "already-visible" ||
    result.kind === "gone"
  );
}

/** What the page shows for each way a confirmation can end. */
function useResultReaction(
  { edit, refresh }: KitchenEditing,
  { setAnnouncement, setFailure }: UnhideSetters,
): (result: UnhideResult) => void {
  return useCallback(
    (result) => {
      switch (result.kind) {
        case "unhidden":
          edit(withKitchenVisible);
          setAnnouncement("done");
          return;
        case "already-visible":
          edit(withKitchenVisible);
          setAnnouncement("was-visible");
          void refresh().then((isShown) => {
            if (isShown) setAnnouncement("was-visible-reread");
          });
          return;
        case "gone":
          setAnnouncement("gone");
          void refresh();
          return;
        case "session-ended":
          raiseStaffSessionExpired();
          return;
        case "stays-open":
          setFailure(result.failure);
      }
    },
    [edit, refresh, setAnnouncement, setFailure],
  );
}

type UnhideResult =
  | { readonly kind: "unhidden" }
  | { readonly kind: "already-visible" }
  | { readonly kind: "gone" }
  | { readonly kind: "session-ended" }
  | { readonly kind: "stays-open"; readonly failure: UnhideFailure };

function unhideResultOf(outcome: SignedInOutcome): UnhideResult {
  switch (outcome.kind) {
    case "succeeded":
      return { kind: "unhidden" };
    case "conflict-not-hidden":
      return { kind: "already-visible" };
    case "kitchen-unavailable":
      return { kind: "gone" };
    case "unauthenticated":
      return { kind: "session-ended" };
    default:
      return { kind: "stays-open", failure: staysOpenWith(outcome) };
  }
}

/** The one `404` has its own branch, so what is left is a failure the dialog can show. */
function staysOpenWith(outcome: SignedInOutcome): UnhideFailure {
  const failure = writeFailureOf(outcome);
  return failure.kind === "kitchen-unavailable" ? { kind: "failed" } : failure;
}

function withKitchenVisible(kitchen: StaffKitchenWire): StaffKitchenWire {
  return { ...kitchen, kitchen: { ...kitchen.kitchen, isHidden: false } };
}
