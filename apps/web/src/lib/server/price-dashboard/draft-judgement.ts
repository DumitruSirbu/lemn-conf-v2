import {
  applyChanges,
  isSameAddress,
  type ChangeRefusalCode,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// Whether a draft still makes a book. `applyChanges` judges every change against the book the earlier ones made, so one
// refused change refuses the whole candidate; this says whose fault it is. A refusal at a change this request added is the
// person's to correct. A refusal anywhere else, or a candidate that is not a book, is a draft that was stored already
// unable to apply: a defect of ours, answered as a state of the data and never as a `400` that blames the person.
//
// A write that is given the draft as it was stored also heals it: it is allowed when it adds no refusal, that is, when
// every change still refused afterwards was refused before, at the same address. So a revert, or a change elsewhere, goes
// through while a stale change stays, and the person can remove the stale ones one by one.

export type DraftJudgement =
  | { readonly kind: "applies" }
  | { readonly kind: "refused-new-change"; readonly code: ChangeRefusalCode }
  | { readonly kind: "candidate-refused" };

export interface DraftToJudge {
  readonly book: PriceBook;
  /** The draft after the write. */
  readonly changes: readonly DraftChange[];
  /** Where the changes this request added begin; the changes before it were already stored. */
  readonly firstNewIndex: number;
  /** The draft as stored, when a write that adds no refusal is to be allowed on a draft that already has some. */
  readonly stored?: readonly DraftChange[];
}

export function judgeDraft({
  book,
  changes,
  firstNewIndex,
  stored,
}: DraftToJudge): DraftJudgement {
  const applied = applyChanges(book, changes);
  if (applied.ok) return { kind: "applies" };
  if (applied.reason === "candidate-refused") {
    return { kind: "candidate-refused" };
  }
  const newRefusal = applied.refusals.find(
    ({ index }) => index >= firstNewIndex,
  );
  if (newRefusal !== undefined) {
    return { kind: "refused-new-change", code: newRefusal.code };
  }
  const staleAddresses = refusedAddressesOf(book, stored);
  const addsNoRefusal = applied.refusals.every(({ index }) =>
    staleAddresses.some((address) =>
      isSameAddress(address, changes[index]?.address),
    ),
  );
  return addsNoRefusal ? { kind: "applies" } : { kind: "candidate-refused" };
}

/** The addresses of the stored changes that were refused already; none when there is no stored draft to heal. */
function refusedAddressesOf(
  book: PriceBook,
  stored: readonly DraftChange[] | undefined,
): readonly unknown[] {
  if (stored === undefined) return [];
  const before = applyChanges(book, stored);
  if (before.ok || before.reason === "candidate-refused") return [];
  return before.refusals.map(({ index }) => stored[index]?.address);
}
