import { describe, expect, it } from "vitest";

import { DesignSchema } from "../../src/design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
} from "../../src/void-engine.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";

describe("KITCHEN_L_DESIGN", () => {
  it("is a valid Design", () => {
    expect(DesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });

  it("every placement's buildId resolves in the catalog", () => {
    for (const placement of KITCHEN_L_DESIGN.placements) {
      expect(KITCHEN_L_BODY_CATALOG.has(placement.body.buildId)).toBe(true);
    }
  });

  // FINDING R2.2. `catalogEquivalentId` is the declared pointer §9's ACTUAL badge reads. A typo in
  // it is silent — the badge simply never appears — so the pointers are checked as data.
  it("points every catalogEquivalentId at a real insertable entry", () => {
    let declared = 0;
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      const equivalent = definition.catalogEquivalentId;
      if (equivalent === undefined) continue;
      declared += 1;
      const target = KITCHEN_L_BODY_CATALOG.get(equivalent);
      expect([buildId, target?.insertable]).toEqual([buildId, true]);
      // A pointer only makes sense on a seeded entry; an insertable one is already its own id.
      expect([buildId, definition.insertable === true]).toEqual([
        buildId,
        false,
      ]);
    }
    expect(declared).toBeGreaterThan(0);
  });

  // Absent means "no catalogue equivalent", and exactly five seeded entries are in that position:
  // nothing in §7 builds the hob or any of the four corner bodies. Named, so adding a pointer to
  // one of them — or losing one from another entry — is a test failure rather than a quietly
  // missing badge. The two `base-corner-*` entries joined the list with ADR 0025: §13.1 says a
  // corner is not a body a customer chooses, so having no equivalent is their correct answer.
  it("leaves only the hob and the four corner bodies without an equivalent", () => {
    const unpointed = [...KITCHEN_L_BODY_CATALOG]
      .filter(
        ([, definition]) =>
          definition.insertable !== true &&
          definition.catalogEquivalentId === undefined,
      )
      .map(([buildId]) => buildId);
    expect(unpointed.sort()).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "cooktop-600",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
  });

  // A seeded entry that points at a §7 twin is the *same body*, built by the same call — so the two
  // capability flags §9 reads before it renders a section have to agree across the pointer. They
  // did not: `open-shelf-600`, `hood-600` and `fridge-free-700` inherited their carcass shape's
  // `canFinish: true` (the fridge, `canHandle: true` too) over twins that declare `false`, which is
  // how the shipped kitchen offered a *Finisaj* section with no front to recolour and — on the
  // fridge — a *Mâner* section whose `push` chip hid the appliance's own two bars. The geometry side
  // of the same rule is `catalog-capability-parity.test.ts` in `@lemnaria/three-adapter`; this is
  // the cheap data-side half, and it is the one that runs without a renderer.
  it("declares the same finish and handle capabilities as the twin it points at", () => {
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      const equivalent = definition.catalogEquivalentId;
      if (equivalent === undefined) continue;
      const twin = KITCHEN_L_BODY_CATALOG.get(equivalent);
      expect([buildId, definition.canFinish, definition.canHandle]).toEqual([
        buildId,
        twin?.canFinish,
        twin?.canHandle,
      ]);
    }
  });

  // The three bodies above, named at the placement the customer actually taps, through the query
  // every reader goes via — so the fix is pinned to the shipped design and not only to the table.
  it("offers neither finish nor handle on the shelf, the hood or the fridge", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const capabilitiesOf = (placementId: string) => {
      const record = records.find((one) => one.id === placementId);
      return [
        placementId,
        record?.buildId,
        record?.canFinish,
        record?.canHandle,
      ];
    };

    expect(capabilitiesOf("p12")).toEqual([
      "p12",
      "open-shelf-600",
      false,
      false,
    ]);
    expect(capabilitiesOf("p13")).toEqual(["p13", "hood-600", false, false]);
    expect(capabilitiesOf("p7")).toEqual([
      "p7",
      "fridge-free-700",
      false,
      false,
    ]);
  });

  it("derives placement records and columns without throwing", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    expect(records).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    const columns = deriveColumns(records);
    expect(columns.size).toBeGreaterThan(0);
    expect(() => recomputeVoids(records, columns)).not.toThrow();
  });
});
