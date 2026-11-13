"use client";

import { useCallback, useMemo, useState } from "react";

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
import type { PriceDraft } from "./use-price-draft";
import { useSequentialSave, type SaveFeedback } from "./use-sequential-save";

// Typing, saving and cancelling on the cabinet's page. Nothing is sent while typing; a save sends one write per
// changed field (`use-sequential-save.ts`).

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

export function useCabinetPriceEditing({
  fields,
  candidate,
  ruleId,
  draft,
}: EditingInput): CabinetPriceEditing {
  const [typed, setTyped] = useState<TypedTexts>({});
  const sequence = useSequentialSave<PlannedWrite>();
  const { feedback, isSaving, moveOn, save: saveInOrder } = sequence;
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
    if (!canSave) return;
    await saveInOrder({
      writes: plannedWritesOf(candidate, ruleId, states),
      send: (write) => changeOrRevert(write, write.activeMinor),
      onDone: () => {
        setTyped({});
      },
    });
  }, [canSave, saveInOrder, candidate, ruleId, states, changeOrRevert]);

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
