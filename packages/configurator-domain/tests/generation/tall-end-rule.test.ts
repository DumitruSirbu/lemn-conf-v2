// M7 wave 7D3 slice S2 — direct unit tests for the tall-end rule's pure leaf.
//
// **Added to discharge [ADR 0093](../../../../docs/decisions/0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
// decision 1**, which binds beyond its instance: *"a ruled behaviour that the tree cannot distinguish
// from its own absence is unshipped, whatever the code says. The obligation is discharged by an
// assertion that goes red when the behaviour is removed — never by the observation that the behaviour
// is derivable, and never by a comment."*
//
// Three of `planTallEndBlock`'s branches could not be reached through `generateKitchen` at all, and
// QA first recorded that unreachability as though it discharged them. **It does not.** Unreachable
// end-to-end is not the same as unbindable: this is a pure function over numbers, so every branch is
// witnessed by calling it with an input the test declares — decision 2's *"the fixture that makes a
// rule falsifiable is declared by the test that asserts it"*, one axis over.
//
// **The end-to-end unreachability is still recorded, beside each test rather than instead of it**, so
// the next reader knows which of these clauses are defensive and which are live.
//
// The rule's other two clauses are already witnessed and are deliberately not repeated here: E3
// clause 1 by `qa-7d3-tall-end-block.adversarial.test.ts`'s swept dropped-core test, and clause 4 by
// `tall-end-block.test.ts`'s 2199 mm ceiling fixture. Both go red when their clause is deleted.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
} from "../../src/index.js";
import { STORAGE_BODY_WIDTH_MM } from "../../src/generation/leftover-rule.js";
import {
  DOOR_COLUMN_BUILD_ID,
  HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
  OVEN_TOWER_BUILD_ID,
  planTallEndBlock,
  type TallEndRuleInput,
} from "../../src/generation/tall-end-rule.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../../src/module-grid.js";

const HOB_WITH_ITS_OWN_OVEN = "base-hob-oven";
const HOB_WITH_DRAWERS = "base-hob-2drawer";

/** The sizes the catalogue actually declares, read the way `generateKitchen` reads them. The tests
 *  below depart from these deliberately and say so; none of them restates one (ADR 0102). */
const DECLARED = declaredColumnSizes(
  buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
);

/** An input every clause of E3 accepts, so each test below changes exactly one thing and the change
 *  is what the assertion is about. */
function qualifyingInput(
  overrides: Partial<TallEndRuleInput> = {},
): TallEndRuleInput {
  return {
    coreSurvivedWhole: true,
    hobStandsOnTheFreeEndWall: true,
    freeEndStorageCount: 3,
    freeEndRemainderMm: 0,
    roomHeightMm: DECLARED.columnHeightMm,
    hobWithItsOwnOvenBuildId: HOB_WITH_ITS_OWN_OVEN,
    declared: DECLARED,
    ...overrides,
  };
}

describe("planTallEndBlock composes a block when every clause holds", () => {
  it("is the control the three witnesses below each depart from by one field", () => {
    const plan = planTallEndBlock(qualifyingInput());

    expect(plan.columns.map((column) => column.buildId)).toEqual([
      OVEN_TOWER_BUILD_ID,
      DOOR_COLUMN_BUILD_ID,
      DOOR_COLUMN_BUILD_ID,
    ]);
    expect(plan.storageCount).toBe(0);
    expect(plan.remainderMm).toBe(0);
    expect(plan.hobBuildId).toBe(HOB_WITH_DRAWERS);
  });
});

