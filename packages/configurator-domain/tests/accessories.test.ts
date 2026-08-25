import { describe, expect, it } from "vitest";

import {
  findHostedAccessories,
  resolveHostPlacement,
} from "../src/accessories.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../src/void-engine.js";

const records = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

function record(id: string): PlacementRecord {
  const found = records.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No record ${id}`);
  return found;
}

describe("resolveHostPlacement", () => {
  it("resolves the hob to the cabinet it stands on", () => {
    expect(resolveHostPlacement(record("p3"), records)?.id).toBe("p2");
  });

  // ADR 0011 Gap E: this used to throw, out of a pointer handler, for a state `remove` can reach.
  it("returns no host for an orphaned accessory instead of throwing", () => {
    const hob = record("p3");
    expect(resolveHostPlacement(hob, [hob])).toBeUndefined();
  });

  it("ignores a body in another column", () => {
    const hob = record("p3");
    const elsewhere = record("p0");
    expect(elsewhere.col).not.toBe(hob.col);
    expect(resolveHostPlacement(hob, [hob, elsewhere])).toBeUndefined();
  });
});

describe("findHostedAccessories", () => {
  it("finds the hob under its own host and nothing under another cabinet", () => {
    expect(
      findHostedAccessories(record("p2"), records).map((r) => r.id),
    ).toEqual(["p3"]);
    expect(findHostedAccessories(record("p0"), records)).toEqual([]);
  });
});
