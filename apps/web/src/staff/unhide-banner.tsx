"use client";

import { useId, useMemo, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import { AccountDialog } from "@/account/account-dialog";
import {
  FormNotice,
  RateLimitNotice,
  fullWaitOfFeedback,
  useSecondsUntil,
} from "@/account/account-form-parts";
import {
  useAccountKitCopy,
  useStaffActionsCopy,
  useStaffKitchenCopy,
} from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import type { UnhideAction, UnhideFailure } from "./use-unhide";

// A kitchen its client hid is still read by staff, and either role may make it visible to the client again (frames S3D and
// S3E). The question opens on its cancel and confirms in the primary colour, because nothing is deleted.

export interface HiddenBannerProps {
  readonly unhide: UnhideAction;
  /** Where focus goes when the button is gone by the time the question closes, which is when the act worked. */
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

export function HiddenBanner({
  unhide,
  returnFocusFallbackRef,
}: HiddenBannerProps) {
  const kitchen = useStaffKitchenCopy();
  const copy = useStaffActionsCopy();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeFocusRef = useMemo(
    () => ({
      // Read when the question closes: the button while it is still there (a browser that does not focus a pressed button
      // names no opener), else the heading, which is where focus goes once the act has taken the banner away.
      get current(): HTMLElement | null {
        return buttonRef.current ?? returnFocusFallbackRef.current;
      },
    }),
    [returnFocusFallbackRef],
  );
  return (
    <div
      role="status"
      className={styles.banner}
      data-testid="staff-kitchen-hidden-banner"
    >
      <span className={styles.bannerMark} aria-hidden="true" />
      <span className={styles.bannerText}>{kitchen.hiddenBanner}</span>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bannerButton}
        aria-haspopup="dialog"
        onClick={unhide.openDialog}
      >
        {copy.unhide.action}
      </button>
      {unhide.isDialogOpen ? (
        <UnhideDialog unhide={unhide} returnFocusFallbackRef={closeFocusRef} />
      ) : null}
    </div>
  );
}

/** Drawn into the frame's `<main>`, as the dialog asks, so the rest of the page goes inert; mounted only after a press,
 *  so it is never part of the server's page. */
function UnhideDialog({ unhide, returnFocusFallbackRef }: HiddenBannerProps) {
  const copy = useStaffActionsCopy();
  const shareNoteId = useId();
  const isOff = useIsWaitingOut(unhide.failure);
  return createPortal(
    <AccountDialog
      kind="destructive"
      confirmTone="primary"
      title={copy.unhide.title}
      description={copy.unhide.body}
      alsoDescribedById={shareNoteId}
      confirm={{
        label: copy.unhide.confirm,
        busyLabel: copy.unhide.busy,
        isBusy: unhide.isBusy,
        isOff,
        onPress: unhide.confirm,
      }}
      cancel={{ label: copy.unhide.cancel, onPress: unhide.closeDialog }}
      returnFocusFallbackRef={returnFocusFallbackRef}
    >
      <FormNotice id={shareNoteId} tone="info">
        {copy.unhide.shareNote}
      </FormNotice>
      <UnhideFailureNotice failure={unhide.failure} />
    </AccountDialog>,
    document.querySelector("main") ?? document.body,
  );
}

/** Whether a limit the last confirmation met is still being waited out: the confirmation is off for it, and wakes by itself
 *  at the end of it without sending anything. */
function useIsWaitingOut(failure: UnhideFailure | undefined): boolean {
  const wait = failure === undefined ? undefined : fullWaitOfFeedback(failure);
  return useSecondsUntil(wait?.endsAtMs) > 0;
}

/** A limit stands in a status region mounted with the dialog; the other failures are alerts. */
function UnhideFailureNotice({
  failure,
}: {
  readonly failure: UnhideFailure | undefined;
}) {
  const copy = useStaffActionsCopy();
  const kit = useAccountKitCopy();
  return (
    <>
      <div role="status" className={styles.liveRegion}>
        {failure?.kind === "rate-limited" ? (
          <RateLimitNotice notice={failure.notice} isInLiveRegion />
        ) : null}
      </div>
      {failure?.kind === "forbidden" ? (
        <FormNotice tone="error">{copy.unhide.forbiddenBody}</FormNotice>
      ) : null}
      {failure?.kind === "failed" ? (
        <FormNotice tone="error" title={kit.unavailable.title}>
          {kit.unavailable.body}
        </FormNotice>
      ) : null}
    </>
  );
}

/**
 * What the page says once the banner is gone. The region is mounted before there is anything to say, so it is announced when
 * its words arrive; a region that appears together with its words is not reliably announced.
 */
export function UnhideAnnouncement({
  announcement,
}: {
  readonly announcement: UnhideAction["announcement"];
}) {
  const copy = useStaffActionsCopy();
  const sentences = {
    done: copy.unhide.done,
    "was-visible": copy.unhide.notHiddenUnread,
    "was-visible-reread": copy.unhide.notHidden,
    gone: copy.unhide.gone,
  } as const;
  return (
    <div
      role="status"
      className={
        announcement === undefined ? styles.liveRegion : styles.announcement
      }
      data-testid="staff-kitchen-unhide-announcement"
    >
      {announcement === undefined ? null : sentences[announcement]}
    </div>
  );
}