describe("E3 clause 2 — a hob on the prefix wall means no block and no substitution", () => {
  // ADR 0110 E2 and D6/QT-4: the prefix wall's leftover is at the corner end, which E2 forbids, and a
  // tower at the free end while the hob is round the corner would put the oven away from the cooking
  // position. **Amendment I2 re-pointed the wall and not the clause** — the free end is the suffix
  // wall's, whichever physical wall that is.
  //
  // **Unreachable through `generateKitchen` and recorded as such**: over 2.34 M planned rooms there is
  // no room where the hob stands on the prefix wall, the core survives whole, and the suffix wall
  // still yields a leftover module — `chooseWallCut` never produces that combination. The clause is
  // therefore defensive, for the wave that re-orders a run. Defensive is not the same as unwitnessed,
  // and this is the witness ADR 0093 decision 1 requires.
  it("refuses the block and leaves the hob its own oven when the hob is not on the free-end wall", () => {
    const plan = planTallEndBlock(
      qualifyingInput({ hobStandsOnTheFreeEndWall: false }),
    );

    expect(plan.columns).toEqual([]);
    expect(plan.hobBuildId).toBe(HOB_WITH_ITS_OWN_OVEN);
    // The wall keeps everything the leftover rule gave it: the block took nothing.
    expect(plan.storageCount).toBe(3);
    expect(plan.remainderMm).toBe(0);
  });

  it("echoes whatever hob id its caller passed rather than naming one of its own", () => {
    const plan = planTallEndBlock(
      qualifyingInput({
        hobStandsOnTheFreeEndWall: false,
        hobWithItsOwnOvenBuildId: "base-hob-some-later-body",
      }),
    );

    expect(plan.hobBuildId).toBe("base-hob-some-later-body");
  });
});

describe("a column that is no longer one storage module is refused loudly", () => {
  // The block swaps whole leftover modules for columns, so a column declared at any other width would
  // leave the composed run misaligned with the tiles the shell cut for it.
  //
  // **Unreachable through `generateKitchen`**: the catalogue declares every full-height row at
  // exactly one storage module, so the guard cannot fire from the real catalogue. It fires the day a
  // catalogue change makes it true, which is the day it is needed.
  it("throws naming both widths when the declared column is not the leftover rule's module", () => {
    const wider = STORAGE_BODY_WIDTH_MM + 100;

    expect(
      () =>
        planTallEndBlock(
          qualifyingInput({
            declared: { ...DECLARED, columnWidthMm: wider },
          }),
        ),
      // The two numbers are built from the constants rather than written out: a message pinned as a
      // literal would be a second authority for a declared size (ADR 0102) in the one file whose
      // whole subject is that the rule states no size of its own.
    ).toThrow(
      `a column declares ${String(wider)} mm against the leftover rule's ${String(STORAGE_BODY_WIDTH_MM)} mm module`,
    );
  });

  it("throws before any clause is read, so a refused room cannot hide the mismatch", () => {
    // Every other clause is false here: without the guard this input returns a blockless plan and
    // says nothing at all about the width it was handed.
    expect(() =>
      planTallEndBlock(
        qualifyingInput({
          coreSurvivedWhole: false,
          hobStandsOnTheFreeEndWall: false,
          freeEndStorageCount: 0,
          roomHeightMm: 0,
          declared: { ...DECLARED, columnWidthMm: STORAGE_BODY_WIDTH_MM - 1 },
        }),
      ),
    ).toThrow(/so a block can no longer take whole leftover modules/);
  });

  it("accepts the width the catalogue actually declares", () => {
    expect(DECLARED.columnWidthMm).toBe(STORAGE_BODY_WIDTH_MM);
    expect(() => planTallEndBlock(qualifyingInput())).not.toThrow();
  });
});

