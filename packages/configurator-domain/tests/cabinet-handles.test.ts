// ADR 0061 decisions 2–4, from the domain side: the count is a declaration, every shipped entry
// carries one, and an entry that carries none refuses rather than guesses.
//
// What this file cannot check is whether a declaration is *true of the meshes* — the domain has no
// meshes. That is `cabinet-handle-count.parity.test.ts` in `@lemnaria/three-adapter`, and the two
// halves are the whole gate.
import { describe, expect, it } from "vitest";

import {
  cabinetHandleCount,
  carriesHandles,
  type DoorLeafHandles,
  handlesOnDoorLeaves,
  KITCHEN_L_BODY_CATALOG,
  NO_CABINET_HANDLES,
  TWO_DOOR_MIN_WIDTH_MM,
  UndeclaredCabinetHandleCountError,
  widthDerivedDoorLeafCount,
} from "../src/index.js";
import { deriveDoorCount } from "../src/door-count.js";

const ANY_WIDTH_MM = 600;

describe("a cabinet-handle count is declared, per entry", () => {
  it("every entry in both populations declares one", () => {
    const undeclared = [...KITCHEN_L_BODY_CATALOG]
      .filter(([, definition]) => definition.cabinetHandles === undefined)
      .map(([buildId]) => buildId);

    expect(undeclared).toEqual([]);
    // Not a vacuous sweep over an empty map.
    // 38 → 40 (M7C wave C2): the corner wall unit's two rows.
    expect(KITCHEN_L_BODY_CATALOG.size).toBe(40);
  });

  it("counts the handles a fixed body draws, whatever width it is asked about", () => {
    expect(
      cabinetHandleCount({
        buildId: "base-3drawer",
        rule: carriesHandles(3),
        widthMm: 300,
      }),
    ).toBe(3);
    expect(
      cabinetHandleCount({
        buildId: "base-3drawer",
        rule: carriesHandles(3),
        widthMm: 800,
      }),
    ).toBe(3);
  });

  it("counts a pantry's two tiers of leaves, one bar on each leaf", () => {
    const pantry = (widthMm: number): number =>
      cabinetHandleCount({
        buildId: "tall-pantry",
        rule: handlesOnDoorLeaves({ doorTiers: 2, handlesPerLeaf: 1 }),
        widthMm,
      });

    expect(pantry(TWO_DOOR_MIN_WIDTH_MM - 1)).toBe(2);
    expect(pantry(TWO_DOOR_MIN_WIDTH_MM)).toBe(4);
  });

  it("counts nothing for a body whose only bars are an appliance's", () => {
    expect(
      cabinetHandleCount({
        buildId: "fridge-free",
        rule: NO_CABINET_HANDLES,
        widthMm: 700,
      }),
    ).toBe(0);
  });

  // ADR 0061's named case: the oven tower draws four bars and the customer is buying two.
  it("bills tall-oven-tower for two handles, not for its four bars", () => {
    for (const buildId of ["tall-oven-tower", "tall-oven-tower-600"]) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(
        cabinetHandleCount({
          buildId,
          rule: definition?.cabinetHandles,
          widthMm: 600,
        }),
      ).toBe(2);
    }
  });

  // ADR 0061 decision 4. A silent default is how four families carried a wrong `occupiedDepth` with
  // every suite green (DOM-002); neither 0 nor a mesh count is an answer here.
  it("refuses an undeclared entry instead of falling back to zero", () => {
    expect(() =>
      cabinetHandleCount({
        buildId: "some-new-body",
        rule: undefined,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(UndeclaredCabinetHandleCountError);
  });

  it("names the entry it refused, so the defect is findable", () => {
    expect(() =>
      cabinetHandleCount({
        buildId: "some-new-body",
        rule: undefined,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(/some-new-body/);
  });

  // A rule can be recognised and still hold no count — the shape a row authored with the tag and
  // without the number arrives as. Refused per arm, and refused for a number that is not a quantity:
  // handles are counted objects, so a fraction or a negative is not a surprising count but an
  // unbillable one. `0` is a real answer and is asserted above.
  it.each([
    ["declared-count", "with no count", { countedFrom: "declared-count" }],
    [
      "declared-count",
      "counting backwards",
      { countedFrom: "declared-count", handles: -1 },
    ],
    [
      "declared-count",
      "counting a fraction",
      { countedFrom: "declared-count", handles: 1.5 },
    ],
    ["door-count", "with no leaf count", { countedFrom: "door-count" }],
    [
      "door-count",
      "with tiers and no handles per leaf",
      { countedFrom: "door-count", doorTiers: 2 },
    ],
    [
      "door-count",
      "counting backwards",
      { countedFrom: "door-count", doorTiers: 1, handlesPerLeaf: -2 },
    ],
    [
      "door-count",
      "counting a fraction",
      { countedFrom: "door-count", doorTiers: 1, handlesPerLeaf: 0.5 },
    ],
    [
      "door-count",
      "stacking a fraction of a tier",
      { countedFrom: "door-count", doorTiers: 1.5, handlesPerLeaf: 1 },
    ],
  ])("refuses a %s rule %s", (_arm, _shape, rule) => {
    expect(() =>
      cabinetHandleCount({
        buildId: "some-new-body",
        rule: rule as never,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(UndeclaredCabinetHandleCountError);
  });

  it("names the field that held no count, not only the entry", () => {
    expect(() =>
      cabinetHandleCount({
        buildId: "some-new-body",
        rule: { countedFrom: "door-count", doorTiers: 1 } as never,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(/handlesPerLeaf/);
  });
});

// **What the catalogue declares, read off the catalogue.** Every test above hands
// `cabinetHandleCount` a rule written inline here and uses the `buildId` only for a refusal message,
// so none of them asks the catalogue what a row actually says. That leaves the two numbers of a
// `door-count` row unpinned: swapping `tall-pantry` to `{ doorTiers: 1, handlesPerLeaf: 2 }` leaves
// the handle count untouched — 2 x 1 is 1 x 2 — while halving `widthDerivedDoorLeafCount`, which is
// the count M6's per-door price step bills. So each row is pinned **per field**, never by the
// product, which is the whole reason ADR 0061 keeps the pair apart.
describe("the two numbers a width-derived row declares", () => {
  const DECLARED_DOOR_LEAF_ROWS: readonly (readonly [
    string,
    DoorLeafHandles,
  ])[] = [
    ["base-cabinet", { doorTiers: 1, handlesPerLeaf: 1 }],
    ["tall-pantry", { doorTiers: 2, handlesPerLeaf: 1 }],
    ["wall-cabinet", { doorTiers: 1, handlesPerLeaf: 1 }],
  ];

  it.each(DECLARED_DOOR_LEAF_ROWS)(
    "declares %s as tiers of leaves and bars per leaf, one number each",
    (buildId, leaves) => {
      expect([buildId, KITCHEN_L_BODY_CATALOG.get(buildId)?.cabinetHandles]) //
        .toEqual([buildId, handlesOnDoorLeaves(leaves)]);
    },
  );

  it("names every row whose handles follow its width, so a new one cannot arrive unpinned", () => {
    const widthDerived = [...KITCHEN_L_BODY_CATALOG]
      .filter(
        ([, definition]) =>
          definition.cabinetHandles?.countedFrom === "door-count",
      )
      .map(([buildId]) => buildId)
      .sort();

    expect(widthDerived).toEqual(
      DECLARED_DOOR_LEAF_ROWS.map(([buildId]) => buildId),
    );
  });
});

describe("the leaf count a width decides, which two readers share", () => {
  // Extracted 2026-09-03, when M6's price gained a per-door step. `deriveDoorCount` answers leaves
  // **per band**, so a second reader calling it directly would under-count every banded cabinet —
  // wave 6G's recorded open question. There is one composition and both readers use it.

  it("multiplies the bands a row stacks by the leaves its width decides", () => {
    for (const widthMm of [400, 499, TWO_DOOR_MIN_WIDTH_MM, 600, 800]) {
      expect(
        widthDerivedDoorLeafCount({
          buildId: "wall-cabinet",
          rule: handlesOnDoorLeaves({ doorTiers: 1, handlesPerLeaf: 1 }),
          widthMm,
        }),
      ).toBe(deriveDoorCount(widthMm));
      expect(
        widthDerivedDoorLeafCount({
          buildId: "tall-pantry",
          rule: handlesOnDoorLeaves({ doorTiers: 2, handlesPerLeaf: 1 }),
          widthMm,
        }),
      ).toBe(2 * deriveDoorCount(widthMm));
    }
  });

  it("answers no width-derived leaf for a row whose front population is fixed", () => {
    // Not "no doors" — `base-sink` has two — but "the width decides none of them".
    expect(
      widthDerivedDoorLeafCount({
        buildId: "base-sink",
        rule: carriesHandles(2),
        widthMm: 800,
      }),
    ).toBe(0);
    expect(
      widthDerivedDoorLeafCount({
        buildId: "open-shelf",
        rule: NO_CABINET_HANDLES,
        widthMm: 800,
      }),
    ).toBe(0);
  });

  it("stays the count the handle line is billed from, at every width", () => {
    // The invariant the extraction exists for: a leaf carrying one bar makes the two numbers the
    // same number, so a change to either derivation shows up here rather than in a price nobody
    // reads twice.
    const rule = handlesOnDoorLeaves({ doorTiers: 2, handlesPerLeaf: 1 });
    for (let widthMm = 400; widthMm <= 800; widthMm += 1) {
      const query = { buildId: "tall-pantry", rule, widthMm };
      expect(widthDerivedDoorLeafCount(query)).toBe(cabinetHandleCount(query));
    }
  });

  it("refuses an unusable declaration rather than guessing a leaf count", () => {
    expect(() =>
      widthDerivedDoorLeafCount({
        buildId: "some-new-body",
        rule: { countedFrom: "door-count" } as never,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(/doorTiers/);
    expect(() =>
      widthDerivedDoorLeafCount({
        buildId: "some-new-body",
        rule: undefined,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(UndeclaredCabinetHandleCountError);
    expect(() =>
      widthDerivedDoorLeafCount({
        buildId: "some-new-body",
        rule: { countedFrom: "mesh-count", handles: 4 } as never,
        widthMm: ANY_WIDTH_MM,
      }),
    ).toThrow(UndeclaredCabinetHandleCountError);
  });
});
