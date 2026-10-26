import type { DraftChange } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  filterRows,
  groupRows,
  hasPendingPrice,
  isRuleModified,
  normalisedForSearch,
  pendingPriceCountOf,
  rowsOf,
  type CabinetListInput,
  type CabinetRow,
} from "@/price-dashboard/cabinet-list-model";
import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";

const BASE_CABINET = "cabinet.base-cabinet";
const THREE_DRAWER = "cabinet.base-3drawer";
const HOB_OVEN = "cabinet.base-hob-oven";
const HOOD = "cabinet.hood";

const ANCHOR_CHANGE: DraftChange = {
  address: { kind: "cabinet", ruleId: BASE_CABINET, field: "anchorMinor" },
  value: 150_000,
};
const WIDER_STEP_CHANGE: DraftChange = {
  address: {
    kind: "cabinet",
    ruleId: BASE_CABINET,
    field: "perStepWiderMinor",
  },
  value: 9_000,
};
const SIZE_CHANGE: DraftChange = {
  address: { kind: "cabinet-size", ruleId: HOB_OVEN, widthMm: 600 },
  value: 140_000,
};
const DEPTH_CHANGE: DraftChange = {
  address: { kind: "depth-rule" },
  value: 18,
};
const HARDWARE_CHANGE: DraftChange = {
  address: {
    kind: "hardware",
    tierId: "tier.base-cabinet",
    field: "perHingeMinor",
  },
  value: 3_000,
};

function draftOf(...changes: DraftChange[]) {
  return { draftRevision: "3", changes };
}

function inputWith(...changes: DraftChange[]): CabinetListInput {
  return { rules: SAMPLE_CABINET_LIST.rules, draft: draftOf(...changes) };
}

