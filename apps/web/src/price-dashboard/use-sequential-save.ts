"use client";

import { useCallback, useRef, useState } from "react";

import type { FailedSave } from "./price-input-words";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { FieldWriteResult } from "./use-price-draft";

// A Save that sends one write per changed field: it stops at the first that is not written, its answer is dropped once the
// person has typed since, and a notice is shown only for what the server wrote. A failure says whether an earlier write of
// the same Save had landed, so the words never claim that nothing changed when the draft holds something.

export type SaveFeedback =
  | { readonly kind: "none" }
  /** Every write landed and at least one put an amount into the draft. */
  | { readonly kind: "saved" }
  | ({ readonly kind: "failed"; readonly fieldKey: string } & FailedSave);

/** What a screen plans for one field: the key its failure is shown under, and the amount against the active one. */
export interface PlannedFieldWrite {
  readonly fieldKey: string;
  readonly value: number;
  /** The active version's amount; absent where the active version has none. */
  readonly activeMinor: number | undefined;
}

type WriteSequence<Write extends PlannedFieldWrite> =
  | { readonly kind: "done"; readonly putAnAmountInTheDraft: boolean }
  | { readonly kind: "stopped" }
  | ({ readonly kind: "failed"; readonly write: Write } & FailedSave);

export interface SequentialSave<Write extends PlannedFieldWrite> {
  readonly feedback: SaveFeedback;
  readonly isSaving: boolean;
  /** The person has typed or cancelled: a write still out is no longer answered on screen. */
  readonly moveOn: () => void;
  readonly save: (plan: SavePlan<Write>) => Promise<void>;
}

interface SavePlan<Write extends PlannedFieldWrite> {
  readonly writes: readonly Write[];
  readonly send: (write: Write) => Promise<FieldWriteResult>;
  /** Called when every write is done and the answer is still the one on screen. */
  readonly onDone: () => void;
}

export function useSequentialSave<
  Write extends PlannedFieldWrite,
>(): SequentialSave<Write> {
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: "none" });
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();

  const moveOn = useCallback(() => {
    markMoved();
    setFeedback({ kind: "none" });
  }, [markMoved]);

  const save = useCallback(
    async ({ writes, send, onDone }: SavePlan<Write>) => {
      if (isSavingRef.current) return;
      const hasMoved = begin();
      isSavingRef.current = true;
      setIsSaving(true);
      try {
        const sequence = await sendInOrder(writes, send, hasMoved);
        if (hasMoved()) return;
        if (sequence.kind === "done") {
          onDone();
          setFeedback(
            sequence.putAnAmountInTheDraft
              ? { kind: "saved" }
              : { kind: "none" },
          );
        } else if (sequence.kind === "failed") {
          setFeedback({
            kind: "failed",
            fieldKey: sequence.write.fieldKey,
            failure: sequence.failure,
            hasWrittenEarlier: sequence.hasWrittenEarlier,
          });
        }
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    },
    [begin],
  );

  return { feedback, isSaving, moveOn, save };
}

/** The writes in order; nothing more is sent once the person has typed, or one is not written. */
async function sendInOrder<Write extends PlannedFieldWrite>(
  writes: readonly Write[],
  send: (write: Write) => Promise<FieldWriteResult>,
  hasMoved: () => boolean,
): Promise<WriteSequence<Write>> {
  let hasWrittenEarlier = false;
  let putAnAmountInTheDraft = false;
  for (const write of writes) {
    if (hasMoved()) return { kind: "stopped" };
    const result = await send(write);
    if (result.kind === "busy") return { kind: "stopped" };
    if (result.kind !== "saved" && result.kind !== "unchanged") {
      return { kind: "failed", write, failure: result, hasWrittenEarlier };
    }
    if (result.kind === "saved") {
      hasWrittenEarlier = true;
      if (write.value !== write.activeMinor) putAnAmountInTheDraft = true;
    }
  }
  return { kind: "done", putAnAmountInTheDraft };
}
