import {
  applyChanges,
  type ChangeRefusalCode,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// Whether a draft still makes a book. `applyChanges` judges every change against the book the earlier ones made, so one
// refused change refuses the whole candidate; this says whose fault it is. A refusal at a change this request added is the
// person's to correct. A refusal anywhere else, or a candidate that is not a book, is a draft that was stored already
// unable to apply: a defect of ours, answered as a state of the data and never as a `400` that blames the person.

export type DraftJudgement =
  | { readonly kind: "applies" }
  | { readonly kind: "refused-new-change"; readonly code: ChangeRefusalCode }
  | { readonly kind: "candidate-refused" };

/** `firstNewIndex` is where the changes this request added begin; the changes before it were already stored. */
export function judgeDraft(
  book: PriceBook,
  changes: readonly DraftChange[],
  firstNewIndex: number,
): DraftJudgement {
  const applied = applyChanges(book, changes);
  if (applied.ok) return { kind: "applies" };
  if (applied.reason === "candidate-refused") {
    return { kind: "candidate-refused" };
  }
  const [first] = applied.refusals;
  const isOnlyNewChanges = applied.refusals.every(
    ({ index }) => index >= firstNewIndex,
  );
  if (first === undefined || !isOnlyNewChanges) {
    return { kind: "candidate-refused" };
  }
  return { kind: "refused-new-change", code: first.code };
}
