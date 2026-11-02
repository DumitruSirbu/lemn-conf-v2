"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  isSameAddress,
  type PriceBook,
  type CabinetPriceRule,
} from "@lemnaria/configurator-domain";

import {
  bookWithTyped,
  changedStatesOf,
  fieldStatesOf,
  isEveryFieldReadable,
  judgePrices,
  plannedWritesOf,
  ruleIn,
  type DetailField,
  type FieldState,
  type PlannedWrite,
  type PriceJudgement,
  type TypedTexts,
} from "./cabinet-detail-fields";
import type { DraftChangeInputWire } from "./price-dashboard-wire-contract";
import type { FailedFieldWrite } from "./price-input-words";
import type { PriceDraft } from "./use-price-draft";

// Typing, saving and cancelling on the cabinet's page. Nothing is sent while typing; a save sends one write per
// changed field and stops at the first not written; its answer is dropped once the person has typed since, and a
// notice is shown only for what the server wrote.

export type SaveFeedback =
  | { readonly kind: "none" }
  /** Every write landed and at least one put an amount into the draft. */
  | { readonly kind: "saved" }
  | {
      readonly kind: "failed";
      readonly fieldKey: string;
      readonly failure: FailedFieldWrite;
    };

export interface CabinetPriceEditing {
  readonly states: readonly FieldState[];
  /** The book the typed amounts make; absent while they make none. */
  readonly typedBook: PriceBook | undefined;
  /** The typed book where every price of the rule is one; absent otherwise, so no table draws a price that is not. */
  readonly pricedBook: PriceBook | undefined;
  readonly typedRule: CabinetPriceRule | undefined;
  readonly judgement: PriceJudgement | undefined;
  readonly feedback: SaveFeedback;
  /** Some field holds an amount other than the draft's. */
  readonly isChanged: boolean;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly type: (fieldKey: string, text: string) => void;
  readonly cancel: () => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly fields: readonly DetailField[];
  readonly candidate: PriceBook;
  readonly ruleId: string;
  readonly draft: Pick<PriceDraft, "change" | "revert" | "isBusy">;
}

type WriteSequence =
  | { readonly kind: "done"; readonly putAnAmountInTheDraft: boolean }
  | { readonly kind: "stopped" }
  | {
      readonly kind: "failed";
      readonly write: PlannedWrite;
      readonly failure: FailedFieldWrite;
    };

export function useCabinetPriceEditing({
  fields,
  candidate,
  ruleId,
  draft,
}: EditingInput): CabinetPriceEditing {
  const [typed, setTyped] = useState<TypedTexts>({});
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: "none" });
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const moveCountRef = useRef(0);

  const states = useMemo(() => fieldStatesOf(fields, typed), [fields, typed]);
  const typedBook = useMemo(
    () =>
      isEveryFieldReadable(states)
        ? bookWithTyped(candidate, states)
        : undefined,
    [states, candidate],
  );
  const typedRule =
    typedBook === undefined ? undefined : ruleIn(typedBook, ruleId);
  const judgement = useMemo(
    () =>
      typedRule === undefined ? undefined : judgePrices(typedRule, fields),
    [typedRule, fields],
  );
  const pricedBook = judgement === undefined ? typedBook : undefined;
  const isChanged = changedStatesOf(states).length > 0;
  const canSave =
    isChanged &&
    typedRule !== undefined &&
    judgement === undefined &&
    !isSaving &&
    !draft.isBusy;

  /** Typing and cancelling each make a save still on its way an answer to fields that are no longer these. */
  const moveOn = useCallback(() => {
    moveCountRef.current += 1;
    setFeedback({ kind: "none" });
  }, []);

  const type = useCallback(
    (fieldKey: string, text: string) => {
      moveOn();
      setTyped((held) => ({ ...held, [fieldKey]: text }));
    },
    [moveOn],
  );

  const cancel = useCallback(() => {
    moveOn();
    setTyped({});
  }, [moveOn]);

  const save = useCallback(async () => {
    if (!canSave || isSavingRef.current) return;
    const writes = plannedWritesOf(candidate, ruleId, states);
    const moveCountWhenSent = moveCountRef.current;
    const hasMoved = () => moveCountRef.current !== moveCountWhenSent;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const sequence = await sendInOrder(writes, draft, hasMoved);
      if (hasMoved()) return;
      if (sequence.kind === "done") {
        setTyped({});
        setFeedback(
          sequence.putAnAmountInTheDraft ? { kind: "saved" } : { kind: "none" },
        );
      } else if (sequence.kind === "failed") {
        setFeedback({
          kind: "failed",
          fieldKey: keyOfWrite(states, sequence.write),
          failure: sequence.failure,
        });
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [canSave, candidate, ruleId, states, draft]);

  return {
    states,
    typedBook,
    pricedBook,
    typedRule,
    judgement,
    feedback,
    isChanged,
    canSave,
    isSaving,
    type,
    cancel,
    save,
  };
}

/** The writes in order; nothing more is sent once the person has typed, or one is not written. */
async function sendInOrder(
  writes: readonly PlannedWrite[],
  draft: Pick<PriceDraft, "change" | "revert">,
  hasMoved: () => boolean,
): Promise<WriteSequence> {
  let putAnAmountInTheDraft = false;
  for (const write of writes) {
    if (hasMoved()) return { kind: "stopped" };
    const result = write.isRevert
      ? await draft.revert({ kind: "change", address: write.address })
      : await draft.change({
          address: write.address,
          value: write.value,
        } as DraftChangeInputWire);
    if (result.kind === "busy") return { kind: "stopped" };
    if (result.kind !== "saved" && result.kind !== "unchanged") {
      return { kind: "failed", write, failure: result };
    }
    if (result.kind === "saved" && !write.isRevert)
      putAnAmountInTheDraft = true;
  }
  return { kind: "done", putAnAmountInTheDraft };
}

function keyOfWrite(
  states: readonly FieldState[],
  write: PlannedWrite,
): string {
  const held = states.find(({ field }) =>
    isSameAddress(field.address, write.address),
  );
  return held?.field.key ?? "";
}
