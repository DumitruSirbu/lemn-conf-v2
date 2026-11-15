// **M12 wave W3b adversarial QA (ADR 0183 decision 4): the fridge arm and the one row that declares it.**
//
// The arm lives in two places that must not drift: the column's live fact (`hasDeepWallBodyUnder`, answered over records)
// and the row's static declaration (`builtDepthFollowsTheDeepestCabinetDepth`, read by the equivalence gate). The gate
// holds them together on the shipped seed; these tests hold the declaration's own shape over every declared setting.
import { describe, expect, it } from "vitest";

import {
  columnBuildDepthMm,
  declaresALiftedColumnDepth,
  declaresTheDeepestCabinetDepth,
  deepestDeclaredCabinetDepthMm,
} from "../src/cabinet-depth-rule.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";

/** The owner's number, written out so adding a depth row forces the decision to be taken again (ADR 0183 decision 4). */
const OWNERS_DEEPEST_DEPTH_MM = 700;
const OVER_THE_FRIDGE_ROW = "wall-2door-700-over-fridge";
const WALL_FRONT_ASSEMBLY_MM = 39;

describe("the deepest declared cabinet depth", () => {
  it("is the owner's 700", () => {
    expect(deepestDeclaredCabinetDepthMm()).toBe(OWNERS_DEEPEST_DEPTH_MM);
    expect(Math.max(...declaredCabinetDepthsMm())).toBe(
      OWNERS_DEEPEST_DEPTH_MM,
    );
  });
});

describe("a row that declares the fridge arm", () => {
  it.each(declaredCabinetDepthsMm())(
    "also declares the lifted arm at %i mm, because the fridge's column is a full-height column (the arms nest)",
    (cabinetDepthMm) => {
      const declaring = [...buildKitchenLBodyCatalog(cabinetDepthMm)].filter(
        ([, definition]) => declaresTheDeepestCabinetDepth(definition),
      );

      expect(declaring.map(([buildId]) => buildId)).toEqual([
        OVER_THE_FRIDGE_ROW,
      ]);
      for (const [buildId, definition] of declaring) {
        expect(declaresALiftedColumnDepth(definition), buildId).toBe(true);
      }
    },
  );
});

describe("columnBuildDepthMm's fridge arm, swept over every setting and both flags", () => {
  const FLAGS = [false, true] as const;

  it.each(declaredCabinetDepthsMm())(
    "answers the deepest depth at %i mm whether or not a full-height flag stands, and never the setting or the cap",
    (cabinetDepthMm) => {
      for (const hasFullHeightUnder of FLAGS) {
        expect(
          columnBuildDepthMm({
            cabinetDepthMm,
            hasFullHeightUnder,
            hasDeepWallBodyUnder: true,
          }),
        ).toBe(deepestDeclaredCabinetDepthMm());
      }
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "answers nothing deeper than the setting at %i mm once no fridge is under the column",
    (cabinetDepthMm) => {
      for (const hasFullHeightUnder of FLAGS) {
        expect(
          columnBuildDepthMm({
            cabinetDepthMm,
            hasFullHeightUnder,
            hasDeepWallBodyUnder: false,
          }),
        ).toBeLessThanOrEqual(cabinetDepthMm);
      }
    },
  );

  it("differs from the lifted arm at the shallow setting and agrees with it at the deepest (the two arms are separate claims)", () => {
    const [shallowest] = declaredCabinetDepthsMm();
    const arm = (cabinetDepthMm: number, hasDeepWallBodyUnder: boolean) =>
      columnBuildDepthMm({
        cabinetDepthMm,
        hasFullHeightUnder: true,
        hasDeepWallBodyUnder,
      });

    expect(arm(shallowest ?? 0, true)).not.toBe(arm(shallowest ?? 0, false));
    expect(arm(OWNERS_DEEPEST_DEPTH_MM, true)).toBe(
      arm(OWNERS_DEEPEST_DEPTH_MM, false),
    );
  });
});

describe("the row that declares the fridge arm", () => {
  it.each(declaredCabinetDepthsMm())(
    "is exactly one row at %i mm, it also declares the lifted arm it implies, and it finishes at 700",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const declaring = [...catalog].filter(([, definition]) =>
        declaresTheDeepestCabinetDepth(definition),
      );

      expect(declaring.map(([buildId]) => buildId)).toStrictEqual([
        OVER_THE_FRIDGE_ROW,
      ]);
      for (const [buildId, definition] of declaring) {
        expect(declaresALiftedColumnDepth(definition)).toBe(true);
        expect(
          Math.round(1000 * occupiedDepthOfEntryM({ buildId, definition })),
        ).toBe(OWNERS_DEEPEST_DEPTH_MM);
        expect(definition.frameDepthMm).toBe(
          OWNERS_DEEPEST_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
        );
      }
    },
  );

  it("is read as no declaration when the row is absent from the catalogue or declares nothing", () => {
    expect(declaresTheDeepestCabinetDepth(undefined)).toBe(false);
    expect(declaresTheDeepestCabinetDepth({})).toBe(false);
    expect(
      declaresTheDeepestCabinetDepth({
        builtDepthFollowsTheDeepestCabinetDepth: false,
      }),
    ).toBe(false);
  });
});
