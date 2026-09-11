import { describe, expect, it } from "vitest";

import { resolveBuildableSizes } from "../../src/catalog.js";
import { DesignSchema } from "../../src/design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
} from "../../src/void-engine.js";
import {
  catalogEquivalentNamer,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  UnknownCatalogEquivalentError,
} from "../../src/fixtures/kitchen-l-design.js";
import { WORKTOP_DEPTH_MM } from "../../src/worktop-depth.js";

describe("KITCHEN_L_DESIGN", () => {
  it("is a valid Design", () => {
    expect(DesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });

  it("every placement's buildId resolves in the catalog", () => {
    for (const placement of KITCHEN_L_DESIGN.placements) {
      expect(KITCHEN_L_BODY_CATALOG.has(placement.body.buildId)).toBe(true);
    }
  });

  // **The runtime half of the same guard, and since 6B-f it is load-bearing.** The check above reads
  // the pointers as data; this one exercises the throw that fires when one of them names nothing.
  // It mattered less when the seeded row carried a copy of its equivalent's name: a withdrawn entry
  // cost a width set. It now costs the *name* too — `describeBodyName` resolves the pointer live —
  // so what this refusal prevents is a body renamed silently at load. Reached through the namer
  // because every seeded pointer in the fixture is a literal.
  it("refuses at load when a pointer names no insertable entry", () => {
    const nameFor = catalogEquivalentNamer(WORKTOP_DEPTH_MM);

    expect(() => nameFor("no-such-entry")).toThrow(
      UnknownCatalogEquivalentError,
    );
    // Non-vacuity: the same namer answers for a pointer the catalogue does hold, so the throw above
    // is about the missing entry and not about the namer refusing everything.
    expect(nameFor("wall-cabinet")).toMatchObject({
      catalogEquivalentId: "wall-cabinet",
      doorCountFollowsWidth: true,
    });
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

  // Absent means "no catalogue equivalent", and exactly four seeded entries are in that position:
  // nothing in §7 builds any of the corner bodies. Named, so adding a pointer to one of them — or
  // losing one from another entry — is a test failure rather than a quietly missing badge. The two
  // `base-corner-*` entries joined the list with ADR 0025: §13.1 says a corner is not a body a
  // customer chooses, so having no equivalent is their correct answer.
  it("leaves only the four corner bodies without an equivalent", () => {
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

  // FINDING R1.4. A seeded row's own `minWidthMm` is read by nothing: the width set and the floor
  // under it are one catalogue fact and both come off the entry the pointer names, because that is
  // the entry a §5.4 resize rebuilds through and whose floor `insertBody` actually applies. No
  // seeded row declares one today, so the rule is invisible in the data — which is exactly why it
  // is asserted. A row that acquires one would otherwise look like it narrowed its own chips and
  // would not.
  it("declares no width floor on any non-insertable row", () => {
    let checked = 0;
    const declaring: string[] = [];
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      if (definition.insertable === true) continue;
      checked += 1;
      if (definition.minWidthMm !== undefined) declaring.push(buildId);
    }
    expect(checked).toBeGreaterThan(0);
    expect(declaring).toEqual([]);
  });

  // FINDING R1.7. "A body that can only be built at one width must never be a §5.4 donor" is
  // written in three fixture comments — `base-hob-2drawer-600`, `tall-oven-tower-600`,
  // `tall-pantry-600` — and was enforced nowhere across the pointer. A single-member set on a
  // `fixedWidth: false` body renders a width section holding exactly one chip, `active` and
  // unclickable: a section that offers nothing, which `describeWidthSection` cannot decline because
  // it declines at *zero* chips and §9's emptiness rule stays literal.
  //
  // Latent today — every single-member row is `fixedWidth` on both sides of its pointer — and the
  // guard is what keeps it that way. Both populations are swept, because either side acquiring the
  // shape is the same defect.
  it("marks every row with one buildable width as fixed-width", () => {
    let checked = 0;
    const movable: string[] = [];
    for (const [buildId, definition] of KITCHEN_L_BODY_CATALOG) {
      if (resolveBuildableSizes(KITCHEN_L_BODY_CATALOG, buildId).length !== 1) {
        continue;
      }
      checked += 1;
      if (!definition.fixedWidth) movable.push(buildId);
    }
    expect(checked).toBeGreaterThan(0);
    expect(movable).toEqual([]);
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
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    expect(columns.size).toBeGreaterThan(0);
    expect(() => recomputeVoids(records, columns)).not.toThrow();
  });
});
