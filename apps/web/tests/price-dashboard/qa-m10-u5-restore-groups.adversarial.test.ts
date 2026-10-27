// Adversarial QA of M10 wave U5, review round: what a restore makes of a bulk action the archived version only partly
// states. `publish-model.test.ts` has the one case of a group losing members; this file sweeps which of the group's cabinets
// the archived book states, with a second bulk action beside it, and holds the plan to three promises: a survivor of a
// broken group is an ordinary change (neither `groupId` nor `bulk`), a group nothing was taken from stays whole and
// identical, and the plan applies to the active book and reproduces every stated field.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftBulk,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { planRestore } from "@/price-dashboard/publish-model";
import {
  SAMPLE_FLAT_BOOK,
  SAMPLE_PUBLISH_PAGE,
} from "@/price-dashboard/publish-sample";

const ACTIVE: PriceBook = SAMPLE_PUBLISH_PAGE.state.active.book;
const FLAT: PriceBook = SAMPLE_FLAT_BOOK;
const AMOUNT_FIELDS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
] as const;
const TALL_RULES = [
  "cabinet.tall-pantry",
  "cabinet.tall-oven-tower",
  "cabinet.tall-fridge-housing",
] as const;
const WALL_RULES = ["cabinet.wall-cabinet", "cabinet.wall-lift"] as const;
const TALL_GROUP = "bulk-tall";
const WALL_GROUP = "bulk-wall";
const TALL_BULK: DraftBulk = { percent: 5, scope: "group", groupCode: "tall" };
const WALL_BULK: DraftBulk = {
  percent: -10,
  scope: "group",
  groupCode: "wall",
};
const ROUNDING_UNIT = 1_000;

function numberAt(book: PriceBook, address: AppliedAddress): number {
  const reading = readEditableFields(book).find((row) =>
    isSameAddress(row.address, address),
  );
  if (typeof reading?.value !== "number") throw new Error("not a number");
  return reading.value;
}

function groupOf(
  ruleIds: readonly string[],
  group: { groupId: string; bulk: DraftBulk },
): DraftChange[] {
  return ruleIds.flatMap((ruleId) =>
    AMOUNT_FIELDS.map((field): DraftChange => {
      const address = { kind: "cabinet", ruleId, field } as const;
      const scaled =
        Math.round(
          (numberAt(ACTIVE, address) * (100 + group.bulk.percent)) /
            100 /
            ROUNDING_UNIT,
        ) * ROUNDING_UNIT;
      return { address, value: scaled, ...group } as DraftChange;
    }),
  );
}

const DRAFT: readonly DraftChange[] = [
  ...groupOf(TALL_RULES, { groupId: TALL_GROUP, bulk: TALL_BULK }),
  ...groupOf(WALL_RULES, { groupId: WALL_GROUP, bulk: WALL_BULK }),
];

/** The active book, with these cabinets' prices in the flat form, which states none of the three anchored amounts. */
function archivedWithout(ruleIds: readonly string[]): PriceBook {
  return {
    ...ACTIVE,
    cabinetRules: ACTIVE.cabinetRules.map((rule) => {
      const flat = FLAT.cabinetRules.find(
        (candidate) => candidate.ruleId === rule.ruleId,
      );
      return ruleIds.includes(rule.ruleId) && flat !== undefined ? flat : rule;
    }),
  };
}

function states(book: PriceBook, change: DraftChange): boolean {
  return readEditableFields(book).some((reading) =>
    isSameAddress(reading.address, change.address),
  );
}

describe("a restore of a version that states only some of a bulk action's cabinets", () => {
  it("is built on archived books that really leave the chosen cabinets unstated", () => {
    const archived = archivedWithout(["cabinet.tall-pantry"]);

    const unstated = DRAFT.filter((change) => !states(archived, change));

    expect(
      unstated.map((change) => (change.address as { ruleId: string }).ruleId),
    ).toEqual([
      "cabinet.tall-pantry",
      "cabinet.tall-pantry",
      "cabinet.tall-pantry",
    ]);
  });

  it("turns the survivors of the broken group into ordinary changes and leaves the other group whole, value for value", () => {
    const archived = archivedWithout(["cabinet.tall-pantry", ...WALL_RULES]);

    const plan = planRestore({ archived, active: ACTIVE, draft: DRAFT });

    const survivors = plan.draft.filter(
      (change) =>
        (change.address as { ruleId?: string }).ruleId ===
        "cabinet.tall-pantry",
    );
    expect(survivors).toHaveLength(3);
    for (const survivor of survivors) {
      expect(Object.keys(survivor).sort()).toEqual(["address", "value"]);
    }
    const wall = plan.draft.filter((change) => change.groupId === WALL_GROUP);
    expect(wall).toEqual(
      DRAFT.filter((change) => change.groupId === WALL_GROUP),
    );
    expect(plan.draft.some((change) => change.groupId === TALL_GROUP)).toBe(
      false,
    );
  });

  it("takes a group out altogether when the archived version states every one of its cabinets", () => {
    const plan = planRestore({
      archived: ACTIVE,
      active: ACTIVE,
      draft: DRAFT,
    });

    expect(plan.draft.filter((change) => change.groupId !== undefined)).toEqual(
      [],
    );
  });

  propertyTest.prop(
    [
      fc.subarray([...TALL_RULES, ...WALL_RULES]),
      fc.subarray([...TALL_RULES, ...WALL_RULES]),
    ],
    { numRuns: 200 },
  )(
    "keeps every group either whole and unchanged or gone, and applies to the active book, whichever cabinets the archived version leaves out",
    (unstatedRules, draftRules) => {
      const draft = DRAFT.filter((change) =>
        draftRules.includes(
          (change.address as { ruleId: string }).ruleId as never,
        ),
      );
      const archived = archivedWithout(unstatedRules);

      const plan = planRestore({ archived, active: ACTIVE, draft });

      for (const groupId of [TALL_GROUP, WALL_GROUP]) {
        const before = draft.filter((change) => change.groupId === groupId);
        const after = plan.draft.filter((change) => change.groupId === groupId);
        const isUntouched = before.every((change) => !states(archived, change));
        expect(after, groupId).toEqual(isUntouched ? before : []);
      }
      const orphans = plan.draft.filter(
        (change) => change.groupId === undefined && change.bulk !== undefined,
      );
      expect(orphans).toEqual([]);
      const applied = applyChanges(ACTIVE, plan.draft);
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      for (const reading of readEditableFields(archived)) {
        const held = readEditableFields(applied.book).find((row) =>
          isSameAddress(row.address, reading.address),
        );
        expect(held?.value, JSON.stringify(reading.address)).toBe(
          reading.value,
        );
      }
    },
  );
});