describe("E6.2 — a merged opening outside the door column's own bound is refused", () => {
  // The outermost column takes `600 + r` **by being planned at that width**, which it may only do
  // inside the row's declared bound (ADR 0048). Where the merge would exceed that bound the block is
  // not planned at all rather than built to a width it does not declare.
  //
  // **Unreachable through `generateKitchen` today, and only by coincidence**: `tall-pantry`'s maximum
  // is exactly ADR 0052's ceiling on an empty column, so every opening small enough to merge is also
  // inside the bound. Narrowing that bound is an ordinary product decision, and on the day it happens
  // this clause is the only thing between a customer and a pantry built to a width it never declared.
  const remainderThatMergesMm =
    MAX_EMPTY_COLUMN_WIDTH_MM - DECLARED.columnWidthMm;

  it("plans the outermost column at the merged width while the bound allows it", () => {
    const plan = planTallEndBlock(
      qualifyingInput({ freeEndRemainderMm: remainderThatMergesMm }),
    );

    expect(plan.columns.at(-1)).toEqual({
      buildId: DOOR_COLUMN_BUILD_ID,
      widthMm: MAX_EMPTY_COLUMN_WIDTH_MM,
    });
    expect(plan.remainderMm).toBe(0);
    expect(plan.hobBuildId).toBe(HOB_WITH_DRAWERS);
  });

  it("refuses the whole block when that same merge falls outside a narrowed bound", () => {
    // The one field that changes: a door column the catalogue declares no wider than 650 mm. The
    // merge still fits ADR 0052's ceiling, so only the row's own bound refuses it.
    const narrowedMaxMm = MAX_EMPTY_COLUMN_WIDTH_MM - 150;
    const plan = planTallEndBlock(
      qualifyingInput({
        freeEndRemainderMm: remainderThatMergesMm,
        declared: {
          ...DECLARED,
          doorColumnWidthMm: {
            ...DECLARED.doorColumnWidthMm,
            maxMm: narrowedMaxMm,
          },
        },
      }),
    );

    expect(narrowedMaxMm).toBeLessThan(
      DECLARED.columnWidthMm + remainderThatMergesMm,
    );
    expect(plan.columns).toEqual([]);
    expect(plan.hobBuildId).toBe(HOB_WITH_ITS_OWN_OVEN);
    expect(plan.storageCount).toBe(3);
    expect(plan.remainderMm).toBe(remainderThatMergesMm);
  });

  it("refuses it below the bound's floor as well as above its ceiling", () => {
    const plan = planTallEndBlock(
      qualifyingInput({
        freeEndRemainderMm: remainderThatMergesMm,
        declared: {
          ...DECLARED,
          doorColumnWidthMm: {
            minMm: MAX_EMPTY_COLUMN_WIDTH_MM + 1,
            maxMm: MAX_EMPTY_COLUMN_WIDTH_MM + 200,
          },
        },
      }),
    );

    expect(plan.columns).toEqual([]);
    expect(plan.hobBuildId).toBe(HOB_WITH_ITS_OWN_OVEN);
  });
});

// M7B U3a slice S2: the only edit this wave makes to this file is exporting
// `HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID`, which was already private and already this value — no L
// behaviour moved. This regression pins that literally: the exported constant and the qualifying
// plan's own `hobBuildId` still agree, and the "control" plan from the file's first describe block
// is unchanged byte for byte.
describe("M7B U3a S2 — the export adds no L behaviour", () => {
  it("HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID is still the block's own hob id", () => {
    expect(HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID).toBe(HOB_WITH_DRAWERS);
    expect(planTallEndBlock(qualifyingInput()).hobBuildId).toBe(
      HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
    );
  });

  it("the qualifying plan is byte-identical to the file's own recorded control", () => {
    expect(JSON.stringify(planTallEndBlock(qualifyingInput()))).toBe(
      JSON.stringify({
        columns: [
          { buildId: OVEN_TOWER_BUILD_ID, widthMm: DECLARED.columnWidthMm },
          { buildId: DOOR_COLUMN_BUILD_ID, widthMm: DECLARED.columnWidthMm },
          { buildId: DOOR_COLUMN_BUILD_ID, widthMm: DECLARED.columnWidthMm },
        ],
        storageCount: 0,
        remainderMm: 0,
        hobBuildId: HOB_WITH_DRAWERS,
      }),
    );
  });
});
