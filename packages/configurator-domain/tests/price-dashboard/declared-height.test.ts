// The height a cabinet's page states for a row (`declaredHeightMmOf`) and the height the preview reads a cabinet at when
// none is asked for (`defaultReadHeightMmOf`), each from one place.
import { describe, expect, it } from "vitest";

import { defaultReadHeightMmOf } from "../../src/price-dashboard/cabinet-preview.js";
import {
  buildableHeightsMm,
  declaredHeightMmOf,
  listPricedRows,
  pricedRowOf,
} from "../../src/price-dashboard/priced-row.js";
import { isAnchoredFormula } from "../../src/pricing/anchored-price-formula.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

import { CATALOG, ruleOf } from "./m2-support.js";

function rowOf(buildId: string) {
  const row = pricedRowOf(CATALOG, buildId);
  if (row === undefined) throw new Error(`No catalogue row ${buildId}`);
  return row;
}

describe("the height a row stands at", () => {
  it.each([
    ["base-corner-x-900", 860],
    ["base-corner-return-320", 860],
    ["wall-corner-return-570", 700],
    ["wall-corner-x-900", 700],
    ["wall-corner-x-900-top", 400],
    ["wall-corner-return-570-top", 400],
  ])(
    "gives the structural corner %s the height the rows of its band stand at",
    (buildId, heightMm) => {
      expect(declaredHeightMmOf(CATALOG, rowOf(buildId))).toBe(heightMm);
    },
  );

  it("gives every row a height the catalogue prices", () => {
    const rows = listPricedRows(CATALOG);

    const unheld = rows.filter(
      (row) => declaredHeightMmOf(CATALOG, row) === undefined,
    );

    expect(rows.length).toBeGreaterThan(20);
    expect(unheld.map(({ buildId }) => buildId)).toEqual([]);
  });

  it("answers a row's own declared height before its band's", () => {
    expect(declaredHeightMmOf(CATALOG, rowOf("tall-pantry"))).toBe(2200);
    expect(declaredHeightMmOf(CATALOG, rowOf("fridge-free"))).toBe(1850);
  });

  it("states no height for a corner whose band's rows do not share one (a control: the band's height is read, not named)", () => {
    const corner = rowOf("base-corner-x-900");
    const base = rowOf("base-cabinet");
    const disagreeing: BodyCatalog = new Map([
      ...CATALOG,
      [
        "base-tall-base",
        { ...base.definition, nominalHeightMm: 900 } satisfies BodyDefinition,
      ],
    ]);

    expect(declaredHeightMmOf(CATALOG, corner)).toBe(860);
    expect(declaredHeightMmOf(disagreeing, corner)).toBeUndefined();
  });
});

describe("the height a cabinet is read at when none is asked for", () => {
  it("reads a cabinet built to its opening at its formula's anchor height and not the lowest opening", () => {
    const row = rowOf("wall-cabinet");

    expect(buildableHeightsMm(row)[0]).toBe(400);
    expect(defaultReadHeightMmOf(ruleOf("wall-cabinet"), row)).toBe(700);
  });

  it("reads a row whose formula has no anchor height at the first height it is built at", () => {
    const row = rowOf("base-cabinet");

    expect(defaultReadHeightMmOf(ruleOf("base-cabinet"), row)).toBe(860);
  });
});

describe("a formula is anchored", () => {
  it("for a rule priced by an anchor and not for one priced by sizes", () => {
    expect(isAnchoredFormula(ruleOf("base-cabinet").formula)).toBe(true);
    expect(isAnchoredFormula(ruleOf("base-corner-return-320").formula)).toBe(
      false,
    );
  });
});
