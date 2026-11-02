"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  isSameItem,
  type AvailabilityRefusalCode,
  type CatalogueAvailability,
  type DeletableItemRef,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import { orFailed } from "./async-seams";
import type {
  AvailabilityOutcome,
  ItemLifecycleClient,
  UsageRead,
} from "./item-lifecycle-client";
import {
  countedDeletionOf,
  countOfUse,
  deleteStandOf,
  isItemOn,
  switchStandOf,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { FieldWriteResult } from "./use-price-draft";

// Switching an item on or off, and deleting one, as a screen runs them. Switching applies at once and is never a draft
// change; deleting is a draft change, so the screen hands in the write. Before a switch-off or a deletion is offered the
// saved kitchens that use the item are counted, and a count that cannot be had is said so and never read as none. One
// dialog is open at a time, and an answer to a question the person has since closed or replaced is dropped.

/** How many saved kitchens use the item, or that nobody could say. */
export type UsageStand =
  | { readonly kind: "counted"; readonly count: number }
  | { readonly kind: "unavailable" };

/** The dialog that is open, and the facts it is drawn from. */
export type ItemFlow =
  | { readonly kind: "closed" }
  | {
      readonly kind: "deactivate";
      readonly item: ItemRef;
      readonly remaining: readonly ItemRef[];
      readonly usage: UsageStand;
    }
  | { readonly kind: "last-active-option"; readonly item: ItemRef }
  | { readonly kind: "activate"; readonly item: ItemRef }
  | {
      readonly kind: "delete";
      readonly item: DeletableItemRef;
      readonly usage: UsageStand;
      /** Only the draft holds the item, so deleting it takes it back out of the draft and nothing is published. */
      readonly isDraftOnly: boolean;
    }
  | {
      readonly kind: "delete-blocked";
      readonly item: DeletableItemRef;
      readonly count: number;
      /** Customers are offered the item now, so switching it off is the way on that the dialog names. */
      readonly isOn: boolean;
    };

/** What the last confirmation came to when it was not written. */
export type ItemFailure =
  | { readonly kind: "refused"; readonly code: AvailabilityRefusalCode }
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" };

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
  readonly initial: CatalogueAvailability;
  /** The active book: its rows are the items, and its tiers are the groups. */
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

const CLOSED: ItemFlow = { kind: "closed" };
/** An item only the draft holds was never published, so no saved kitchen names it. */
const NO_SAVED_KITCHEN_CAN_USE_IT = 0;
const UNREADABLE_USAGE: UsageRead = { kind: "unavailable" };
const FAILED_OUTCOME: AvailabilityOutcome = { kind: "failed" };
const FAILED: ItemFailure = { kind: "failed" };

export function useItemAvailability({
  initial,
  book,
  defaults,
  client,
  deleteFromDraft,
  isDraftOnly,
}: ItemAvailabilityInput): ItemAvailabilityDesk {
  const [availability, setAvailability] = useState(initial);
  const [flow, setFlow] = useState<ItemFlow>(CLOSED);
  const [failure, setFailure] = useState<ItemFailure | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const availabilityRef = useRef(availability);
  const isSendingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const context = useMemo<LifecycleContext>(
    () => ({ book, availability, defaults }),
    [book, availability, defaults],
  );

  const adopt = useCallback((next: CatalogueAvailability) => {
    availabilityRef.current = next;
    setAvailability(next);
  }, []);

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
          void openAfterCounting(item, (read) => ({
            kind: "deactivate",
            item,
            remaining: stand.remaining,
            usage: usageStandOf(read, item),
          }));
      }
    },
    [context, moveOn, openAfterCounting],
  );

  const requestDeletion = useCallback(
    (item: DeletableItemRef) => {
      moveOn();
      if (deleteStandOf(item, context).kind === "off") return;
      if (isDraftOnly(item)) {
        setFlow({
          kind: "delete",
          item,
          usage: { kind: "counted", count: NO_SAVED_KITCHEN_CAN_USE_IT },
          isDraftOnly: true,
        });
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
          setFailure({ kind: "conflict" });
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

  const settleDeletion = useCallback((result: FieldWriteResult) => {
    switch (result.kind) {
      case "saved":
      case "unchanged":
        setFlow(CLOSED);
        return;
      case "busy":
        return;
      case "conflict":
        setFailure({ kind: "conflict" });
        return;
      case "refused":
        setFailure(
          result.code === "ITEM_IS_DEFAULT"
            ? { kind: "refused", code: "item-is-default" }
            : FAILED,
        );
        return;
      case "candidate-refused":
      case "failed":
        setFailure(FAILED);
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
        settleDeletion(result);
      }),
    [deleteFromDraft, sendOnce, settleDeletion],
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
      setFlow({
        kind: "deactivate",
        item,
        remaining: stand.remaining,
        usage: { kind: "counted", count },
      });
    } else if (stand.kind === "last-active-option") {
      setFlow({ kind: "last-active-option", item });
    } else {
      setFlow(CLOSED);
    }
  }, [flow, context, moveOn]);

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

function usageStandOf(read: UsageRead, item: ItemRef): UsageStand {
  if (read.kind !== "counted") return { kind: "unavailable" };
  const count = countOfUse(read.counts, item);
  return count === undefined
    ? { kind: "unavailable" }
    : { kind: "counted", count };
}

/** The dialog a deletion opens once its saved kitchens are counted: a block where any use one, a confirmation where none. */
function deletionFlowOf(
  item: DeletableItemRef,
  context: LifecycleContext,
  read: UsageRead,
): ItemFlow {
  const usage = usageStandOf(read, item);
  if (read.kind !== "counted" || usage.kind !== "counted") {
    return {
      kind: "delete",
      item,
      usage: { kind: "unavailable" },
      isDraftOnly: false,
    };
  }
  const verdict = countedDeletionOf(item, context, read.counts);
  switch (verdict.kind) {
    case "in-use":
      return {
        kind: "delete-blocked",
        item,
        count: verdict.count,
        isOn: isItemOn(item, context),
      };
    case "allowed":
      return { kind: "delete", item, usage, isDraftOnly: false };
    case "off":
      return CLOSED;
  }
}

function afterSwitch(
  held: CatalogueAvailability,
  item: ItemRef,
  active: boolean,
  { revision }: { readonly revision: string },
): CatalogueAvailability {
  const others = held.disabled.filter(
    (disabled) => !isSameItem(disabled, item),
  );
  return { revision, disabled: active ? others : [...others, item] };
}
