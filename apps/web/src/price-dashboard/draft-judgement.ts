import {
  applyChanges,
  isSameAddress,
  type ChangeRefusal,
  type ChangeRefusalCode,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// Whether a draft still makes a book. `applyChanges` judges every change against the book the earlier ones made, so one
// refused change refuses the whole candidate; this says whose fault it is. A refusal at a change the judged write added
// is the person's to correct. A refusal anywhere else, or a candidate that is not a book, is a draft that was stored
// already unable to apply: a defect of ours, not the person's.
//
// A write that is given the draft as it was stored also heals it: it is allowed when it adds no refusal, that is, when
// every change still refused afterwards was refused before, at the same address. So a revert, or a change elsewhere, goes
// through while a stale change stays, and the person can remove the stale ones one by one.

export type DraftJudgement =
  | { readonly kind: "applies" }
  | { readonly kind: "refused-new-change"; readonly code: ChangeRefusalCode }
  | { readonly kind: "candidate-refused" };

/** Which changes of the draft after the write are the judged write's: the ones from an index on, or exactly these. */
export type NewChanges =
  | {
      /** Where the changes the judged write added begin; the changes before it were already stored. */
      readonly firstNewIndex: number;
    }
  | { readonly newIndexes: ReadonlySet<number> };

export type DraftToJudge = NewChanges & {
  readonly book: PriceBook;
  /** The draft after the write. */
  readonly changes: readonly DraftChange[];
  /** The draft as stored, when a write that adds no refusal is to be allowed on a draft that already has some. */
  readonly stored?: readonly DraftChange[];
};

export function judgeDraft(toJudge: DraftToJudge): DraftJudgement {
  const { book, changes, stored } = toJudge;
  const applied = applyChanges(book, changes);
  if (applied.ok) return { kind: "applies" };
  if (applied.reason === "candidate-refused") {
    return { kind: "candidate-refused" };
  }
  const newRefusal = causeOf(
    applied.refusals.filter(({ index }) => isNewIndex(toJudge, index)),
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

/**
 * The refusal the person corrects. A created class that lacks a rate is refused at its own index, ahead of the rate that
 * was refused (`ZERO`, say), so it is named only when no other change is the reason.
 */
function causeOf(
  refusals: readonly ChangeRefusal[],
): ChangeRefusal | undefined {
  return (
    refusals.find(({ code }) => code !== "CREATED_TIER_RATES_MISSING") ??
    refusals[0]
  );
}

function isNewIndex(newChanges: NewChanges, index: number): boolean {
  return "newIndexes" in newChanges
    ? newChanges.newIndexes.has(index)
    : index >= newChanges.firstNewIndex;
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
