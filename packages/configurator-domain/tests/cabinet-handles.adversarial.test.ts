// Wave 6L QA, domain half. `cabinet-handles.test.ts` states the rule; this file attacks it.
//
// The module widens its own input past what `BodyDefinition` declares — `rule` is
// `CabinetHandleRule | undefined` — precisely because `BodyCatalog` is a port and a definition
// assembled outside TypeScript can arrive malformed. That widening is what these tests hold it to:
// **every** shape that is not one of the two rules has to refuse, and no shape may reach a number
// that is not a number.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cabinetHandleCount,
  carriesHandles,
  handlesOnDoorLeaves,
  KITCHEN_L_BODY_CATALOG,
  TWO_DOOR_MIN_WIDTH_MM,
  UndeclaredCabinetHandleCountError,
} from "../src/index.js";

const ANY_WIDTH_MM = 600;

/** Every width the two-door threshold could plausibly be moved to and still be a cabinet: wide
 *  enough on both sides of 500 that a threshold nudged by a millimetre shows up. */
const SWEPT_WIDTHS_MM = { min: 1, max: 2000 };

function countAt(rule: unknown, widthMm: number): number {
  return cabinetHandleCount({
    buildId: "probe-body",
    rule: rule as never,
    widthMm,
  });
}

describe("the refusal is total, not partial", () => {
  // `null` is the shape a JSON document carries an absent field as, and `{}` is what a definition
  // built by spreading a partial record produces. Neither is `undefined`, so neither reaches the
  // `?.` arm by the same route the implementer's test does.
  it.each([
    ["null", null],
    ["an empty object", {}],
    ["a bare string", "door-count"],
    ["an array", ["door-count", 2]],
    ["a number", 2],
    [
      "a rule naming a shape that does not exist",
      { countedFrom: "mesh-count", handles: 4 },
    ],
  ])("refuses %s", (_label, rule) => {
    expect(() => countAt(rule, ANY_WIDTH_MM)).toThrow(
      UndeclaredCabinetHandleCountError,
    );
    expect(() => countAt(rule, ANY_WIDTH_MM)).toThrow(/probe-body/);
  });

  // **The two shapes that are recognised and still incomplete.** `countedFrom` names a rule this
  // module knows, and the number the rule is made of is missing — the case a port hands over when a
  // catalogue row was authored with the tag and not the count.
  //
  // Neither refused when this file was written: the first returned `undefined` and the second
  // `NaN`, out of a function typed `: number` — the DOM-002 shape ADR 0061 decision 4 was written
  // against, a wrong answer nothing looks at, arriving one field later than the case the module
  // guarded. `usableCountOf` closed both, and the two tests below are what holds them closed.
  it("refuses a declared-count rule that declares no count", () => {
    expect(() =>
      countAt({ countedFrom: "declared-count" }, ANY_WIDTH_MM),
    ).toThrow(UndeclaredCabinetHandleCountError);
  });

  it("refuses a door-count rule that declares no handles per door", () => {
    expect(() => countAt({ countedFrom: "door-count" }, ANY_WIDTH_MM)).toThrow(
      UndeclaredCabinetHandleCountError,
    );
  });

  // The anti-invariant behind both refusals, stated once: there is no rule shape and no width for
  // which this function answers with something that is not a count.
  it.each([
    ["declared-count", { countedFrom: "declared-count" }],
    ["door-count", { countedFrom: "door-count" }],
  ])("never answers %s with a non-number", (_label, rule) => {
    let answer: unknown = "threw";
    try {
      answer = countAt(rule, ANY_WIDTH_MM);
    } catch {
      answer = "threw";
    }

    expect(answer === "threw" || Number.isSafeInteger(answer)).toBe(true);
  });
});

describe("the declared count is a count, for every shipped entry", () => {
  // The catalogue's own declarations, read back through the query the price will use. A rule that
  // resolves to a fraction, a negative, or a non-integer is not a quantity anything can be billed
  // for — and no shipped row may produce one at any width it can be built at.
  it("answers every entry with a non-negative whole number at every declared width", () => {
    const offending: string[] = [];

    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      const widths = definition.sizesMm ?? [ANY_WIDTH_MM];
      for (const widthMm of widths) {
        const count = cabinetHandleCount({
          buildId,
          rule: definition.cabinetHandles,
          widthMm,
        });
        if (!Number.isSafeInteger(count) || count < 0) {
          offending.push(`${buildId}@${String(widthMm)} => ${String(count)}`);
        }
      }
    }

    expect(offending).toEqual([]);
  });

  // Determinism, which a price line needs and which nothing else asserts: the same query answered
  // twice is the same number, and the answer depends on nothing but the query.
  it("answers the same query with the same number every time", () => {
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      const query = {
        buildId,
        rule: definition.cabinetHandles,
        widthMm: definition.sizesMm?.[0] ?? ANY_WIDTH_MM,
      };
      expect(cabinetHandleCount(query)).toBe(cabinetHandleCount(query));
    }
  });
});

describe("a per-door rule follows the door count and nothing else", () => {
  // Swept rather than sampled at the boundary: the implementer's test pins 499/500/501, which holds
  // for any rule with a step somewhere near 500 — including a rule with a *second* step further out.
  // This one asserts there is exactly one step in the whole reachable width range, and that it is
  // at `TWO_DOOR_MIN_WIDTH_MM`.
  it.each([1, 2, 3])(
    "steps exactly once, at the two-door threshold, for %i handles per door",
    (perDoor) => {
      const rule = handlesOnDoorLeaves({
        doorTiers: 1,
        handlesPerLeaf: perDoor,
      });
      const steps: number[] = [];

      for (
        let mm = SWEPT_WIDTHS_MM.min + 1;
        mm <= SWEPT_WIDTHS_MM.max;
        mm += 1
      ) {
        if (countAt(rule, mm) !== countAt(rule, mm - 1)) steps.push(mm);
      }

      expect(steps).toEqual([TWO_DOOR_MIN_WIDTH_MM]);
      expect(countAt(rule, TWO_DOOR_MIN_WIDTH_MM - 1)).toBe(perDoor);
      expect(countAt(rule, TWO_DOOR_MIN_WIDTH_MM)).toBe(perDoor * 2);
    },
  );

  propertyTest.prop([
    fc.integer(SWEPT_WIDTHS_MM),
    fc.integer(SWEPT_WIDTHS_MM),
    fc.integer({ min: 0, max: 4 }),
  ])(
    "never gives a narrower cabinet more handles than a wider one",
    (aMm: number, bMm: number, perDoor: number) => {
      const [narrow, wide] = aMm <= bMm ? [aMm, bMm] : [bMm, aMm];
      const rule = handlesOnDoorLeaves({
        doorTiers: 1,
        handlesPerLeaf: perDoor,
      });

      expect(countAt(rule, narrow)).toBeLessThanOrEqual(countAt(rule, wide));
    },
  );

  propertyTest.prop([
    fc.integer(SWEPT_WIDTHS_MM),
    fc.integer({ min: 0, max: 6 }),
  ])(
    "gives a fixed-count body the same number at every width",
    (widthMm: number, handles: number) => {
      expect(countAt(carriesHandles(handles), widthMm)).toBe(handles);
    },
  );
});
