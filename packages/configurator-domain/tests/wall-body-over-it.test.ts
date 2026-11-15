// ADR 0183: the declaration a catalogue row makes about the wall body over it, with one reader per fact. The depth fact
// (decision 4, wave W3a) is a sibling of the generation fact, never a second meaning of it (Amendment A).
import { describe, expect, it } from "vitest";

import { buildInsertableBodyDefinitions } from "../src/catalog.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import {
  A_WALL_BODY_IS_OWED_AND_BUILT_DEEP_OVER_IT,
  declaresADeepWallBodyOver,
  isAWallBodyOwedOver,
  type WallBodyOverIt,
} from "../src/wall-body-over-it.js";

const DEPTH_ONLY: WallBodyOverIt = {
  isOwedByGeneration: false,
  isBuiltToTheDeepestCabinetDepth: true,
};
const GENERATION_ONLY: WallBodyOverIt = {
  isOwedByGeneration: true,
  isBuiltToTheDeepestCabinetDepth: false,
};

describe("the two facts of the declaration are independent", () => {
  it("reads the depth fact without the generation fact, and the other way round", () => {
    expect(declaresADeepWallBodyOver({ wallBodyOverIt: DEPTH_ONLY })).toBe(
      true,
    );
    expect(isAWallBodyOwedOver({ wallBodyOverIt: DEPTH_ONLY })).toBe(false);
    expect(declaresADeepWallBodyOver({ wallBodyOverIt: GENERATION_ONLY })).toBe(
      false,
    );
    expect(isAWallBodyOwedOver({ wallBodyOverIt: GENERATION_ONLY })).toBe(true);
  });

  it("states both facts for the freestanding fridge", () => {
    expect(A_WALL_BODY_IS_OWED_AND_BUILT_DEEP_OVER_IT).toEqual({
      isOwedByGeneration: true,
      isBuiltToTheDeepestCabinetDepth: true,
    });
  });

  it("reads an absent declaration and an absent row as no", () => {
    expect(declaresADeepWallBodyOver(undefined)).toBe(false);
    expect(declaresADeepWallBodyOver({})).toBe(false);
  });
});

describe("the depth fact is declared on both freestanding fridge rows and on no other", () => {
  it("in the shipped catalogue and in the seeded one, at every declared cabinet depth", () => {
    for (const cabinetDepthMm of [600, 700]) {
      for (const catalog of [
        new Map(buildInsertableBodyDefinitions(cabinetDepthMm)),
        buildKitchenLBodyCatalog(cabinetDepthMm),
      ]) {
        const declaring = [...catalog]
          .filter(([, definition]) => declaresADeepWallBodyOver(definition))
          .map(([buildId, definition]) => [buildId, definition.kind]);

        expect(declaring.length).toBeGreaterThanOrEqual(1);
        expect(
          declaring.every(([, kind]) => kind === "fridge_freestanding"),
        ).toBe(true);
        expect(declaring.map(([buildId]) => buildId)).toEqual(
          [...catalog]
            .filter(([, definition]) => isAWallBodyOwedOver(definition))
            .map(([buildId]) => buildId),
        );
      }
    }
  });

  it("names exactly `fridge-free` in the shipped rows and both fridge rows in the seeded catalogue", () => {
    const declares = (catalog: ReadonlyMap<string, object>) =>
      [...catalog]
        .filter(([, definition]) => declaresADeepWallBodyOver(definition))
        .map(([buildId]) => buildId)
        .sort();

    expect(declares(new Map(buildInsertableBodyDefinitions(600)))).toEqual([
      "fridge-free",
    ]);
    expect(declares(buildKitchenLBodyCatalog(600))).toEqual([
      "fridge-free",
      "fridge-free-700",
    ]);
  });
});
