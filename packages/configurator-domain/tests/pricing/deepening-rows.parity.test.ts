// Which rows get deeper at 700 mm (ADR 0177 A-6, ruled by the owner 2026-10-26: "Surcharge every deeper cabinet").
// `measureDeepeningRows` is pure and catalogue-agnostic; the parity sweep applies it to the shipped catalogue at the two
// declared depths and asserts the measured set, wall rows and wall corners included. The expectation below names
// groups of rows; production names none, which is why this is where a list belongs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { finishesAtMm } from "../../src/occupied-depth.js";
import { measureDeepeningRows } from "../../src/pricing/deepening-rows.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { declaredCabinetDepthsMm } from "../../src/worktop-depth.js";

const SHALLOW_MM = 600;
const DEEP_MM = 700;
const shallow = buildKitchenLBodyCatalog(SHALLOW_MM);
const deep = buildKitchenLBodyCatalog(DEEP_MM);
const measured = measureDeepeningRows(shallow, deep);

/** The rows the catalogue declares as a manufactured size: an appliance whose depth is a machine's. */
const DOES_NOT_DEEPEN = ["fridge-free", "fridge-free-700"];

const BASE_ROWS = [
  "base-cabinet",
  "base-3drawer",
  "base-panbank",
  "base-hob-2drawer",
  "base-hob-oven",
  "base-bottle-cargo",
  "base-sink",
  "base-dishwasher",
  "base-corner-x-900",
  "base-corner-return-320",
];
const TALL_ROWS = ["tall-pantry", "tall-oven-tower", "tall-fridge-housing"];
const WALL_ROWS = ["wall-cabinet", "wall-lift", "open-shelf"];
const WALL_CORNER_ROWS = [
  "wall-corner-return-570",
  "wall-corner-x-900",
  "wall-corner-return-570-top",
  "wall-corner-x-900-top",
];

describe("the shipped catalogue at 600 and 700 (the A-6 parity sweep)", () => {
  it("measures the two declared depths and no others", () => {
    expect([...declaredCabinetDepthsMm()].sort()).toEqual([
      SHALLOW_MM,
      DEEP_MM,
    ]);
  });

  it.each([
    ["base, hob, sink and base corner rows", BASE_ROWS],
    ["tall rows", TALL_ROWS],
    ["wall rows", WALL_ROWS],
    ["wall corner rows, the top variants included", WALL_CORNER_ROWS],
  ])("lists the %s as deepening", (_group, rows) => {
    for (const buildId of rows) expect(measured.has(buildId)).toBe(true);
  });

  it("leaves the freestanding fridge out: a machine's depth is the same in both kitchens", () => {
    for (const buildId of DOES_NOT_DEEPEN) {
      expect(shallow.has(buildId)).toBe(true);
      expect(measured.has(buildId)).toBe(false);
    }
  });

  it("is every row of the catalogue except the appliances that do not deepen: nothing else is missed or added", () => {
    const everyRow = [...shallow.keys()];
    const expected = everyRow.filter(
      (buildId) => !DOES_NOT_DEEPEN.includes(buildId),
    );

    expect([...measured].sort()).toEqual(expected.sort());
  });

  it("is built from rows both catalogues hold, so no row is measured against nothing", () => {
    expect([...shallow.keys()].sort()).toEqual([...deep.keys()].sort());
  });

  it("covers every manufacturer-supplied row the sample book prices, so each of them takes the depth percentage", () => {
    const supplied = SAMPLE_PRICE_BOOK.cabinetRules.filter(
      (rule) => rule.suppliedBy !== "customer",
    );

    expect(supplied.length).toBeGreaterThan(10);
    for (const rule of supplied) {
      expect({
        buildId: rule.buildId,
        deepens: measured.has(rule.buildId),
      }).toEqual({
        buildId: rule.buildId,
        deepens: true,
      });
    }
  });

  it("measures per priced-as row: the lifted-column tops price as `wall-cabinet`, which deepens", () => {
    expect(measured.has("wall-cabinet")).toBe(true);
  });

  it("lists the hood as measured, although a customer supplies it, which `priceDesign` and not the measurement excludes", () => {
    expect(measured.has("hood")).toBe(true);
  });
});

describe("measureDeepeningRows is a pure function of two catalogues", () => {
  it("answers the same set twice and does not change a catalogue", () => {
    const before = JSON.stringify([...deep.keys()]);

    expect([...measureDeepeningRows(shallow, deep)].sort()).toEqual(
      [...measured].sort(),
    );
    expect(JSON.stringify([...deep.keys()])).toBe(before);
  });

  it("is empty when the two catalogues are the same", () => {
    expect(measureDeepeningRows(shallow, shallow).size).toBe(0);
    expect(measureDeepeningRows(deep, deep).size).toBe(0);
  });

  it("does not list a row that gets shallower", () => {
    expect(measureDeepeningRows(deep, shallow).size).toBe(0);
  });

  it("leaves out a row that only one catalogue holds", () => {
    const withoutBaseCabinet: BodyCatalog = new Map(
      [...deep].filter(([buildId]) => buildId !== "base-cabinet"),
    );

    const rows = measureDeepeningRows(shallow, withoutBaseCabinet);

    expect(rows.has("base-cabinet")).toBe(false);
    expect(rows.has("base-3drawer")).toBe(true);
  });

  it("measures whatever catalogue it is given, not the shipped one: a row made deeper in a supplied catalogue deepens", () => {
    const baseCabinet = shallow.get("base-cabinet");
    const fridge = shallow.get("fridge-free");
    if (!baseCabinet || !fridge) throw new Error("rows missing");
    const own: BodyCatalog = new Map([
      ["only-here", { ...baseCabinet, occupiedDepth: finishesAtMm(500) }],
      ["unchanged", { ...baseCabinet, occupiedDepth: finishesAtMm(500) }],
    ]);
    const ownDeep: BodyCatalog = new Map([
      ["only-here", { ...baseCabinet, occupiedDepth: finishesAtMm(650) }],
      ["unchanged", { ...baseCabinet, occupiedDepth: finishesAtMm(500) }],
    ]);

    expect([...measureDeepeningRows(own, ownDeep)]).toEqual(["only-here"]);
  });

  it("compares whole millimetres, so float noise in a depth in metres cannot make a row deepen", () => {
    const baseCabinet = shallow.get("base-cabinet");
    if (!baseCabinet) throw new Error("row missing");
    const at = (mm: number): BodyCatalog =>
      new Map([["row", { ...baseCabinet, occupiedDepth: finishesAtMm(mm) }]]);

    expect(measureDeepeningRows(at(561), at(561)).size).toBe(0);
    expect(measureDeepeningRows(at(561), at(562)).size).toBe(1);
  });

  it("imports no fixture and no catalogue, so pricing is bound to none", () => {
    const source = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/pricing/deepening-rows.ts",
      ),
      "utf8",
    );
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );

    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => /fixtures|catalog\.js/.test(s))).toEqual(
      [],
    );
  });
});
