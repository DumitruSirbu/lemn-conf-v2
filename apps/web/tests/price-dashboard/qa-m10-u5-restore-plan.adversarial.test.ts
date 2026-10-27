// Adversarial QA of M10 wave U5: what a restore makes of the draft, swept. `publish-model.test.ts` holds four hand-picked
// shapes of draft against archived; it never has the archived price equal to the draft's while another field still
// differs (active 100, draft 120, archived 120), the shape in which `planRestore` removes the draft's change and adds
// nothing in its place. The oracle here is the plan's whole promise (M1-a, A-15): applying the restored draft to the active
// book gives the archived value on every editable field the archived version states.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  restoreChanges,
  type AppliedAddress,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { planRestore } from "@/price-dashboard/publish-model";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

const ACTIVE: PriceBook = SAMPLE_PUBLISH_PAGE.state.active.book;

const BASE_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
};
const DRAWER_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.base-3drawer",
  field: "anchorMinor",
};
const DEPTH_RULE: AppliedAddress = { kind: "depth-rule" };
const PROVISIONAL: AppliedAddress = { kind: "provisional" };

function valueAtOrThrow(book: PriceBook, address: AppliedAddress) {
  const reading = readEditableFields(book).find((row) =>
    isSameAddress(row.address, address),
  );
  if (reading === undefined) throw new Error("no such field");
  return reading.value;
}

function numberAt(address: AppliedAddress): number {
  const value = valueAtOrThrow(ACTIVE, address);
  if (typeof value !== "number") throw new Error("not a number");
  return value;
}

function change(address: AppliedAddress, value: number | boolean): DraftChange {
  return { address, value } as DraftChange;
}

function bookWith(changes: readonly DraftChange[]): PriceBook {
  const applied = applyChanges(ACTIVE, changes);
  if (!applied.ok) throw new Error("the changes do not make a book");
  return applied.book;
}

/** The fields on which the archived book states a value that the book the plan makes does not hold. */
function fieldsLeftWrong(archived: PriceBook, draft: readonly DraftChange[]) {
  const applied = applyChanges(ACTIVE, draft);
  if (!applied.ok) return ["plan.draft is refused by applyChanges"];
  return readEditableFields(archived)
    .filter(
      (reading) =>
        valueAtOrThrow(applied.book, reading.address) !== reading.value,
    )
    .map((reading) => JSON.stringify(reading.address));
}

describe("a restore when the archived price equals the draft's and another field still differs", () => {
  it("keeps the price the draft already moved to (active 100, draft 120, archived 120, a second field differs)", () => {
    const sharedValue = numberAt(BASE_ANCHOR) + 20_000;
    const drawerActive = numberAt(DRAWER_ANCHOR);
    const draft = [
      change(BASE_ANCHOR, sharedValue),
      change(DRAWER_ANCHOR, drawerActive + 5_000),
    ];
    const archived = bookWith([
      change(BASE_ANCHOR, sharedValue),
      change(DRAWER_ANCHOR, drawerActive + 9_000),
    ]);

    const plan = planRestore({ archived, active: ACTIVE, draft });

    expect(plan.differingCount).toBeGreaterThan(0);
    expect(fieldsLeftWrong(archived, plan.draft)).toEqual([]);
  });
});

/** Per address: leave the field out, keep the active value, or move it to one of two other legal values. */
const POOL: readonly {
  readonly address: AppliedAddress;
  readonly values: readonly (number | boolean)[];
}[] = [
  {
    address: BASE_ANCHOR,
    values: [
      numberAt(BASE_ANCHOR),
      numberAt(BASE_ANCHOR) + 20_000,
      numberAt(BASE_ANCHOR) - 10_000,
    ],
  },
  {
    address: DRAWER_ANCHOR,
    values: [
      numberAt(DRAWER_ANCHOR),
      numberAt(DRAWER_ANCHOR) + 5_000,
      numberAt(DRAWER_ANCHOR) + 9_000,
    ],
  },
  {
    address: DEPTH_RULE,
    values: [numberAt(DEPTH_RULE), 10, 25],
  },
  {
    address: PROVISIONAL,
    values: [valueAtOrThrow(ACTIVE, PROVISIONAL), true, false],
  },
];

/** A choice per pool entry: -1 leaves the field out, otherwise the index of the value it is set to. */
const choicesArbitrary = fc.array(fc.integer({ min: -1, max: 2 }), {
  minLength: POOL.length,
  maxLength: POOL.length,
});

function changesOf(choices: readonly number[]): readonly DraftChange[] {
  return POOL.flatMap((entry, index) => {
    const choice = choices[index] ?? -1;
    const value = entry.values[choice];
    return value === undefined ? [] : [change(entry.address, value)];
  });
}

describe("a restore over every mix of draft and archived values", () => {
  propertyTest.prop([choicesArbitrary, choicesArbitrary], { numRuns: 400 })(
    "leaves every field the archived version states at the archived value, whatever the draft held",
    (draftChoices, archivedChoices) => {
      const draft = changesOf(draftChoices);
      const archived = bookWith(changesOf(archivedChoices));

      const plan = planRestore({ archived, active: ACTIVE, draft });

      // `differingCount === 0` is the case the client answers "nothing differs" and stores nothing for.
      if (plan.differingCount === 0) return;
      expect(fieldsLeftWrong(archived, plan.draft)).toEqual([]);
    },
  );

  propertyTest.prop([choicesArbitrary, choicesArbitrary], { numRuns: 200 })(
    "adds one change for every field on which the archived price is not the active one, whatever the draft held",
    (draftChoices, archivedChoices) => {
      const draft = changesOf(draftChoices);
      const archived = bookWith(changesOf(archivedChoices));

      const plan = planRestore({ archived, active: ACTIVE, draft });

      if (plan.differingCount === 0) return;
      expect(plan.addedChangeCount).toBe(
        restoreChanges(archived, ACTIVE).length,
      );
    },
  );
});
