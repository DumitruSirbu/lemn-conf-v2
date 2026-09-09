// **Wave 6Z's rule, at the level where its exclusions and its refusal live** — ADR 0103 decisions 3,
// 4 and 7. The store side (`apps/web/tests/store/replan-dependent-members.test.ts`) drives the four
// states the owner reported through real taps; this file asks the three questions the shipped
// kitchen cannot answer.
//
//   1. **The overlap case.** `isFullHeightUnder` asks about overlap along the wall, not column
//      membership, so a full-height body wider than its own column lifts its neighbours too. The
//      shipped kitchen cannot exercise it — `B|1.20`, `B|1.80` and `B|2.45` are each lifted by a
//      member of their own column, and no seeded full-height body overlaps a neighbouring key — so
//      this file declares its own design (ADR 0093 decision 2).
//   2. **The four exclusions**, each read off a declaration the entry already carries and never off
//      a list of build ids (ADR 0058 decision 2).
//   3. **The refusal**, on the declared witness `dependent-replan-witness.ts` owns.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normaliseBand } from "../../src/bands.js";
import {
  columnDecidesADifferentDepth,
  openingFromPlacement,
} from "../../src/commands/insert-fit.js";
import { depthFollowsSetting } from "../../src/cabinet-depth-rule.js";
import type { DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { resolveRebuildBody } from "../../src/commands/resolve-column-members.js";
import { clearBodies, insertInto } from "../support/commands.js";
import {
  witnessWorld,
  WITNESS_COLUMN_KEY,
} from "../support/dependent-replan-witness.js";
import {
  advance,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

/** The column the lifting body is inserted into, and the column it lifts by **overhanging** it. The
 *  two extents share 200 mm of wall and no member, which is the whole point: `A|0.90` has nothing
 *  full-height of its own. */
const LIFTING_COLUMN = "A|0.50";
const OVERHUNG_COLUMN_ALONG_MM = 900;
const OVERHUNG_COLUMN = "A|0.90";

/** One design with two overlapping columns: an empty full-height slot, and beside it a stack whose
 *  top row is whatever the caller names.
 *
 *  The full-height member of the left column is placed and then **cleared**, because ADR 0011 Gap D
 *  freezes a column's extent at load — without it the column would start and end at whatever is left
 *  standing and publish no opening a full-height body could go into. */
function overlappingColumns(
  topBuildId: string,
  topWidthMm: number,
): KitchenWorld {
  return clearBodies(
    syntheticWorld([
      {
        id: "lift",
        wall: "A",
        alongMm: 500,
        y0Mm: 0,
        body: { buildId: "tall-oven-tower-600", widthMm: 600, heightMm: 2200 },
      },
      {
        id: "base",
        wall: "A",
        alongMm: OVERHUNG_COLUMN_ALONG_MM,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 820 },
      },
      {
        id: "hood",
        wall: "A",
        alongMm: OVERHUNG_COLUMN_ALONG_MM,
        y0Mm: 1500,
        body: { buildId: "hood-600", widthMm: 600, heightMm: 700 },
      },
      {
        id: "top",
        wall: "A",
        alongMm: OVERHUNG_COLUMN_ALONG_MM,
        y0Mm: 2200,
        body: { buildId: topBuildId, widthMm: topWidthMm, heightMm: 400 },
      },
    ]),
    ["lift"],
  );
}

/** The full-height insert into the left column, and the world it leaves. */
function withFullHeightBodyBeside(world: KitchenWorld): KitchenWorld {
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, LIFTING_COLUMN, 0).id },
    "tall-pantry",
  );
  if (!result.ok) {
    throw new Error(`the witness could not insert: ${result.reason.code}`);
  }
  return advance(world, result.design);
}

function placementOf(world: KitchenWorld, id: string): DesignPlacement {
  const found = world.design.placements.find(
    (placement) => placement.id === id,
  );
  if (!found) throw new Error(`no placement ${id}`);
  return found;
}

