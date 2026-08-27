// Adversarial QA on ADR 0026's amended premise: three catalogue rows now declare a floor **below**
// §2's default, where the ADR was written with one.
//
// The claim under test is that the fix to `catalog-bodies.adversarial.test.ts`'s
// `narrowestOpeningMm` is real — that the `'fit'` sweep genuinely reaches 200 mm now, where
// `Math.max(declared, 300)` meant no builder was ever asked for a carcass under 300 mm at all — and
// that the builders behind those rows really do build correctly down there. Asserted here from the
// other end, against the entries by name and the widths by number, so it cannot pass because a
// generated sweep quietly stopped short.
import {
  FIT_TOLERANCE_M,
  INSERTABLE_BODY_DEFINITIONS,
  MIN_WIDTH_M,
  toMetres,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { measureBuiltBody } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function definitionOf(buildId: string): BodyDefinition {
  const entry = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === buildId);
  if (!entry) throw new Error(`no catalogue entry for ${buildId}`);
  return entry[1];
}

/** `refuseBuiltSize`'s gate, restated rather than imported, so this asserts the engine's rule and
 *  not a QA-invented tolerance. */
function builtWithin(builtM: number, requiredMm: number): boolean {
  return (
    Number.isFinite(builtM) &&
    Math.abs(builtM - toMetres(requiredMm)) <= FIT_TOLERANCE_M
  );
}

function buildAt(buildId: string, widthMm: number) {
  const definition = definitionOf(buildId);
  return measureBuiltBody({
    kit,
    room,
    request: {
      buildId,
      widthM: toMetres(widthMm),
      heightM: toMetres(definition.nominalHeightMm ?? 0),
      depthM: toMetres(definition.nominalDepthMm ?? 0),
    },
  });
}

/** ADR 0026 clause 3 as ADR 0030's amendment left it: three rows, all at 200. */
const DECLARED_BELOW_DEFAULT = [
  "base-bottle-cargo",
  "base-1door",
  "wall-1door",
];

describe("the rows that declare a floor below §2's default", () => {
  it("is exactly three, and every one of them declares 200", () => {
    const below = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) =>
        definition.minWidthMm !== undefined &&
        definition.minWidthMm < 1000 * MIN_WIDTH_M,
    );

    expect(below.map(([buildId]) => buildId).sort()).toEqual(
      [...DECLARED_BELOW_DEFAULT].sort(),
    );
    for (const [, definition] of below) {
      expect(definition.minWidthMm).toBe(200);
    }
  });

  it("lists no chip below its own declared floor", () => {
    for (const buildId of DECLARED_BELOW_DEFAULT) {
      const definition = definitionOf(buildId);
      for (const widthMm of definition.sizesMm ?? []) {
        expect(widthMm).toBeGreaterThanOrEqual(definition.minWidthMm ?? 0);
      }
    }
  });
});

describe("the builders behind them are correct below 300 mm", () => {
  it.each(DECLARED_BELOW_DEFAULT)(
    "%s builds a carcass the engine accepts at every 10 mm from 200 to 300",
    (buildId) => {
      const definition = definitionOf(buildId);
      const wrong: number[] = [];
      for (let widthMm = 200; widthMm <= 300; widthMm += 10) {
        const built = buildAt(buildId, widthMm);
        if (
          !builtWithin(built.carcassWidthM, widthMm) ||
          !builtWithin(built.carcassHeightM, definition.nominalHeightMm ?? 0)
        ) {
          wrong.push(widthMm);
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  it.each(DECLARED_BELOW_DEFAULT)(
    "%s builds every chip it actually lists",
    (buildId) => {
      const definition = definitionOf(buildId);
      for (const widthMm of definition.sizesMm ?? []) {
        const built = buildAt(buildId, widthMm);
        expect(builtWithin(built.carcassWidthM, widthMm)).toBe(true);
      }
    },
  );

  it("would have skipped 200 to 290 under the old Math.max floor", () => {
    // The defect the sweep's fix closed, stated as the arithmetic rather than as a story: with
    // `Math.max(declared, MIN_WIDTH_M)` every one of these three rows started its sweep at 300, so
    // the ten widths above were never handed to a builder at all.
    for (const buildId of DECLARED_BELOW_DEFAULT) {
      const declaredMm = definitionOf(buildId).minWidthMm ?? 0;
      expect(Math.max(declaredMm, 1000 * MIN_WIDTH_M)).toBe(300);
      expect(declaredMm).toBe(200);
    }
  });
});
