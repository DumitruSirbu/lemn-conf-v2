import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  isSameAddress,
  readEditableFields,
  restoreChanges,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { planRestoreToDraft } from "@/lib/server/price-dashboard/restore-plan";

// Adversarial QA of M10 wave R3's restore plan, swept over generated archived books, active books and drafts rather than the
// hand-picked ones of the unit tests. The plan is exact when: the candidate it leaves reproduces the archived book on every
// field the archive states, a pending change to a field the archive does not state is still there, the count the audit row
// keeps is what the restore adds to the active book, and "nothing differs" is exactly "the candidate already holds it".

const BASE = SAMPLE_PRICE_BOOK;
const FIELDS = readEditableFields(BASE);
const STEP = 10;

type Field = (typeof FIELDS)[number];

function valueFor(field: Field, delta: number): number | boolean {
  if (typeof field.value === "boolean")
    return delta % 2 === 0 ? field.value : !field.value;
  return Math.max(0, field.value + delta * STEP);
}

const changeArbitrary = fc
  .tuple(fc.nat(FIELDS.length - 1), fc.integer({ min: -3, max: 6 }))
  .map(([index, delta]): DraftChange => {
    const field = FIELDS[index];
    if (field === undefined) throw new Error("no such field");
    return {
      address: field.address,
      value: valueFor(field, delta),
    } as DraftChange;
  });

/** At most one change per address: a draft holds one change of a field. */
function onePerAddress(changes: readonly DraftChange[]): DraftChange[] {
  const kept: DraftChange[] = [];
  for (const change of changes) {
    const at = kept.findIndex(({ address }) =>
      isSameAddress(address, change.address),
    );
    if (at >= 0) kept.splice(at, 1);
    kept.push(change);
  }
  return kept;
}

const changesArbitrary = fc
  .array(changeArbitrary, { maxLength: 12 })
  .map(onePerAddress);

function bookOf(
  base: PriceBook,
  changes: readonly DraftChange[],
): PriceBook | undefined {
  const applied = applyChanges(base, changes);
  return applied.ok ? applied.book : undefined;
}

const droppedRowsArbitrary = fc.subarray(
  BASE.cabinetRules.map(({ ruleId }) => ruleId),
  { maxLength: 4 },
);

function without(book: PriceBook, ruleIds: readonly string[]): PriceBook {
  return {
    ...book,
    cabinetRules: book.cabinetRules.filter(
      ({ ruleId }) => !ruleIds.includes(ruleId),
    ),
  };
}

function valueAt(
  book: PriceBook,
  address: Parameters<typeof isSameAddress>[0],
): unknown {
  return readEditableFields(book).find((field) =>
    isSameAddress(field.address, address),
  )?.value;
}

interface Scenario {
  readonly archivedChanges: DraftChange[];
  readonly activeChanges: DraftChange[];
  readonly draftChanges: DraftChange[];
  readonly droppedRows: string[];
}

describe("planRestoreToDraft over generated books and drafts", () => {
  const scenario: fc.Arbitrary<Scenario> = fc.record({
    archivedChanges: changesArbitrary,
    activeChanges: changesArbitrary,
    draftChanges: changesArbitrary,
    droppedRows: droppedRowsArbitrary,
  });

  function prepared({
    archivedChanges,
    activeChanges,
    draftChanges,
    droppedRows,
  }: Scenario) {
    const archivedWhole = bookOf(BASE, archivedChanges);
    const active = bookOf(BASE, activeChanges);
    fc.pre(archivedWhole !== undefined && active !== undefined);
    const candidateBefore = bookOf(active, draftChanges);
    fc.pre(candidateBefore !== undefined);
    const archived = without(archivedWhole, droppedRows);
    return {
      archived,
      active,
      draft: draftChanges,
      candidateBefore,
    };
  }

  it("leaves a candidate that applies and equals the archived book on every field the archive states", () => {
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft } = prepared(generated);

        const plan = planRestoreToDraft({ archived, active, draft });

        const candidate = bookOf(active, plan.draft);
        expect(candidate).toBeDefined();
        if (candidate === undefined) return;
        for (const stated of readEditableFields(archived)) {
          expect(valueAt(candidate, stated.address)).toEqual(stated.value);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("keeps a pending change to a field the archive does not state, with the value the person set", () => {
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft, candidateBefore } =
          prepared(generated);
        const plan = planRestoreToDraft({ archived, active, draft });

        const candidate = bookOf(active, plan.draft);
        if (candidate === undefined) return;
        const stated = readEditableFields(archived).map(
          ({ address }) => address,
        );
        for (const pending of draft) {
          const isStated = stated.some((address) =>
            isSameAddress(address, pending.address),
          );
          if (isStated) continue;
          expect(valueAt(candidate, pending.address)).toEqual(
            valueAt(candidateBefore, pending.address),
          );
        }
      }),
      { numRuns: 400 },
    );
  });

  it("writes one change per address, and no survivor of a field the archive states", () => {
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft } = prepared(generated);

        const plan = planRestoreToDraft({ archived, active, draft });

        const addresses = plan.draft.map(({ address }) => address);
        addresses.forEach((address, index) => {
          expect(
            addresses.findIndex((other) => isSameAddress(other, address)),
          ).toBe(index);
        });
        const added = restoreChanges(archived, active).map(
          ({ address }) => address,
        );
        const stated = readEditableFields(archived).map(
          ({ address }) => address,
        );
        for (const { address } of plan.draft) {
          const isAdded = added.some((other) => isSameAddress(other, address));
          const isStated = stated.some((other) =>
            isSameAddress(other, address),
          );
          expect(isAdded || !isStated).toBe(true);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("counts what the restore adds to the active book, and is nothing to restore exactly when the candidate already holds the archive", () => {
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft, candidateBefore } =
          prepared(generated);

        const plan = planRestoreToDraft({ archived, active, draft });

        expect(plan.addedChangeCount).toBe(
          restoreChanges(archived, active).length,
        );
        const holdsTheArchive = readEditableFields(archived).every(
          ({ address, value }) => valueAt(candidateBefore, address) === value,
        );
        expect(plan.differingCount === 0).toBe(holdsTheArchive);
      }),
      { numRuns: 400 },
    );
  });

  it("is idempotent: restoring again over the draft it wrote changes nothing and is nothing to restore", () => {
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft } = prepared(generated);
        const first = planRestoreToDraft({ archived, active, draft });

        const second = planRestoreToDraft({
          archived,
          active,
          draft: first.draft,
        });

        expect(second.differingCount).toBe(0);
        expect(bookOf(active, second.draft)).toEqual(
          bookOf(active, first.draft),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("generates scenarios that exercise the interesting cases, so the properties above are not vacuous", () => {
    let survivors = 0;
    let replaced = 0;
    let restoredWithPending = 0;
    fc.assert(
      fc.property(scenario, (generated) => {
        const { archived, active, draft } = prepared(generated);
        const plan = planRestoreToDraft({ archived, active, draft });
        const stated = readEditableFields(archived).map(
          ({ address }) => address,
        );
        const kept = draft.filter(
          ({ address }) =>
            !stated.some((other) => isSameAddress(other, address)),
        );
        survivors += kept.length > 0 ? 1 : 0;
        replaced += draft.length - kept.length > 0 ? 1 : 0;
        restoredWithPending +=
          plan.addedChangeCount > 0 && draft.length > 0 ? 1 : 0;
      }),
      { numRuns: 400 },
    );
    expect(survivors).toBeGreaterThan(10);
    expect(replaced).toBeGreaterThan(10);
    expect(restoredWithPending).toBeGreaterThan(10);
  });
});
