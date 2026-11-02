"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { HardwareRateField } from "@lemnaria/configurator-domain";

import type { HardwareRateFacts } from "./hardware-model";
import type { LeiInputReading } from "./price-field-input";
import { plainLeiOf, readLeiInputOverHeld } from "./price-field-input";
import type { FailedFieldWrite } from "./price-input-words";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { FieldWriteResult, PriceDraft } from "./use-price-draft";

// Typing, saving and cancelling the rates on a class's page. Nothing is sent while typing; a save sends one write per
// changed rate and stops at the first that is not written; its answer is dropped once the person has typed since, and a
// notice is shown only for what the server wrote. A class only the draft knows has no active rate to type back to, so each
// of its rates is a change of its own and none is ever taken out of the draft as "equal to the active one".

export type RateSaveFeedback =
  | { readonly kind: "none" }
  /** Every write landed and at least one put an amount into the draft. */
  | { readonly kind: "saved" }
  | {
      readonly kind: "failed";
      readonly field: HardwareRateField;
      readonly failure: FailedFieldWrite;
    };

export interface RateFieldState {
  readonly rate: HardwareRateFacts;
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The typed amount differs from the draft's. */
  readonly isChanged: boolean;
}

export interface HardwareRateEditing {
  readonly states: readonly RateFieldState[];
  readonly feedback: RateSaveFeedback;
  readonly isChanged: boolean;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly type: (field: HardwareRateField, text: string) => void;
  readonly cancel: () => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly tierId: string;
  readonly rates: readonly HardwareRateFacts[];
  readonly draft: Pick<PriceDraft, "change" | "changeOrRevert" | "isBusy">;
}

type TypedTexts = Readonly<Partial<Record<HardwareRateField, string>>>;

type WriteSequence =
  | { readonly kind: "done"; readonly putAnAmountInTheDraft: boolean }
  | { readonly kind: "stopped" }
  | {
      readonly kind: "failed";
      readonly field: HardwareRateField;
      readonly failure: FailedFieldWrite;
    };

export function useHardwareRateEditing({
  tierId,
  rates,
  draft,
}: EditingInput): HardwareRateEditing {
  const [typed, setTyped] = useState<TypedTexts>({});
  const [feedback, setFeedback] = useState<RateSaveFeedback>({ kind: "none" });
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const { change, changeOrRevert, isBusy } = draft;

  const states = useMemo(() => statesOf(rates, typed), [rates, typed]);
  const changed = states.filter((state) => state.isChanged);
  const isEveryReadable = states.every(
    (state) => state.reading.kind === "amount",
  );
  const canSave = changed.length > 0 && isEveryReadable && !isSaving && !isBusy;

  const moveOn = useCallback(() => {
    markMoved();
    setFeedback({ kind: "none" });
  }, [markMoved]);

  const type = useCallback(
    (field: HardwareRateField, text: string) => {
      moveOn();
      setTyped((held) => ({ ...held, [field]: text }));
    },
    [moveOn],
  );

  const cancel = useCallback(() => {
    moveOn();
    setTyped({});
  }, [moveOn]);

  const save = useCallback(async () => {
    if (!canSave || isSavingRef.current) return;
    const hasMoved = begin();
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const sequence = await sendInOrder({
        tierId,
        states: changed,
        write: { change, changeOrRevert },
        hasMoved,
      });
      if (hasMoved()) return;
      if (sequence.kind === "done") {
        setTyped({});
        setFeedback(
          sequence.putAnAmountInTheDraft ? { kind: "saved" } : { kind: "none" },
        );
      } else if (sequence.kind === "failed") {
        setFeedback({
          kind: "failed",
          field: sequence.field,
          failure: sequence.failure,
        });
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [canSave, begin, tierId, changed, change, changeOrRevert]);

  return {
    states,
    feedback,
    isChanged: changed.length > 0,
    canSave,
    isSaving,
    type,
    cancel,
    save,
  };
}

function statesOf(
  rates: readonly HardwareRateFacts[],
  typed: TypedTexts,
): readonly RateFieldState[] {
  return rates.map((rate) => {
    const text = typed[rate.field] ?? plainLeiOf(rate.pendingMinor);
    const held = [
      rate.pendingMinor,
      ...(rate.activeMinor === undefined ? [] : [rate.activeMinor]),
    ];
    const reading = readLeiInputOverHeld(text, held);
    const isChanged =
      reading.kind === "amount" && reading.minor !== rate.pendingMinor;
    return { rate, text, reading, isChanged };
  });
}

async function sendInOrder({
  tierId,
  states,
  write,
  hasMoved,
}: {
  readonly tierId: string;
  readonly states: readonly RateFieldState[];
  readonly write: Pick<PriceDraft, "change" | "changeOrRevert">;
  readonly hasMoved: () => boolean;
}): Promise<WriteSequence> {
  let putAnAmountInTheDraft = false;
  for (const { rate, reading } of states) {
    if (hasMoved()) return { kind: "stopped" };
    if (reading.kind !== "amount") return { kind: "stopped" };
    const result = await writeRate({
      tierId,
      rate,
      minor: reading.minor,
      write,
    });
    if (result.kind === "busy") return { kind: "stopped" };
    if (result.kind !== "saved" && result.kind !== "unchanged") {
      return { kind: "failed", field: rate.field, failure: result };
    }
    if (result.kind === "saved" && reading.minor !== rate.activeMinor) {
      putAnAmountInTheDraft = true;
    }
  }
  return { kind: "done", putAnAmountInTheDraft };
}

/** A class the active version holds takes a rate back out of the draft when it is typed back to the active one; a class
 *  only the draft knows has no active rate, so every write is a change. */
function writeRate({
  tierId,
  rate,
  minor,
  write,
}: {
  readonly tierId: string;
  readonly rate: HardwareRateFacts;
  readonly minor: number;
  readonly write: Pick<PriceDraft, "change" | "changeOrRevert">;
}): Promise<FieldWriteResult> {
  const address = { kind: "hardware", tierId, field: rate.field } as const;
  return rate.activeMinor === undefined
    ? write.change({ address, value: minor })
    : write.changeOrRevert({ address, value: minor }, rate.activeMinor);
}
