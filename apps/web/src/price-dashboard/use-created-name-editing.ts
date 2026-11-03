"use client";

import { useCallback, useMemo, useState } from "react";

import {
  judgeCreatedRowText,
  type CreatedRowTextJudgement,
} from "@lemnaria/configurator-domain";

import type { FailedFieldWrite } from "./price-input-words";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { PriceDraft } from "./use-price-draft";

// Typing and saving the Romanian name of a class the catalogue does not key. The name is read as the draft would judge it
// before anything is sent; a save sends one change of the class's words, and the name shown afterwards is the draft's, not
// the typed text. Where the client takes no change of a created row's words, nothing can be saved.

export interface CreatedNameEditing {
  readonly text: string;
  readonly judgement: CreatedRowTextJudgement;
  /** The person has typed in it, so a refusal of it is shown. */
  readonly isTouched: boolean;
  /** The typed name reads well and differs from the draft's. */
  readonly isChanged: boolean;
  /** Whether the client takes a change of a created row's words at all. */
  readonly canWrite: boolean;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  /** What the last Save came to when nothing was written; cleared by typing. */
  readonly failure: FailedFieldWrite | undefined;
  readonly type: (text: string) => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly tierId: string;
  /** The name once the draft is applied. */
  readonly currentName: string;
  readonly draft: Pick<
    PriceDraft,
    "change" | "isBusy" | "canChangeCreatedText"
  >;
}

export function useCreatedNameEditing({
  tierId,
  currentName,
  draft,
}: EditingInput): CreatedNameEditing {
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<FailedFieldWrite | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const { moveOn, begin } = useLateAnswerGuard();
  const { change, isBusy, canChangeCreatedText: canWrite } = draft;

  const text = typed ?? currentName;
  const judgement = useMemo(() => judgeCreatedRowText(text, "name"), [text]);
  const isChanged = judgement.ok && judgement.text !== currentName;
  const canSave = canWrite && isChanged && !isSaving && !isBusy;

  const type = useCallback(
    (next: string) => {
      moveOn();
      setFailure(undefined);
      setTyped(next);
    },
    [moveOn],
  );

  const save = useCallback(async () => {
    if (!canSave) return;
    const hasMoved = begin();
    setIsSaving(true);
    try {
      const result = await change({
        address: {
          kind: "created-row-text",
          item: { kind: "hardware", tierId },
          field: "name",
        },
        value: judgement.text,
      });
      if (hasMoved() || result.kind === "busy") return;
      if (result.kind === "saved" || result.kind === "unchanged") {
        setTyped(undefined);
      } else {
        setFailure(result);
      }
    } finally {
      setIsSaving(false);
    }
  }, [canSave, judgement, begin, change, tierId]);

  return {
    text,
    judgement,
    isTouched: typed !== undefined,
    isChanged,
    canWrite,
    canSave,
    isSaving,
    failure,
    type,
    save,
  };
}
