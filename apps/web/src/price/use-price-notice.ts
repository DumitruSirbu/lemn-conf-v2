"use client";

import {
  isBuiltInAccessoryId,
  isDesignId,
} from "@lemnaria/configurator-domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { useContent } from "@/i18n/use-content";
import type {
  PriceNoticeWire,
  PriceStampWire,
  RemovedAccessoryWire,
} from "@/price-dashboard/price-dashboard-wire-contract";
import {
  useConfiguratorStore,
  type WriteAccess,
} from "@/store/configurator-store";

import {
  FETCHING_PRICE_NOTICE_CLIENT,
  type NoticeRead,
} from "./price-notice-client";
import { usePriceBookRoot } from "./price-book-provider";
import type { ActivePriceBook, PriceBookRoot } from "./price-book-root";

// The one reader of `GET /api/designs/{id}/price-notice` (ADR 0178 A-11). Everything that wants the answer, C1 today and
// the sent-kitchen note and the replacement sheet after it, reads it from here, because each `GET` spends a limiter
// token and may write the design's first marker.
//
// **"Once per open" means once per mount of the editor for a design.** The effect is latched on a ref, which a dev-mode
// double effect keeps, so strict mode sends one request. A language switch remounts the screen and asks again; that is
// harmless, since the marker is written at most once and the answer is judged afresh.

interface HeldAnswer {
  readonly designId: string;
  readonly read: NoticeRead;
  /** Set when the route has recorded the pair. A refusal or a failure leaves the notice on screen: nothing was written. */
  readonly hasAcknowledged: boolean;
}

/** What C1 says: the prices sentence if the prices moved, and the names of the accessories the kitchen no longer has. */
export interface PriceNoticeBanner {
  readonly pricesChanged: boolean;
  readonly accessoryNames: readonly string[];
}

export interface PriceNotice {
  /** The route's answer for this design, when it gave one; nothing for a refusal, a failure or a call never made. */
  readonly answer: PriceNoticeWire | undefined;
  /** Both arms carry it; `false` where there is no answer, which is also what a kitchen not yet sent reads. */
  readonly isSent: boolean;
  /** C1, when it is to be shown. */
  readonly banner: PriceNoticeBanner | undefined;
  /** Records the pair this page displayed. Sends once per open, however often it is pressed. */
  readonly acknowledge: () => void;
}

export function usePriceNotice({ isOwner }: { isOwner: boolean }): PriceNotice {
  const root = usePriceBookRoot();
  const content = useContent();
  const designId = useConfiguratorStore((state) => state.designId);
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const [held, setHeld] = useState<HeldAnswer | undefined>();
  const askedFor = useRef<string | undefined>(undefined);
  const acknowledgedFor = useRef<string | undefined>(undefined);
  const askableId = askableDesignId({ isOwner, designId, canWrite, root });

  useEffect(() => {
    if (askableId === undefined || askedFor.current === askableId) return;
    askedFor.current = askableId;
    void FETCHING_PRICE_NOTICE_CLIENT.read(askableId).then((read) => {
      setHeld({ designId: askableId, read, hasAcknowledged: false });
    });
  }, [askableId]);

  const answer =
    held !== undefined &&
    held.designId === designId &&
    held.read.kind === "notice"
      ? held.read.notice
      : undefined;
  const displayed = displayedPairOf(root);
  const nameOf = (accessory: RemovedAccessoryWire): string | undefined =>
    nameOfRemoved(accessory, root, content.bookText);

  const hideNoticeFor = useCallback((acknowledgedDesignId: string) => {
    setHeld((previous) =>
      previous?.designId === acknowledgedDesignId
        ? { ...previous, hasAcknowledged: true }
        : previous,
    );
  }, []);

  const acknowledge = useCallback(() => {
    if (answer === undefined || displayed === undefined) return;
    if (acknowledgedFor.current === designId || designId === null) return;
    // Latched before the request, so a second press while it is in flight sends nothing.
    acknowledgedFor.current = designId;
    void FETCHING_PRICE_NOTICE_CLIENT.acknowledge(designId, displayed).then(
      (outcome) => {
        if (outcome.kind === "acknowledged") hideNoticeFor(designId);
        // A failure wrote nothing that anyone can vouch for, so a press may try again; a refusal of the route's own
        // word (the pair is unknown or ahead of the head) will not change by asking again, and the latch stays.
        if (outcome.kind === "failed") acknowledgedFor.current = undefined;
      },
    );
  }, [answer, displayed, designId, hideNoticeFor]);

  const isShown = held?.hasAcknowledged !== true;
  return {
    answer,
    isSent: answer?.isSent ?? false,
    banner: isShown ? bannerOf({ answer, displayed, nameOf }) : undefined,
    acknowledge,
  };
}

