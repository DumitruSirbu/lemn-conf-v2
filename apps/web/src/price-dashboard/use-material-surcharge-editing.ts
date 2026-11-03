"use client";

import { useCallback, useMemo, useState } from "react";

import {
  readMaterialPercentInput,
  type WholePercentReading,
} from "./price-field-input";
import { surchargeAddressOf } from "./material-model";
import {
  useSequentialSave,
  type PlannedFieldWrite,
  type SaveFeedback,
} from "./use-sequential-save";
import type { PriceDraft } from "./use-price-draft";

// Typing, saving and cancelling a material's surcharge on its page. Nothing is sent while typing; Save sends the one
// write. A surcharge typed back to the active one takes the draft's change out instead of writing an equal one.

export interface MaterialSurchargeEditing {
  readonly text: string;
  readonly reading: WholePercentReading;
  /** The typed percentage differs from the draft's. */
  readonly isChanged: boolean;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly feedback: SaveFeedback;
  readonly type: (text: string) => void;
  readonly cancel: () => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly tierId: string;
  /** The surcharge in the active version, in whole percent. */
  readonly activePercent: number;
  /** The surcharge once the draft is applied. */
  readonly pendingPercent: number;
  readonly draft: Pick<PriceDraft, "changeOrRevert" | "isBusy">;
}

const SURCHARGE_FIELD_KEY = "percentOfCabinets";

export function useMaterialSurchargeEditing({
  tierId,
  activePercent,
  pendingPercent,
  draft,
}: EditingInput): MaterialSurchargeEditing {
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const sequence = useSequentialSave<PlannedFieldWrite>();
  const { changeOrRevert, isBusy } = draft;
  const { feedback, isSaving, moveOn, save: saveInOrder } = sequence;

  const text = typed ?? String(pendingPercent);
  const reading = useMemo(() => readMaterialPercentInput(text), [text]);
  const isChanged =
    typed !== undefined &&
    !(reading.kind === "percent" && reading.percent === pendingPercent);
  const canSave =
    isChanged && reading.kind === "percent" && !isSaving && !isBusy;

  const type = useCallback(
    (next: string) => {
      moveOn();
      setTyped(next);
    },
    [moveOn],
  );

  const cancel = useCallback(() => {
    moveOn();
    setTyped(undefined);
  }, [moveOn]);

  const save = useCallback(async () => {
    if (!canSave) return;
    const { percent } = reading;
    await saveInOrder({
      // The write's amount and the active one are percentages here, which the sequence only compares.
      writes: [
        {
          fieldKey: SURCHARGE_FIELD_KEY,
          value: percent,
          activeMinor: activePercent,
        },
      ],
      send: () =>
        changeOrRevert(
          { address: surchargeAddressOf(tierId), value: percent },
          activePercent,
        ),
      onDone: () => {
        setTyped(undefined);
      },
    });
  }, [canSave, reading, saveInOrder, changeOrRevert, tierId, activePercent]);

  return {
    text,
    reading,
    isChanged,
    canSave,
    isSaving,
    feedback,
    type,
    cancel,
    save,
  };
}
