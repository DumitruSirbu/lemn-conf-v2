"use client";

import { useCallback, useMemo, useState } from "react";

import { accessoryPriceAddressOf } from "./accessory-model";
import {
  plainLeiOf,
  readLeiInputOverHeld,
  type LeiInputReading,
} from "./price-field-input";
import {
  useSequentialSave,
  type PlannedFieldWrite,
  type SaveFeedback,
} from "./use-sequential-save";
import type { PriceDraft } from "./use-price-draft";

// Typing, saving and cancelling an accessory's price per unit on its page. Nothing is sent while typing; Save sends the
// one write. An accessory the active version holds takes its change out of the draft when the price is typed back to
// the active one; an accessory only the draft knows has no active price, so every write is a change.

export interface AccessoryPriceEditing {
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The typed price differs from the draft's. */
  readonly isChanged: boolean;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly feedback: SaveFeedback;
  readonly type: (text: string) => void;
  readonly cancel: () => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly accessoryId: string;
  /** The price per unit in the active version, in bani; absent for an accessory only the draft knows. */
  readonly activeMinor: number | undefined;
  /** The price once the draft is applied. */
  readonly pendingMinor: number;
  readonly draft: Pick<PriceDraft, "change" | "changeOrRevert" | "isBusy">;
}

const PRICE_FIELD_KEY = "perUnitMinor";

export function useAccessoryPriceEditing({
  accessoryId,
  activeMinor,
  pendingMinor,
  draft,
}: EditingInput): AccessoryPriceEditing {
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const sequence = useSequentialSave<PlannedFieldWrite>();
  const { change, changeOrRevert, isBusy } = draft;
  const { feedback, isSaving, moveOn, save: saveInOrder } = sequence;

  const text = typed ?? plainLeiOf(pendingMinor);
  const reading = useMemo(
    () =>
      readLeiInputOverHeld(text, [
        pendingMinor,
        ...(activeMinor === undefined ? [] : [activeMinor]),
      ]),
    [text, pendingMinor, activeMinor],
  );
  const typedMinor = reading.kind === "amount" ? reading.minor : undefined;
  const isChanged = typedMinor !== undefined && typedMinor !== pendingMinor;
  const canSave = isChanged && !isSaving && !isBusy;

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
    const address = accessoryPriceAddressOf(accessoryId);
    await saveInOrder({
      writes: [{ fieldKey: PRICE_FIELD_KEY, value: typedMinor, activeMinor }],
      send: () =>
        activeMinor === undefined
          ? change({ address, value: typedMinor })
          : changeOrRevert({ address, value: typedMinor }, activeMinor),
      onDone: () => {
        setTyped(undefined);
      },
    });
  }, [
    canSave,
    typedMinor,
    saveInOrder,
    change,
    changeOrRevert,
    accessoryId,
    activeMinor,
  ]);

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