function rowOf(rows: readonly CabinetRow[], ruleId: string): CabinetRow {
  const found = rows.find((row) => row.facts.ruleId === ruleId);
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

const ruleIdsOf = (rows: readonly CabinetRow[]): string[] =>
  rows.map((row) => row.facts.ruleId);

describe("which cabinets the draft modifies", () => {
  it("marks a cabinet whose default-size price the draft changes", () => {
    expect(isRuleModified(draftOf(ANCHOR_CHANGE), BASE_CABINET)).toBe(true);
  });

  it("marks a fixed-size cabinet whose listed size the draft changes", () => {
    expect(isRuleModified(draftOf(SIZE_CHANGE), HOB_OVEN)).toBe(true);
  });

  it("leaves a cabinet the draft does not name alone", () => {
    expect(isRuleModified(draftOf(ANCHOR_CHANGE), THREE_DRAWER)).toBe(false);
  });

  it("is not moved by a change to a hardware class or the depth rule, even for an id that only looks alike", () => {
    const draft = draftOf(HARDWARE_CHANGE, DEPTH_CHANGE);

    expect(isRuleModified(draft, "tier.base-cabinet")).toBe(false);
    expect(isRuleModified(draft, BASE_CABINET)).toBe(false);
  });

  it("marks nothing for an empty draft", () => {
    expect(rowsOf(inputWith()).some((row) => row.isModified)).toBe(false);
  });
});

describe("the number the header and the menu show", () => {
  it("counts every change the draft holds, the depth rule and a hardware rate with the cabinet prices", () => {
    expect(
      pendingPriceCountOf(
        draftOf(ANCHOR_CHANGE, SIZE_CHANGE, DEPTH_CHANGE, HARDWARE_CHANGE),
      ),
    ).toBe(4);
  });

  it("is zero for an empty draft", () => {
    expect(pendingPriceCountOf(draftOf())).toBe(0);
  });
});

describe("a row shows the new price beside the active one", () => {
  it("only when the draft changes the price at the default size", () => {
    const rows = rowsOf(SAMPLE_CABINET_LIST);

    expect(hasPendingPrice(rowOf(rows, BASE_CABINET))).toBe(true);
    expect(hasPendingPrice(rowOf(rows, THREE_DRAWER))).toBe(false);
  });

  it("not for a cabinet modified at a step only, whose default-size price is what it was", () => {
    const stepOnly = rowsOf(
      inputWith({
        address: {
          kind: "cabinet",
          ruleId: THREE_DRAWER,
          field: "perStepWiderMinor",
        },
        value: 9_000,
      }),
    );

    expect(rowOf(stepOnly, THREE_DRAWER).isModified).toBe(true);
    expect(hasPendingPrice(rowOf(stepOnly, THREE_DRAWER))).toBe(false);
  });

  it("never for a cabinet the manufacturer does not supply, which has no price", () => {
    expect(hasPendingPrice(rowOf(rowsOf(SAMPLE_CABINET_LIST), HOOD))).toBe(
      false,
    );
  });
});

describe("the search", () => {
  const rows = rowsOf(SAMPLE_CABINET_LIST);
  const idsFor = (query: string, onlyModified = false) =>
    ruleIdsOf(filterRows(rows, { query, onlyModified }));

  it("keeps every row for an empty or blank query", () => {
    expect(idsFor("")).toHaveLength(rows.length);
    expect(idsFor("   ")).toHaveLength(rows.length);
  });

  it("matches a part of a name, in any case", () => {
    expect(idsFor("SUSPENDAT")).toEqual([
      "cabinet.wall-cabinet",
      "cabinet.wall-lift",
      "cabinet.wall-corner-return-570",
      "cabinet.wall-corner-return-570-top",
      "cabinet.wall-corner-x-900",
      "cabinet.wall-corner-x-900-top",
    ]);
  });

  it("ignores diacritics on either side", () => {
    expect(idsFor("coloana")).toEqual([
      "cabinet.tall-pantry",
      "cabinet.tall-oven-tower",
    ]);
    expect(idsFor("nisa")).toContain("cabinet.tall-fridge-housing");
  });

  it("finds nothing for a text no name holds", () => {
    expect(idsFor("zzz")).toEqual([]);
  });

  it("keeps only the modified rows under 'Doar modificate', and narrows them further by the query", () => {
    const modified = rowsOf(inputWith(ANCHOR_CHANGE, SIZE_CHANGE));

    expect(
      ruleIdsOf(filterRows(modified, { query: "", onlyModified: true })),
    ).toEqual([BASE_CABINET, HOB_OVEN]);
    expect(
      ruleIdsOf(filterRows(modified, { query: "cuptor", onlyModified: true })),
    ).toEqual([HOB_OVEN]);
  });

  it("folds case and diacritics the way the search compares them", () => {
    // The letters under test are the diacritics themselves, so they are written as codepoints.
    const upperWithDiacritics = String.fromCodePoint(
      0x218,
      0x102,
      0x21a,
      0xce,
      0x20,
      0xc2,
    );

    expect(normalisedForSearch(`  ${upperWithDiacritics} `)).toBe("sati a");
  });
});

describe("the groups", () => {
  it("come in the list's order, base, wall, tall, corner, whatever order the rows came in", () => {
    const reversed = [...rowsOf(SAMPLE_CABINET_LIST)].reverse();

    expect(groupRows(reversed).map((group) => group.code)).toEqual([
      "base",
      "wall",
      "tall",
      "corner",
    ]);
  });

  it("count the modified cabinets of each, one per cabinet and not per change", () => {
    const groups = groupRows(
      rowsOf(inputWith(ANCHOR_CHANGE, WIDER_STEP_CHANGE)),
    );

    expect(groups.map((group) => group.modifiedCount)).toEqual([1, 0, 0, 0]);
  });

  it("leave out a group no row is in", () => {
    const onlyWall = filterRows(rowsOf(SAMPLE_CABINET_LIST), {
      query: "rabatabil",
      onlyModified: false,
    });

    expect(groupRows(onlyWall).map((group) => group.code)).toEqual(["wall"]);
  });
});
