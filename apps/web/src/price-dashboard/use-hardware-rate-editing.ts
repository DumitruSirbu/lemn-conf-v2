"use client";

import { useCallback, useMemo, useState } from "react";

import type { HardwareRateField } from "@lemnaria/configurator-domain";

import type { HardwareRateFacts } from "./hardware-model";
import type { LeiInputReading } from "./price-field-input";
import { plainLeiOf, readLeiInputOverHeld } from "./price-field-input";
import {
  useSequentialSave,
  type PlannedFieldWrite,
  type SaveFeedback,
} from "./use-sequential-save";
import type { FieldWriteResult, PriceDraft } from "./use-price-draft";

// Typing, saving and cancelling the rates on a class's page. Nothing is sent while typing; a save sends one write per
// changed rate (`use-sequential-save.ts`). A class only the draft knows has no active rate to type back to, so each of its
// rates is a change of its own and none is ever taken out of the draft as "equal to the active one".

export interface RateFieldState {
  readonly rate: HardwareRateFacts;
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The typed amount differs from the draft's. */
  readonly isChanged: boolean;
}

export interface HardwareRateEditing {
  readonly states: readonly RateFieldState[];
  readonly feedback: SaveFeedback;
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

interface RateWrite extends PlannedFieldWrite {
  readonly field: HardwareRateField;
}

export function useHardwareRateEditing({
  tierId,
  rates,
  draft,
}: EditingInput): HardwareRateEditing {
  const [typed, setTyped] = useState<TypedTexts>({});
  const sequence = useSequentialSave<RateWrite>();
  const { change, changeOrRevert, isBusy } = draft;
  const { feedback, isSaving, moveOn, save: saveInOrder } = sequence;

  const states = useMemo(() => statesOf(rates, typed), [rates, typed]);
  const changed = states.filter((state) => state.isChanged);
  const isEveryReadable = states.every(
    (state) => state.reading.kind === "amount",
  );
  const canSave = changed.length > 0 && isEveryReadable && !isSaving && !isBusy;

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
    if (!canSave) return;
    await saveInOrder({
      writes: plannedWritesOf(changed),
      send: (write) => writeRate(tierId, write, { change, changeOrRevert }),
      onDone: () => {
        setTyped({});
      },
    });
  }, [canSave, saveInOrder, changed, tierId, change, changeOrRevert]);

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

/** One write for each changed rate that reads as an amount; a Save is offered only where every rate does. */
function plannedWritesOf(
  changed: readonly RateFieldState[],
): readonly RateWrite[] {
  return changed.flatMap(({ rate, reading }) =>
    reading.kind === "amount"
      ? [
          {
            fieldKey: rate.field,
            field: rate.field,
            value: reading.minor,
            activeMinor: rate.activeMinor,
          },
        ]
      : [],
  );
}

/** A class the active version holds takes a rate back out of the draft when it is typed back to the active one; a class
 *  only the draft knows has no active rate, so every write is a change. */
function writeRate(
  tierId: string,
  { field, value, activeMinor }: RateWrite,
  write: Pick<PriceDraft, "change" | "changeOrRevert">,
): Promise<FieldWriteResult> {
  const address = { kind: "hardware", tierId, field } as const;
  return activeMinor === undefined
    ? write.change({ address, value })
    : write.changeOrRevert({ address, value }, activeMinor);
}