describe("a full-height body lifts the neighbour it overhangs, and the body standing there follows", () => {
  const before = overlappingColumns("wall-2door-600-top", 600);
  const after = withFullHeightBodyBeside(before);

  // The premise, asserted rather than assumed: without it the test below would be measuring a
  // column that was already lifted, and would pass under an implementation that did nothing.
  it("lifts a column with no full-height member of its own", () => {
    expect(before.columns.get(OVERHUNG_COLUMN)?.hasFullHeightUnder).toBe(false);
    expect(after.columns.get(OVERHUNG_COLUMN)?.hasFullHeightUnder).toBe(true);
  });

  it("re-plans the top standing over the overhung column", () => {
    expect(placementOf(before, "top").body.seatDepthMm).toBeUndefined();
    expect(placementOf(after, "top").body).toMatchObject({
      buildId: "wall-cabinet",
      seatDepthMm: 561,
    });
  });

  // ADR 0103 decision 4's first exclusion: `resolveDepthM` never consults `hasFullHeightUnder` for a
  // base body — it returns the opening's own clearance, and on a swap opening that clearance **is**
  // the standing body's occupied depth. So the outcome test answers "no" for a base body whatever
  // the column beneath it does.
  //
  // **Which means the band clause is, today, indistinguishable from its own absence** (ADR 0093
  // decision 1): removing it from `columnDecidesItsDepth` leaves every assertion in this file green
  // — measured, not assumed. It stays in production because decision 4 requires the exclusion to be
  // a *declaration* rather than an emergent property of another function, and the second assertion
  // below states the emergent property out loud, so the day `resolveDepthM`'s non-wall arm stops
  // returning the opening's own clearance this goes red and the clause starts earning its place.
  it("writes a standing base body through by identity", () => {
    expect(placementOf(after, "base")).toBe(placementOf(before, "base"));
  });

  it("decides no different depth for a base body, whatever stands beneath it", () => {
    const record = after.records.find((candidate) => candidate.id === "base");
    const column = after.columns.get(OVERHUNG_COLUMN);
    // Through the same resolver production uses, so the entry this question is asked of is the one
    // the re-plan would have rebuilt through (ADR 0022).
    const body = record && resolveRebuildBody(after.catalog, record);
    if (!record || !column || !body) {
      throw new Error("the witness lost its base body");
    }

    expect(column.hasFullHeightUnder).toBe(true);
    expect(
      columnDecidesADifferentDepth({
        body,
        opening: openingFromPlacement(record, after.records, after.columns),
        column,
        cabinetDepthMm: after.cabinetDepthMm,
      }),
    ).toBe(false);
  });
});

describe("a standing hood is never re-planned", () => {
  // Decision 4's third exclusion, and the one with teeth. A `wall-plane` entry states where it
  // finishes, so the column does not decide it — and re-planning it would resolve `hood-600` to
  // `hood` and flip `fixedWidth` true → false, which is product-logic review R3.2's defect.
  // `docs/BACKLOG.md` entry 57 records that a depth change already delivers it; this wave does not.
  //
  // **The insert is into the hood's own column and the column does not lift**, deliberately: a hood
  // finishes on the cabinet-depth line, so over a *lifted* column the depth it already stands at and
  // the depth the column would decide are the same number and the exclusion would be unobservable.
  // Over an unlifted one they are 600 and 330, and the exclusion is the only thing standing between
  // this hood and a new width control.
  const standing = overlappingColumns("wall-2door-600-top", 600);
  const before = clearBodies(standing, ["base"]);
  const after = withOrdinaryBodyUnderTheHood(before);

  it("stands over a column the insert leaves unlifted", () => {
    expect(after.columns.get(OVERHUNG_COLUMN)?.hasFullHeightUnder).toBe(false);
  });

  it("writes the hood through by identity, keeping its fixed width", () => {
    expect(placementOf(after, "hood")).toBe(placementOf(before, "hood"));
    expect(placementOf(after, "hood").body.buildId).toBe("hood-600");
    expect(
      after.records.find((record) => record.id === "hood")?.fixedWidth,
    ).toBe(true);
  });
});

/** An ordinary base cabinet into the slot the hood's own column just freed — an insert that touches
 *  that column and lifts nothing. */
function withOrdinaryBodyUnderTheHood(world: KitchenWorld): KitchenWorld {
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, OVERHUNG_COLUMN, 0).id },
    "base-cabinet",
  );
  if (!result.ok) {
    throw new Error(`the witness could not insert: ${result.reason.code}`);
  }
  return advance(world, result.design);
}