/** The design to ask about, or nothing where the call must not be made: not the owner's screen (the share view mounts the
 *  same one), no settled write access (`"checking"` and a failed check both read as not yet), no saved design of a real
 *  id (the share view's sentinel is shorter than any), or no book to judge a price against. */
export function askableDesignId({
  isOwner,
  designId,
  canWrite,
  root,
}: {
  readonly isOwner: boolean;
  readonly designId: string | null;
  readonly canWrite: WriteAccess;
  readonly root: PriceBookRoot;
}): string | undefined {
  if (!isOwner || canWrite !== true || root.kind !== "active") return undefined;
  return designId !== null && isDesignId(designId) ? designId : undefined;
}

/** The pair this page prices under, which is what an acknowledgement records (never the answer's `current`). */
export function displayedPairOf(
  root: PriceBookRoot,
): PriceStampWire | undefined {
  return root.kind === "active" ? stampOfRoot(root) : undefined;
}

function stampOfRoot(root: ActivePriceBook): PriceStampWire {
  return {
    versionId: root.versionId,
    availabilityRevision: root.availability.revision,
  };
}

/**
 * C1 stands alone: the active arm, nothing to replace (a replacement is C4's sheet, which carries the sentence itself),
 * and something to say, the prices or an accessory taken out. On a stale page (the answer's `current` is not the pair
 * this page displays) it says nothing, and so acknowledges nothing: the next open compares again.
 */
export function bannerOf({
  answer,
  displayed,
  nameOf,
}: {
  readonly answer: PriceNoticeWire | undefined;
  readonly displayed: PriceStampWire | undefined;
  readonly nameOf: (accessory: RemovedAccessoryWire) => string | undefined;
}): PriceNoticeBanner | undefined {
  if (answer?.kind !== "active-version" || displayed === undefined) {
    return undefined;
  }
  if (!isSameStamp(answer.current, displayed)) return undefined;
  if (answer.replacementsRequired.length > 0) return undefined;
  const { pricesChanged } = answer;
  // Two accessories that read alike are said once: the line would be the same word twice.
  const accessoryNames = [
    ...new Set(
      answer.removedAccessories.flatMap((accessory) => {
        const name = nameOf(accessory);
        return name === undefined ? [] : [name];
      }),
    ),
  ];
  // An accessory with no name to say is left out, never shown by its id; with nothing else to say there is no notice.
  if (!pricesChanged && accessoryNames.length === 0) return undefined;
  return { pricesChanged, accessoryNames };
}

/**
 * What a removed accessory is called. A built-in is named from the book's own row through its message, as the breakdown
 * names it; a linked one by the `authoredName` the answer carries. One with neither has no name.
 */
function nameOfRemoved(
  { accessoryId, authoredName }: RemovedAccessoryWire,
  root: PriceBookRoot,
  bookText: (authored: string, key: string | undefined) => string,
): string | undefined {
  if (root.kind === "active" && isBuiltInAccessoryId(accessoryId)) {
    const { name, nameKey } = root.book.accessories[accessoryId];
    return bookText(name, nameKey);
  }
  return authoredName;
}

function isSameStamp(one: PriceStampWire, other: PriceStampWire): boolean {
  return (
    one.versionId === other.versionId &&
    one.availabilityRevision === other.availabilityRevision
  );
}
