"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isItemStated,
  type CatalogueAvailability,
  type DeletableItemRef,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import { orFailed } from "./async-seams";
import {
  afterSwitch,
  blockedFlowAfterRefusalOf,
  CLOSED,
  deactivateFlowOf,
  deletionFlowOf,
  deletionSettlementOf,
  draftOnlyDeletionFlowOf,
  FAILED,
  usageStandOf,
  type DeletionSettlement,
  type ItemFailure,
  type ItemFlow,
} from "./item-flows";
import type {
  AvailabilityOutcome,
  ItemLifecycleClient,
  UsageRead,
} from "./item-lifecycle-client";
import {
  deleteStandOf,
  switchStandOf,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { FieldWriteResult } from "./use-price-draft";

// Switching an item on or off, and deleting one, as a screen runs them. Switching applies at once and is never a draft
// change; deleting is a draft change, so the screen hands in the write. Before a switch-off or a deletion is offered
// the saved kitchens that use the item are counted, one request for the dialog, and a count that cannot be had is said
// so and never read as none; nor is one had for an item the book does not state. One dialog is open at a time, and an
// answer to a question the person has since closed or replaced is dropped.

export interface ItemAvailabilityDesk {
  /** What is switched off now, as the last answer left it. */
  readonly availability: CatalogueAvailability;
  readonly context: LifecycleContext;
  readonly flow: ItemFlow;
  readonly failure: ItemFailure | undefined;
  /** A confirmation is out. */
  readonly isBusy: boolean;
  /** The saved kitchens are being counted. */
  readonly isReading: boolean;
  /** The item whose saved kitchens are being counted; absent when none is. */
  readonly readingItem: ItemRef | undefined;
  readonly requestSwitch: (item: ItemRef) => void;
  readonly requestDeletion: (item: DeletableItemRef) => void;
  readonly confirm: () => void;
  readonly dismiss: () => void;
  /** From the dialog that forbids a deletion: the switch-off that is allowed instead. */
  readonly deactivateInstead: () => void;
}

export interface ItemAvailabilityInput {
  /** What the screen's last whole-state read holds of what is switched off. It seeds the desk, and a later read
   *  replaces what the desk holds unless it names a revision the desk has already moved on from. */
  readonly observed: CatalogueAvailability;
  /** The active book: it states the items, and the group each is chosen from. */
  readonly book: PriceBook;
  readonly defaults: NewKitchenSettings | undefined;
  readonly client: ItemLifecycleClient;
  /** Puts the deletion of an item in the draft, or takes the item out of it where only the draft holds it. */
  readonly deleteFromDraft: (
    item: DeletableItemRef,
  ) => Promise<FieldWriteResult>;
  /**
   * Whether only the draft holds the item: nothing published names it, so no saved kitchen can use it and none is
   * counted.
   */
  readonly isDraftOnly: (item: DeletableItemRef) => boolean;
  /**
   * The draft as it is this moment, read in one piece, not as the screen last rendered it. A deletion that meets a
   * conflict is judged again on the draft the conflict read, which is not rendered yet when the answer is awaited. A
   * host with no draft of its own leaves it out, and the rendered book and `isDraftOnly` are judged by.
   */
  readonly readDraftNow?: () => DraftFactsNow;
}

/** What one reading of the draft says: which revision it is, the active book it sits on, and which rows only it holds. */
export interface DraftFactsNow {
  readonly revision: string;
  readonly book: PriceBook;
  readonly isDraftOnly: (item: DeletableItemRef) => boolean;
}

/** A deletion that was sent, and what is needed to judge it again if its answer says the facts have moved. */
interface DeletionAttempt {
  readonly item: DeletableItemRef;
  /** Whether the person has asked for something else since the deletion was sent. */
  readonly hasMoved: () => boolean;
  /** The draft revision the deletion was sent against; absent where the host reads no draft. */
  readonly draftRevisionSent: string | undefined;
}

const UNREADABLE_USAGE: UsageRead = { kind: "unavailable" };
const FAILED_OUTCOME: AvailabilityOutcome = { kind: "failed" };

export function useItemAvailability({
  observed,
  book,
  defaults,
  client,
  deleteFromDraft,
  isDraftOnly,
  readDraftNow,
}: ItemAvailabilityInput): ItemAvailabilityDesk {
  const [availability, setAvailability] = useState(observed);
  const [flow, setFlow] = useState<ItemFlow>(CLOSED);
  const [failure, setFailure] = useState<ItemFailure | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [readingItem, setReadingItem] = useState<ItemRef | undefined>(
    undefined,
  );
  const availabilityRef = useRef(availability);
  const leftBehindRef = useRef<ReadonlySet<string>>(new Set());
  const observedRef = useRef(observed);
  const isSendingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const context = useMemo<LifecycleContext>(
    () => ({
      book,
      availability,
      defaults,
      canWrite: client.canWrite,
      canDeleteStatedItems: client.canDeleteStatedItems,
      isCreatedInDraft: isDraftOnly,
    }),
    [
      book,
      availability,
      defaults,
      client.canWrite,
      client.canDeleteStatedItems,
      isDraftOnly,
    ],
  );
  // A count is asked by a callback that closed over the book of its own render. The ref holds the latest book, so the
  // answer is judged against the book of the moment it arrives.
  const bookRef = useRef(book);
  useEffect(() => {
    bookRef.current = book;
  }, [book]);
  const countingRef = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      countingRef.current?.abort();
    },
    [],
  );

  /** Takes what is switched off as it now stands, and remembers the revision it replaces: a later read of the draft
   *  that still names a revision left behind is an older read, and leaves a newer switch alone. */
  const adopt = useCallback((next: CatalogueAvailability) => {
    const held = availabilityRef.current.revision;
    const leftBehind = new Set(leftBehindRef.current);
    leftBehind.delete(next.revision);
    if (held !== next.revision) leftBehind.add(held);
    leftBehindRef.current = leftBehind;
    availabilityRef.current = next;
    setAvailability(next);
  }, []);

  useEffect(() => {
    if (observedRef.current === observed) return;
    observedRef.current = observed;
    if (!leftBehindRef.current.has(observed.revision)) adopt(observed);
  }, [observed, adopt]);

  const readAvailabilityAgain = useCallback(async () => {
    const fresh = await orFailed(() => client.readAvailability(), undefined);
    if (fresh !== undefined) adopt(fresh);
  }, [client, adopt]);

  const moveOn = useCallback(() => {
    countingRef.current?.abort();
    markMoved();
    setReadingItem(undefined);
    setFailure(undefined);
  }, [markMoved]);

  /** The count of an item the book states, asked and answered under the book as it stands. A book that no longer states
   *  the item leaves nothing to say of it, and a reader that counted it anyway is not believed. */
  const readUsageOfStatedItem = useCallback(
    async (item: ItemRef, signal: AbortSignal): Promise<UsageRead> => {
      if (!isItemStated(item, bookRef.current)) return UNREADABLE_USAGE;
      const read = await orFailed(
        () => client.readUsage([item], signal),
        UNREADABLE_USAGE,
      );
      return isItemStated(item, bookRef.current) ? read : UNREADABLE_USAGE;
    },
    [client],
  );

  const openAfterCounting = useCallback(
    async (item: ItemRef, flowOf: (read: UsageRead) => ItemFlow) => {
      const hasMoved = begin();
      countingRef.current?.abort();
      const unwanted = new AbortController();
      countingRef.current = unwanted;
      setReadingItem(item);
      const read = await readUsageOfStatedItem(item, unwanted.signal);
      if (hasMoved()) return;
      setReadingItem(undefined);
      setFlow(flowOf(read));
    },
    [readUsageOfStatedItem, begin],
  );

  const requestSwitch = useCallback(
    (item: ItemRef) => {
      moveOn();
      const stand = switchStandOf(item, context);
      switch (stand.kind) {
        case "off":
          return;
        case "last-active-option":
          setFlow({ kind: "last-active-option", item });
          return;
        case "enable":
          setFlow({ kind: "activate", item });
          return;
        case "disable":
          void openAfterCounting(item, (read) =>
            deactivateFlowOf({
              item,
              remaining: stand.remaining,
              usage: usageStandOf(read, item),
            }),
          );
      }
    },
    [context, moveOn, openAfterCounting],
  );

  /** The dialog a deletion opens under `facts`, which judge all of it: none where it is off, the draft-only one for a row
   *  the draft created (nothing to count), and the one drawn from a fresh count of the saved kitchens otherwise. */
  const openDeletionDialog = useCallback(
    async (item: DeletableItemRef, facts: LifecycleContext) => {
      if (deleteStandOf(item, facts).kind === "off") return;
      if (facts.isCreatedInDraft(item)) {
        setFlow(draftOnlyDeletionFlowOf(item));
        return;
      }
      await openAfterCounting(item, (read) =>
        deletionFlowOf(item, facts, read),
      );
    },
    [openAfterCounting],
  );

  const requestDeletion = useCallback(
    (item: DeletableItemRef) => {
      moveOn();
      void openDeletionDialog(item, context);
    },
    [context, moveOn, openDeletionDialog],
  );

  const settle = useCallback(
    async (outcome: AvailabilityOutcome, item: ItemRef, active: boolean) => {
      switch (outcome.kind) {
        case "set":
          adopt(afterSwitch(availabilityRef.current, item, active, outcome));
          setFlow(CLOSED);
          return;
        case "refused":
          setFailure({ kind: "refused", code: outcome.code });
          await readAvailabilityAgain();
          return;
        case "conflict":
          // The dialog was drawn from facts this read replaces, so it closes and the notice stays: asking again
          // counts again.
          setFailure({ kind: "conflict" });
          setFlow(CLOSED);
          await readAvailabilityAgain();
          return;
        case "session-ended":
          raiseStaffSessionExpired({ keepsTypedText: true });
          setFailure(FAILED);
          return;
        case "failed":
          setFailure(FAILED);
          return;
      }
    },
    [adopt, readAvailabilityAgain],
  );

  /** The draft as it is now, from the host's own reading where it has one. */
  const draftNow = useCallback(
    (): DraftFactsNow =>
      readDraftNow?.() ?? { revision: "", book, isDraftOnly },
    [readDraftNow, book, isDraftOnly],
  );

  /** The facts a recount judges by. The book and the rows the draft holds come from one reading of the draft, and
   *  what is switched off from what was last adopted: none of them waits for a render. */
  const factsOf = useCallback(
    (draftNowFacts: DraftFactsNow): LifecycleContext => {
      bookRef.current = draftNowFacts.book;
      return {
        book: draftNowFacts.book,
        availability: availabilityRef.current,
        defaults,
        canWrite: client.canWrite,
        canDeleteStatedItems: client.canDeleteStatedItems,
        isCreatedInDraft: draftNowFacts.isDraftOnly,
      };
    },
    [defaults, client],
  );

  /** The deletion's dialog is closed while the facts it was drawn from are read again, so no Delete is pressed on the
   *  old ones. A conflict means the draft has moved, so a draft that still names the revision sent was not read again:
   *  nothing is judged on it, and the failure is said. */
  const recountAfterConflict = useCallback(
    async (attempt: DeletionAttempt, answer: ItemFailure) => {
      setFlow(CLOSED);
      await readAvailabilityAgain();
      if (attempt.hasMoved()) return;
      const reading = draftNow();
      const isUnread =
        answer.kind === "conflict" &&
        attempt.draftRevisionSent !== undefined &&
        reading.revision === attempt.draftRevisionSent;
      if (isUnread) {
        setFailure(FAILED);
        return;
      }
      await openDeletionDialog(attempt.item, factsOf(reading));
    },
    [readAvailabilityAgain, draftNow, factsOf, openDeletionDialog],
  );

  const recountAfterUseRefusal = useCallback(
    async (item: DeletableItemRef) => {
      setFlow(CLOSED);
      const facts = factsOf(draftNow());
      await openAfterCounting(item, (read) =>
        blockedFlowAfterRefusalOf(item, facts, read),
      );
    },
    [draftNow, factsOf, openAfterCounting],
  );

  /**
   * What an answer to a deletion leaves of the screen. The dialog is modal while the write is out, so nothing can
   * overtake the answer before it arrives; only the recount reads that follow it wait on the network, and a request
   * made during them wins over what they would open.
   */
  const settleDeletion = useCallback(
    async (settlement: DeletionSettlement, attempt: DeletionAttempt) => {
      switch (settlement.kind) {
        case "wait":
          return;
        case "close":
          setFlow(CLOSED);
          return;
        case "fail":
          setFailure(settlement.failure);
          return;
        case "recount":
          setFailure(settlement.failure);
          await recountAfterConflict(attempt, settlement.failure);
          return;
        case "blocked-by-use":
          await recountAfterUseRefusal(attempt.item);
          return;
      }
    },
    [recountAfterConflict, recountAfterUseRefusal],
  );

  /** One confirmation at a time: a second press while one is out is not sent. */
  const sendOnce = useCallback(async (send: () => Promise<void>) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setIsBusy(true);
    setFailure(undefined);
    try {
      await send();
    } finally {
      isSendingRef.current = false;
      setIsBusy(false);
    }
  }, []);

  const switchTo = useCallback(
    (item: ItemRef, active: boolean) =>
      sendOnce(async () => {
        const outcome = await orFailed(
          () =>
            client.setActive({
              expectedRevision: availabilityRef.current.revision,
              item,
              active,
            }),
          FAILED_OUTCOME,
        );
        await settle(outcome, item, active);
      }),
    [client, sendOnce, settle],
  );

  const deleteItem = useCallback(
    (item: DeletableItemRef) =>
      sendOnce(async () => {
        const attempt: DeletionAttempt = {
          item,
          hasMoved: begin(),
          draftRevisionSent: readDraftNow?.().revision,
        };
        const result = await orFailed<FieldWriteResult>(
          () => deleteFromDraft(item),
          { kind: "failed" },
        );
        await settleDeletion(deletionSettlementOf(result), attempt);
      }),
    [deleteFromDraft, sendOnce, settleDeletion, begin, readDraftNow],
  );

  const dismiss = useCallback(() => {
    moveOn();
    setFlow(CLOSED);
  }, [moveOn]);

  const deactivateInstead = useCallback(() => {
    if (flow.kind !== "delete-blocked") return;
    const { item, count } = flow;
    const stand = switchStandOf(item, context);
    moveOn();
    if (stand.kind === "disable") {
      const { remaining } = stand;
      if (count === undefined) {
        void openAfterCounting(item, (read) =>
          deactivateFlowOf({
            item,
            remaining,
            usage: usageStandOf(read, item),
          }),
        );
        return;
      }
      setFlow(
        deactivateFlowOf({
          item,
          remaining,
          usage: { kind: "counted", count },
        }),
      );
    } else if (stand.kind === "last-active-option") {
      setFlow({ kind: "last-active-option", item });
    } else {
      setFlow(CLOSED);
    }
  }, [flow, context, moveOn, openAfterCounting]);

  const confirm = useCallback(() => {
    if (isBusy) return;
    switch (flow.kind) {
      case "deactivate":
        if (flow.usage.kind === "counted") void switchTo(flow.item, false);
        return;
      case "activate":
        void switchTo(flow.item, true);
        return;
      case "delete":
        if (flow.usage.kind === "counted") void deleteItem(flow.item);
        return;
      case "delete-blocked":
        deactivateInstead();
        return;
      case "last-active-option":
      case "closed":
        dismiss();
    }
  }, [flow, isBusy, switchTo, deleteItem, deactivateInstead, dismiss]);

  return {
    availability,
    context,
    flow,
    failure,
    isBusy,
    isReading: readingItem !== undefined,
    readingItem,
    requestSwitch,
    requestDeletion,
    confirm,
    dismiss,
    deactivateInstead,
  };
}
