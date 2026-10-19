"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAccountKitCopy, useClaimDialogCopy } from "@/i18n/use-content";

import { AccountDialog, type AccountDialogProps } from "./account-dialog";
import {
  FormNotice,
  RateLimitNotice,
  renderStrong,
} from "./account-form-parts";
import type { Destination } from "./on-signed-in";
import { useClaim, type ClaimStatus } from "./use-claim";

// "Atașezi bucătăriile din acest browser?" (Lot 2 frames A18A to A18E). Opened by a sign-in that found designs this
// browser made before it, on the page that signed the person in, before that page leaves (plan P10). It names only how
// many: the server tells nothing else of them yet (plan O2).
//
// Claiming cannot be undone, so the dialog opens on "Nu acum" (the kit's `alertdialog` opening) and draws "Atașează" as
// the primary button the frame draws, not as the destructive one. Every way out of the question leaves for the kitchen
// the person came from, or else the client's list of kitchens, by a full document load, never a router action: the
// confirm page is a token page, whose address a router action would write back (Lot 1 review, criterion 15).
//
// It is drawn into the screen's `<main>`, as `AccountDialog` asks, so the card behind it goes inert.
//
// COUNT ONLY, and so not for production yet. It names how many kitchens, not which, because the server says no more: the
// owner's question O2 (plan lot 2) and its server wave S11 (names and dates, with the POST bound to what was shown)
// decide whether plan L14b criterion 5 is met. Until then a person confirms an act that cannot be undone without seeing
// what it attaches.

export interface ClaimDialogProps {
  /** Where both ways out of the question go: the kitchen the person came from, or the start of the configurator. */
  readonly destination: Destination;
  /** How many designs the sign-in said could be claimed. */
  readonly count: number;
}

/** Mount it only once there is something to ask about, which is after an interaction, so it is never server-rendered. */
export function ClaimDialog({ destination, count }: ClaimDialogProps) {
  return createPortal(
    <ClaimQuestion destination={destination} count={count} />,
    document.querySelector("main") ?? document.body,
  );
}

/** What both of the dialog's states share: it asks as an alertdialog, since the claim cannot be undone, and confirms in
 *  the primary colour, since attaching harms nothing. */
const CLAIM_DIALOG_KIND = {
  kind: "destructive",
  confirmTone: "primary",
  announcesTitleChange: true,
} as const satisfies Partial<AccountDialogProps>;

function ClaimQuestion({ destination, count }: ClaimDialogProps) {
  const copy = useClaimDialogCopy();
  const { status, claim, leave } = useClaim(destination);
  const warningId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isClaimed = status.kind === "claimed";
  const claimedConfirmLabel = isHeadedForKitchens(destination)
    ? copy.openKitchens
    : copy.continueOn;
  // The cancel button leaves with the question, and focus must not be left on nothing: the one that stays takes it.
  useEffect(() => {
    if (isClaimed) confirmRef.current?.focus();
  }, [isClaimed]);
  // Both states are this one dialog, and so are built here as elements rather than as components of their own: a
  // different component type at this position would remount it, and focus would be returned to the opener and lost.
  return status.kind === "claimed" ? (
    <AccountDialog
      {...CLAIM_DIALOG_KIND}
      title={copy.claimedTitle(status.count, renderDecorativeMark)}
      confirm={{
        label: claimedConfirmLabel,
        busyLabel: claimedConfirmLabel,
        isBusy: false,
        onPress: leave,
      }}
      confirmRef={confirmRef}
      dismiss={leave}
    />
  ) : (
    <AccountDialog
      {...CLAIM_DIALOG_KIND}
      title={copy.title}
      description={copy.question(count, renderStrong)}
      alsoDescribedById={warningId}
      confirm={{
        label: copy.confirm,
        busyLabel: copy.busy,
        isBusy: status.kind === "busy",
        onPress: claim,
      }}
      confirmRef={confirmRef}
      cancel={{ label: copy.cancel, onPress: leave }}
    >
      <FormNotice id={warningId} tone="warning">
        {copy.warning}
      </FormNotice>
      <RefusalNotice status={status} />
    </AccountDialog>
  );
}

/** Leaving lands on the list of kitchens unless the person came from a kitchen, which is where they go back to: only
 *  then may the button say it opens the list. */
function isHeadedForKitchens({ returnPath }: Destination): boolean {
  return returnPath === undefined;
}

/** The check mark is for the eye: the sentence beside it says the same. */
function renderDecorativeMark(chunks: ReactNode): ReactNode {
  return <span aria-hidden="true">{chunks}</span>;
}

/** What the last attempt left under the warning: nothing before one and while it is out, the server's refusal or the
 *  dropped connection after. */
function RefusalNotice({ status }: { readonly status: ClaimStatus }) {
  const kit = useAccountKitCopy();
  switch (status.kind) {
    case "rate-limited":
      return <RateLimitNotice notice={status.notice} />;
    case "unavailable":
      return (
        <FormNotice tone="error" title={kit.unavailable.title}>
          {kit.unavailable.body}
        </FormNotice>
      );
    case "offline":
      return (
        <FormNotice tone="error" title={kit.offline.title}>
          {kit.offline.body}
        </FormNotice>
      );
    case "asking":
    case "busy":
    case "claimed":
      return null;
  }
}
