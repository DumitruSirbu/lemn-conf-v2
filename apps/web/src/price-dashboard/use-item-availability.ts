"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CatalogueAvailability,
  DeletableItemRef,
  ItemRef,
  NewKitchenSettings,
  PriceBook,
} from "@lemnaria/configurator-domain";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import { orFailed } from "./async-seams";
import {
  afterSwitch,
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
// change; deleting is a draft change, so the screen hands in the write. Before a switch-off or a deletion is offered the
// saved kitchens that use the item are counted, and a count that cannot be had is said so and never read as none. One
// dialog is open at a time, and an answer to a question the person has since closed or replaced is dropped.

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
  /** Whether only the draft holds the item: nothing published names it, so no saved kitchen can use it and none is counted. */
  readonly isDraftOnly: (item: DeletableItemRef) => boolean;
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
}: ItemAvailabilityInput): ItemAvailabilityDesk {
  const [availability, setAvailability] = useState(observed);
  const [flow, setFlow] = useState<ItemFlow>(CLOSED);
  const [failure, setFailure] = useState<ItemFailure | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const availabilityRef = useRef(availability);
  const leftBehindRef = useRef<ReadonlySet<string>>(new Set());
  const observedRef = useRef(observed);
  const isSendingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const context = useMemo<LifecycleContext>(
    () => ({ book, availability, defaults, canWrite: client.canWrite }),
    [book, availability, defaults, client.canWrite],
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
    markMoved();
    setIsReading(false);
    setFailure(undefined);
  }, [markMoved]);

  const openAfterCounting = useCallback(
    async (item: ItemRef, flowOf: (read: UsageRead) => ItemFlow) => {
      const hasMoved = begin();
      setIsReading(true);
      const read = await orFailed(
        () => client.readUsage([item]),
        UNREADABLE_USAGE,
      );
      if (hasMoved()) return;
      setIsReading(false);
      setFlow(flowOf(read));
    },
    [client, begin],
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

  const requestDeletion = useCallback(
    (item: DeletableItemRef) => {
      moveOn();
      if (deleteStandOf(item, context).kind === "off") return;
      if (isDraftOnly(item)) {
        setFlow(draftOnlyDeletionFlowOf(item));
        return;
      }
      void openAfterCounting(item, (read) =>
        deletionFlowOf(item, context, read),
      );
    },
    [context, moveOn, openAfterCounting, isDraftOnly],
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

  const settleDeletion = useCallback((settlement: DeletionSettlement) => {
    switch (settlement.kind) {
      case "wait":
        return;
      case "close":
        setFlow(CLOSED);
        return;
      case "fail":
        setFailure(settlement.failure);
        return;
      case "replace":
        setFlow(settlement.flow);
        return;
    }
  }, []);

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
        const result = await orFailed<FieldWriteResult>(
          () => deleteFromDraft(item),
          { kind: "failed" },
        );
        settleDeletion(deletionSettlementOf({ result, item, context }));
      }),
    [deleteFromDraft, sendOnce, settleDeletion, context],
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
    isReading,
    requestSwitch,
    requestDeletion,
    confirm,
    dismiss,
    deactivateInstead,
  };
}
