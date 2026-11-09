"use client";

import {
  isBuiltInAccessoryId,
  isDesignId,
  type ReplacementRequired,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
import {
  hasReplacementSaveLanded,
  pendingReplacements,
  type ReplacementKind,
} from "./replacement-sheet-model";

// The one reader of `GET /api/designs/{id}/price-notice` (ADR 0178 A-11). Everything that wants the answer, C1 today and
// the sent-kitchen note and the replacement sheet after it, reads it from here, because each `GET` spends a limiter
// token and may write the design's first marker.
//
// **"Once per open" means once per mount of the editor for a design.** The effect is latched on a ref, which a dev-mode
// double effect keeps, so strict mode sends one request. A language switch remounts the screen and asks again; that is
// harmless, since the marker is written at most once and the answer is judged afresh.

const NO_REPLACEMENTS: readonly ReplacementRequired[] = [];

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

/** One item the customer replaced in the sheet, named for the confirmation. Two items of one kind are two changes: the
 *  kitchen's colour and a cabinet's own are both reachable, so the confirmation is keyed by `itemKey` and not by `kind`. */
export interface ReplacementChange {
  /** The replaced item, as `replacedItemKey` says it: the kind and the id. */
  readonly itemKey: string;
  readonly kind: ReplacementKind;
  readonly name: string;
}

/** The last choice, handed over for the hook to wait on: the revision the store stood at when it was applied, what was
 *  changed, and the colour a material change returned the kitchen to, for the confirmation to say. */
export interface AwaitedReplacement {
  readonly revisionAtChoice: DesignRevision | null;
  readonly changes: readonly ReplacementChange[];
  readonly revertedColour?: string | undefined;
}

/** What the sheet's flow ends in. `alsoUpdated` is true exactly when the second `GET` said the prices moved, and
 *  `accessoryNames` are accessories that answer names which the sheet never showed. */
export interface ReplacementOutcome {
  readonly changes: readonly ReplacementChange[];
  readonly revertedColour: string | undefined;
  readonly accessoryNames: readonly string[];
  readonly alsoUpdated: boolean;
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
  /** What the kitchen must replace before it has a price, live from the store and the page's availability. **Empty
   *  wherever the sheet may not open**, which is the `GET`'s own gate (the owner's screen, write access settled to `true`,
   *  a real design id, an active book): the share view mounts the same screen, so the sheet cannot rely on the `GET`'s
   *  gate having stopped it, and it holds this one. */
  readonly owedReplacements: readonly ReplacementRequired[];
  /** The accessories the kitchen lost that this page can name, for the sheet's information rows. */
  readonly removedAccessoryNames: readonly string[];
  /** After the last choice: waits for that choice's save to land, asks again, carries the prices sentence if and only if
   *  the new answer says the prices moved, then acknowledges the displayed pair. */
  readonly awaitReplacementSave: (replacement: AwaitedReplacement) => void;
  /** The confirmation, once the flow has ended; the standalone notice is never drawn beside it. */
  readonly confirmation: ReplacementOutcome | undefined;
  readonly dismissConfirmation: () => void;
}

export function usePriceNotice({ isOwner }: { isOwner: boolean }): PriceNotice {
  const root = usePriceBookRoot();
  const content = useContent();
  const designId = useConfiguratorStore((state) => state.designId);
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const [held, setHeld] = useState<HeldAnswer | undefined>();
  const askedFor = useRef<string | undefined>(undefined);
  const acknowledgedFor = useRef<string | undefined>(undefined);
  const askableId = askableDesignId({ isOwner, designId, canWrite, root });
  const owedReplacements = useMemo(
    () =>
      askableId !== undefined && root.kind === "active"
        ? pendingReplacements(root, design, catalog)
        : NO_REPLACEMENTS,
    [askableId, root, design, catalog],
  );

  useEffect(() => {
    if (askableId === undefined || askedFor.current === askableId) return;
    askedFor.current = askableId;
    void FETCHING_PRICE_NOTICE_CLIENT.read(askableId).then((read) => {
      setHeld((previous) => heldAfterFirstAnswer(previous, askableId, read));
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

  // Takes the answer to vouch for as an argument. The sheet's flow asks again and acknowledges what the *new* answer
  // vouches for; a callback closed over this render's `answer` would judge the first one, or none if that failed.
  const acknowledgeAgainst = useCallback(
    (vouching: PriceNoticeWire | undefined) => {
      // Callers other than the banner (the sheet, the sent note) reach this too, so the stale-page rule is held here
      // and not only in what the banner shows: a pair the answer does not vouch for is never recorded.
      if (vouching?.kind !== "active-version" || displayed === undefined)
        return;
      if (!isSameStamp(vouching.current, displayed)) return;
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
    },
    [displayed, designId, hideNoticeFor],
  );

  const acknowledge = useCallback(() => {
    acknowledgeAgainst(answer);
  }, [acknowledgeAgainst, answer]);

  const removedAccessoryNames = removedAccessoryNamesOf({
    answer,
    displayed,
    nameOf,
  });
  const awaited = useAwaitedReplacement({
    askableId,
    displayed,
    nameOf,
    shownAccessoryNames: removedAccessoryNames,
    acknowledgeAgainst,
    setHeld,
  });

  const isShown = held?.hasAcknowledged !== true;
  return {
    answer,
    isSent: answer?.isSent ?? false,
    banner: isShown ? bannerOf({ answer, displayed, nameOf }) : undefined,
    acknowledge,
    owedReplacements,
    removedAccessoryNames,
    ...awaited,
  };
}

/**
 * The sheet's flow after the last choice. It waits on the store and not on `saveStatus`: the revision must have moved past
 * the one held when the choice was applied **and** the design on screen must be the one the server confirmed. Only then is
 * the `GET` asked again: before that the active side may still refuse, and the answer would judge the old design. There is
 * no timeout. A save that never lands (a conflict, a limit, a refusal) never confirms and never acknowledges, and the next
 * open judges afresh.
 */
function useAwaitedReplacement({
  askableId,
  displayed,
  nameOf,
  shownAccessoryNames,
  acknowledgeAgainst,
  setHeld,
}: {
  readonly askableId: string | undefined;
  readonly displayed: PriceStampWire | undefined;
  readonly nameOf: (accessory: RemovedAccessoryWire) => string | undefined;
  readonly shownAccessoryNames: readonly string[];
  readonly acknowledgeAgainst: (answer: PriceNoticeWire | undefined) => void;
  readonly setHeld: Dispatch<SetStateAction<HeldAnswer | undefined>>;
}): Pick<
  PriceNotice,
  "awaitReplacementSave" | "confirmation" | "dismissConfirmation"
> {
  const revision = useConfiguratorStore((state) => state.revision);
  const isEverythingSaved = useConfiguratorStore(
    (state) => state.design === state.savedDesign,
  );
  const [awaited, setAwaited] = useState<AwaitedReplacement | undefined>();
  const [confirmation, setConfirmation] = useState<
    ReplacementOutcome | undefined
  >();

  useEffect(() => {
    if (awaited === undefined) return;
    const hasLanded = hasReplacementSaveLanded({
      revisionAtChoice: awaited.revisionAtChoice,
      revision,
      isEverythingSaved,
    });
    if (!hasLanded) return;
    // Latched before the request: this effect runs again on every change of the store while the answer is awaited.
    setAwaited(undefined);
    void askAgainAndConfirm({
      awaited,
      askableId,
      displayed,
      nameOf,
      shownAccessoryNames,
      acknowledgeAgainst,
      setHeld,
      setConfirmation,
    });
  }, [
    awaited,
    revision,
    isEverythingSaved,
    askableId,
    displayed,
    nameOf,
    shownAccessoryNames,
    acknowledgeAgainst,
    setHeld,
  ]);

  const dismissConfirmation = useCallback(() => {
    setConfirmation(undefined);
  }, []);
  return {
    awaitReplacementSave: setAwaited,
    confirmation,
    dismissConfirmation,
  };
}

async function askAgainAndConfirm({
  awaited,
  askableId,
  displayed,
  nameOf,
  shownAccessoryNames,
  acknowledgeAgainst,
  setHeld,
  setConfirmation,
}: {
  readonly awaited: AwaitedReplacement;
  readonly askableId: string | undefined;
  readonly displayed: PriceStampWire | undefined;
  readonly nameOf: (accessory: RemovedAccessoryWire) => string | undefined;
  readonly shownAccessoryNames: readonly string[];
  readonly acknowledgeAgainst: (answer: PriceNoticeWire | undefined) => void;
  readonly setHeld: Dispatch<SetStateAction<HeldAnswer | undefined>>;
  readonly setConfirmation: (confirmation: ReplacementOutcome) => void;
}): Promise<void> {
  const read =
    askableId === undefined
      ? undefined
      : await FETCHING_PRICE_NOTICE_CLIENT.read(askableId);
  const fresh = read?.kind === "notice" ? read.notice : undefined;
  if (askableId !== undefined && read !== undefined) {
    // Held as already acknowledged: the confirmation says what C1 would, so C1 must not flash up between this answer and
    // the acknowledgement landing.
    setHeld((previous) => heldAfterAskingAgain(previous, askableId, read));
  }
  // An accessory is acknowledged only once it has been said: the sheet showed the first answer's, and this answer's other
  // names are said here, so the marker never moves past one the customer was not told about.
  const unshownNames = removedAccessoryNamesOf({
    answer: fresh,
    displayed,
    nameOf,
  }).filter((name) => !shownAccessoryNames.includes(name));
  setConfirmation({
    changes: awaited.changes,
    revertedColour: awaited.revertedColour,
    accessoryNames: unshownNames,
    alsoUpdated: pricesMovedOnThisPage(fresh, displayed),
  });
  if (isFullyResolved(fresh)) acknowledgeAgainst(fresh);
}

/**
 * What is held when the first answer arrives. A first answer never replaces a newer one held for this design (the sheet's
 * flow may have asked again), except a failed read: that held nothing to say, so the first answer takes its place and keeps
 * its acknowledged state.
 */
function heldAfterFirstAnswer(
  previous: HeldAnswer | undefined,
  designId: string,
  read: NoticeRead,
): HeldAnswer {
  if (previous?.designId !== designId) {
    return { designId, read, hasAcknowledged: false };
  }
  return previous.read.kind === "notice" ? previous : { ...previous, read };
}

/**
 * What is held once the sheet's flow has asked again. A failed second ask (a limit, a `404`, the network) must not wipe the
 * first answer: `isSent` and the accessory names are read from it, and the sent-kitchen note would vanish. Only an answer
 * replaces it. Either way the notice counts as shown, for the reason `askAgainAndConfirm` gives.
 */
function heldAfterAskingAgain(
  previous: HeldAnswer | undefined,
  designId: string,
  read: NoticeRead,
): HeldAnswer {
  const keepsEarlierAnswer =
    read.kind !== "notice" && previous?.designId === designId;
  return {
    designId,
    read: keepsEarlierAnswer ? previous.read : read,
    hasAcknowledged: true,
  };
}

/** An answer with nothing left to replace: acknowledging a pair while a replacement is owed would hide the sheet's reason. */
function isFullyResolved(answer: PriceNoticeWire | undefined): boolean {
  return (
    answer?.kind === "active-version" &&
    answer.replacementsRequired.length === 0
  );
}

/** The merged sentence's one condition: the answer is for the pair this page displays, and says the prices moved. */
function pricesMovedOnThisPage(
  answer: PriceNoticeWire | undefined,
  displayed: PriceStampWire | undefined,
): boolean {
  if (answer?.kind !== "active-version" || displayed === undefined) {
    return false;
  }
  return isSameStamp(answer.current, displayed) && answer.pricesChanged;
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
 * C1 stands alone: the active arm, nothing to replace (a replacement is the replacement sheet's, which carries the sentence itself),
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
  const accessoryNames = removedAccessoryNamesOf({ answer, displayed, nameOf });
  // An accessory with no name to say is left out, never shown by its id; with nothing else to say there is no notice.
  if (!pricesChanged && accessoryNames.length === 0) return undefined;
  return { pricesChanged, accessoryNames };
}

/**
 * The names of the accessories the kitchen lost, for C1's lines and the sheet's information rows. Nothing on a stale page,
 * for the reason C1 says nothing there: the answer is about a pair this page does not display.
 */
export function removedAccessoryNamesOf({
  answer,
  displayed,
  nameOf,
}: {
  readonly answer: PriceNoticeWire | undefined;
  readonly displayed: PriceStampWire | undefined;
  readonly nameOf: (accessory: RemovedAccessoryWire) => string | undefined;
}): readonly string[] {
  if (answer?.kind !== "active-version" || displayed === undefined) return [];
  if (!isSameStamp(answer.current, displayed)) return [];
  // Two accessories that read alike are said once: the line would be the same word twice.
  return [
    ...new Set(
      answer.removedAccessories.flatMap((accessory) => {
        const name = nameOf(accessory);
        return name === undefined ? [] : [name];
      }),
    ),
  ];
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
