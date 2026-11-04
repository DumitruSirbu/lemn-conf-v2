import {
  judgeCreatedRowText,
  type CreatedRowTextJudgement,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type { CreateWriteResult } from "./use-price-draft";

// What the forms that create a row (a hardware class, a linked accessory) hold of what is typed: the words as the domain
// judges them, and what the last attempt to create came to.

export type CreationFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "created"; readonly created: ItemRef }
  | {
      readonly kind: "failed";
      readonly failure: Exclude<
        CreateWriteResult,
        { kind: "created" | "busy" }
      >;
    };

export const NO_FEEDBACK: CreationFeedback = { kind: "none" };

export interface TextEntry {
  readonly text: string;
  readonly judgement: CreatedRowTextJudgement;
  /** The person has typed in it, so a refusal of it is shown. */
  readonly isTouched: boolean;
}

export function textEntryOf({
  text,
  field,
  isTouched,
}: {
  readonly text: string;
  readonly field: "name" | "description";
  readonly isTouched: boolean;
}): TextEntry {
  return { text, judgement: judgeCreatedRowText(text, field), isTouched };
}
