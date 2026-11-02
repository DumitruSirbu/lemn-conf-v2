"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type {
  CabinetPriceRule,
  PriceBook,
} from "@lemnaria/configurator-domain";

import {
  bookWithTyped,
  changedStatesOf,
  fieldStatesOf,
  isEveryFieldReadable,
  judgePrices,
  ruleIn,
  type DetailField,
  type FieldState,
  type PriceJudgement,
  type TypedTexts,
} from "./cabinet-detail-fields";
import { plannedWritesOf, type PlannedWrite } from "./cabinet-write-plan";
import type { FailedFieldWrite } from "./price-input-words";
import { useLateAnswerGuard } from "./use-late-answer-guard";
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
  readonly draft: Pick<PriceDraft, "changeOrRevert" | "isBusy">;
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
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const { changeOrRevert, isBusy } = draft;

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
    !isBusy;

  const moveOn = useCallback(() => {
    markMoved();
    setFeedback({ kind: "none" });
  }, [markMoved]);

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
    const hasMoved = begin();
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const sequence = await sendInOrder(writes, changeOrRevert, hasMoved);
      if (hasMoved()) return;
      if (sequence.kind === "done") {
        setTyped({});
        setFeedback(
          sequence.putAnAmountInTheDraft ? { kind: "saved" } : { kind: "none" },
        );
      } else if (sequence.kind === "failed") {
        setFeedback({
          kind: "failed",
          fieldKey: sequence.write.fieldKey,
          failure: sequence.failure,
        });
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [canSave, candidate, ruleId, states, changeOrRevert, begin]);

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
  changeOrRevert: PriceDraft["changeOrRevert"],
  hasMoved: () => boolean,
): Promise<WriteSequence> {
  let putAnAmountInTheDraft = false;
  for (const write of writes) {
    if (hasMoved()) return { kind: "stopped" };
    const result = await changeOrRevert(write, write.activeMinor);
    if (result.kind === "busy") return { kind: "stopped" };
    if (result.kind !== "saved" && result.kind !== "unchanged") {
      return { kind: "failed", write, failure: result };
    }
    if (result.kind === "saved" && write.value !== write.activeMinor) {
      putAnAmountInTheDraft = true;
    }
  }
  return { kind: "done", putAnAmountInTheDraft };
}
