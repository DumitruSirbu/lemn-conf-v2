"use client";

import { useCallback, useMemo, useState } from "react";

import {
  judgeCreatedRowText,
  type CreatedRowItemRef,
  type CreatedRowTextJudgement,
} from "@lemnaria/configurator-domain";

import type { FailedFieldWrite } from "./price-input-words";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { PriceDraft } from "./use-price-draft";

// The name of a row the dashboard created, a hardware class or a linked accessory, typed and saved on its own page. A name
// typed back to the published one takes its change out of the draft instead of adding a no-op change.

export interface CreatedRowNameEditing {
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
  /** What the last Save came to when nothing was written; cleared by typing and when a Save begins. */
  readonly failure: FailedFieldWrite | undefined;
  readonly type: (text: string) => void;
  readonly save: () => Promise<void>;
}

interface EditingInput {
  readonly item: CreatedRowItemRef;
  /** The name once the draft is applied. */
  readonly currentName: string;
  /** The active version's name; absent for a row only the draft knows. */
  readonly publishedName: string | undefined;
  readonly draft: Pick<
    PriceDraft,
    "change" | "changeOrRevert" | "isBusy" | "canChangeCreatedText"
  >;
}

export function useCreatedRowNameEditing({
  item,
  currentName,
  publishedName,
  draft,
}: EditingInput): CreatedRowNameEditing {
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<FailedFieldWrite | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState(false);
  const { moveOn, begin } = useLateAnswerGuard();
  const {
    change,
    changeOrRevert,
    isBusy,
    canChangeCreatedText: canWrite,
  } = draft;

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
    setFailure(undefined);
    setIsSaving(true);
    try {
      const address = {
        kind: "created-row-text",
        item,
        field: "name",
      } as const;
      const wanted = { address, value: judgement.text };
      const result =
        publishedName === undefined
          ? await change(wanted)
          : await changeOrRevert(wanted, publishedName);
      if (hasMoved() || result.kind === "busy") return;
      if (result.kind === "saved" || result.kind === "unchanged") {
        setTyped(undefined);
      } else {
        setFailure(result);
      }
    } finally {
      setIsSaving(false);
    }
  }, [canSave, judgement, begin, change, changeOrRevert, publishedName, item]);

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