describe("a body with no catalogue equivalent is written through untouched", () => {
  // Decision 4's fourth exclusion. The wall corner returns are `recorded-shell`, they follow the
  // setting, and they declare no `catalogEquivalentId`, so `resolveRebuildBody` answers nothing for
  // them. `setCabinetDepth` *reseats* such a body because the setting it was measured against has
  // moved; an insert does not move the setting, so this wave neither rebuilds nor reseats it.
  it("neither rebuilds nor reseats a wall corner return top", () => {
    const before = overlappingColumns("wall-corner-return-570-top", 570);
    const after = withFullHeightBodyBeside(before);

    expect(placementOf(after, "top")).toBe(placementOf(before, "top"));
  });
});

describe("who is re-planned is read off declarations, never off a list of ids", () => {
  /** ADR 0103 decision 4's three clauses, restated here from the same declarations production reads
   *  — the entry's band, its depth rule and where its occupied depth is measured from — so this
   *  sweep asserts the *rule* rather than agreeing with whatever the implementation did. A list of
   *  build ids on either side would fail ADR 0058 decision 2. */
  const columnDecidesItsDepth = (definition: BodyDefinition): boolean =>
    normaliseBand(definition.band) === "wall" &&
    definition.depthRule !== undefined &&
    depthFollowsSetting(definition.depthRule) &&
    definition.occupiedDepth.measuredFrom === "recorded-shell";

  const admitted = [...KITCHEN_L_BODY_CATALOG.entries()]
    .filter(([, definition]) => columnDecidesItsDepth(definition))
    .map(([buildId]) => buildId);

  it("admits a population the shipped catalogue actually has", () => {
    // Measured on 2026-09-08 and asserted exactly, not as a floor: a rule that stopped tracking
    // half the catalogue would still clear a floor, and this number moving is a reader's business.
    expect(admitted.length).toBe(14);
  });

  it("admits the wall and top carcasses and excludes everything the decision names", () => {
    expect(admitted).toContain("wall-cabinet");
    expect(admitted).toContain("wall-2door-600-deep-top");
    expect(admitted).toContain("open-shelf");

    // Base band, full-height band, a `wall-plane` hood, and an appliance whose depth is a real
    // machine's — one per exclusion clause.
    expect(admitted).not.toContain("base-cabinet");
    expect(admitted).not.toContain("tall-pantry");
    expect(admitted).not.toContain("hood-600");
    expect(admitted).not.toContain("fridge-free-700");
  });
});

describe("the insert refuses whole when a dependent body cannot be rebuilt", () => {
  const world = witnessWorld();
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, WITNESS_COLUMN_KEY, 0).id },
    "tall-pantry",
  );

  // Atomicity. A partial write — the placed body in, the standing one left at the old depth — is
  // the "silent mixture" `rebuildEveryBodyAt` refuses by name and the state this wave exists to
  // remove, so the identity comparison is the assertion and not a nicety.
  it("returns the design it was handed, by identity", () => {
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.design).toBe(world.design);
  });

  it("names both the body the customer asked for and the one above it", () => {
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // **6B-e**: the domain publishes a code and its typed params, never a sentence. The two bodies
    // are still what this case is about, so the assertion moves to the params the catalogue
    // interpolates rather than weakening to the code alone.
    expect(result.reason.code).toBe("DEPENDENT_MEMBER_NOT_REBUILDABLE");
    if (result.reason.code !== "DEPENDENT_MEMBER_NOT_REBUILDABLE") return;
    expect(result.reason.params.label).toContain("Coloană");
    expect(result.reason.params.memberLabel).toContain("Corp suspendat");
  });
});

describe("the wave writes no colour and takes no probe lease", () => {
  // ADR 0103 decisions 6 and 8, asserted on the source because both are claims about what the code
  // does *not* contain, and a behavioural test cannot show the absence of a future caller. The store
  // suite asserts the behaviour; this asserts the shape ADR 0099's landmine is disarmed by.
  const commandsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/commands",
  );
  const read = (file: string): string =>
    readFileSync(path.join(commandsDir, file), "utf8");

  it("adds no caller of resolvedFinishOf and no second writer of body.finish", () => {
    const replan = read("replan-dependent-members.ts");
    expect(replan).not.toContain("resolvedFinishOf");
    expect(replan).not.toContain("finish:");
  });

  it("takes no probe lease in the insert path", () => {
    // `.use(` is how a lease is taken (ADR 0076). The re-plan runs inside the bracket its caller
    // already opened, so neither file may open one of its own.
    expect(read("replan-dependent-members.ts")).not.toContain(".use(");
    expect(read("insert-body.ts")).not.toContain(".use(");
  });
});
