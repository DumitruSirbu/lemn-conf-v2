// `docs/BACKLOG.md` entry 13, closed twice — and the second time is the one that lasts.
//
// The defect: `resolveWidth` returned the opening's own width for every `widthFlex: 'fit'` body and
// never consulted `sizesMm`, so a 300 mm wall opening offered *Corp suspendat 2 uși* and built
// **one** door under a two-door label — ADR 0029 verbatim, through the path that ADR could not
// reach.
//
// **ADR 0032 closed it by refusing** the insert, because 300 was not a width a two-door had.
// **ADR 0033 closes it by naming**: there is no two-door entry any more, the door count is derived
// from the width at the threshold the builder branches on, and a 300 mm wall cabinet is offered,
// built, and *called* a one-door. The refusal this file used to assert has become an acceptance, and
// that reversal is the decision — nothing was relaxed, because the label no longer lies at any width
// the entry declares. What survives unchanged is the band the merged set still skips, below.
//
// It is asserted here rather than in the domain for `swap-depth.test.ts`'s reason: only the real
// builders can say how many doors a 300 mm carcass actually has. A fake probe reports back the size
// it was handed and would agree with anything, which is precisely what let the original ship.
import {
  INSERTABLE_BODY_DEFINITIONS,
  derivePlacementRecords,
  deriveColumns,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
  toMetres,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { meshNames } from "./support/structure.js";

/** The seeded 300 mm wall cabinet, and the column it stands in — the narrowest wall opening the
 *  shipped kitchen has, reachable in one delete. */
const NARROW_WALL_PLACEMENT_ID = "p10";
const NARROW_WALL_COLUMN = "A|0.75";
const NARROW_WIDTH_MM = 300;

/** ADR 0033's merged wall entry — `wall-2door` and `wall-1door`, as one row. */
const WALL_CABINET_BUILD_ID = "wall-cabinet";
/** The narrowest width the merged set declares on the two-door side of the threshold. */
const TWO_DOOR_WIDTH_MM = 600;
/** The shipped opening under the freestanding fridge, and the width ADR 0033's amendment restores:
 *  §7's builder makes an honest two-door of two 350 mm leaves here, and a discrete five-value set was
 *  refusing it for a rule that only ever covered 450 and 500. */
const OVER_FRIDGE_WIDTH_MM = 700;

/** Inside the band the merged set skips: §7's builder makes one door here, and ADR 0030 caps a
 *  single hinged door at 400. Written out rather than derived from the threshold, so this fails if
 *  the threshold moves in either package. */
const IN_THE_SKIPPED_BAND_MM = 430;
/** ADR 0033's set, written out rather than imported from the entry under test. */
const HINGED_CABINET_WIDTHS_MM = [200, 300, 400, 600, 800];

const WALL_CABINET_HEIGHT_MM = 700;
const WALL_DEPTH_MM = 330;
const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function clearedNarrowWall(): Design {
  const result = removePlacement({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: NARROW_WALL_PLACEMENT_ID },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
  return result.design;
}

function narrowOpening(design: Design) {
  const columns = deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  );
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const voids = recomputeVoids(records, columns);
  const opening = voids.find(
    (record) =>
      record.col === NARROW_WALL_COLUMN && Math.abs(record.y0 - 1.5) < 0.01,
  );
  if (!opening) throw new Error("the deleted wall cabinet left no opening");
  return { columns, records, voids, opening };
}

/** The `door_front` meshes a real `wall-cabinet` carcass of this width actually has. */
function doorFrontsAt(widthMm: number): number {
  const built = buildCatalogBody(kit, WALL_CABINET_BUILD_ID, {
    widthM: toMetres(widthMm),
    heightM: toMetres(WALL_CABINET_HEIGHT_MM),
    depthM: toMetres(WALL_DEPTH_MM),
  });
  return meshNames(built).filter((name) => name === "door_front").length;
}

function wallCabinetSizesMm(): readonly number[] {
  const entry = INSERTABLE_BODY_DEFINITIONS.find(
    ([buildId]) => buildId === WALL_CABINET_BUILD_ID,
  );
  if (!entry) throw new Error("no wall-cabinet entry");
  return entry[1].sizesMm ?? [];
}

describe("what a wall carcass is actually built as, either side of the threshold", () => {
  // The premise, and the only fact in this file that is not a consequence of a decision: the builder
  // has always derived the door count from the width and has always been right. ADR 0033's whole
  // observation is that the geometry was never the problem — the name on it was.
  it("has one door front at 300 mm and two at 600", () => {
    expect(doorFrontsAt(NARROW_WIDTH_MM)).toBe(1);
    expect(doorFrontsAt(TWO_DOOR_WIDTH_MM)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// ADR 0033's amendment, on the shipped 700 mm opening — the only width the merge genuinely lost.
// ---------------------------------------------------------------------------------------------
describe("the 700 mm fridge opening takes a two-door again", () => {
  /** The design with the freestanding fridge deleted, which is the 700 mm base opening in one click. */
  function clearedFridge(): Design {
    const result = removePlacement({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p7" },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
    return result.design;
  }

  it("inserts a hinged base cabinet there, built to the opening's own 700 mm", () => {
    const design = clearedFridge();
    const columns = deriveColumns(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    );
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    const opening = recomputeVoids(records, columns).find(
      (record) => record.col === "B|2.45" && Math.abs(record.y0) < 0.01,
    );
    if (!opening) throw new Error("the deleted fridge left no base opening");
    expect(Math.round(opening.w * 1000)).toBe(OVER_FRIDGE_WIDTH_MM);

    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns,
      target: { kind: "void", id: opening.id },
      buildId: "base-cabinet",
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(
      OVER_FRIDGE_WIDTH_MM,
    );
  });

  // And it is an honest two-door there — the claim the amendment rests on, counted off a body the
  // real builders made rather than argued from the threshold.
  it("makes two doors at 700, and none of the widths either rule forbids", () => {
    expect(doorFrontsAt(OVER_FRIDGE_WIDTH_MM)).toBe(2);
    expect(doorFrontsAt(350)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// ADR 0033's amendment, second half: the hood narrows into a wider opening instead of refusing it.
// ---------------------------------------------------------------------------------------------
describe("a hood in an opening wider than any hood", () => {
  /** The 800 mm wall opening left by deleting the seeded `wall-2door-800` at A|1.30. */
  function clearedWideWall() {
    const result = removePlacement({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p11" },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
    const columns = deriveColumns(
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    );
    const records = derivePlacementRecords(
      result.design,
      KITCHEN_L_BODY_CATALOG,
    );
    const opening = recomputeVoids(records, columns).find(
      (record) => record.col === "A|1.30" && Math.abs(record.y0 - 1.5) < 0.01,
    );
    if (!opening) throw new Error("the deleted wall cabinet left no opening");
    return { design: result.design, columns, opening };
  }

  // **The centring is the load-bearing half, and nothing asserted it until now.** §5.2 seats every
  // body on the opening's own centre (`resolvePlacementMillimetres` reads `target.opening.alongM`),
  // so a 600 mm hood in an 800 mm opening lands with 100 mm either side rather than flush to one
  // edge. That was already true; making the hood narrow is what turned it into a property a customer
  // can see, so it is measured here against the real builders and the real probe.
  it("installs a 600 at the opening's own centre, not at its edge", () => {
    const { design, columns, opening } = clearedWideWall();
    expect(Math.round(opening.w * 1000)).toBe(800);
    const openingCentreMm = Math.round(opening.x * 1000);

    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns,
      target: { kind: "void", id: opening.id },
      buildId: "hood",
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.at(-1);
    // Built at 600 — the hood is never *made* at 800, which is the rule that did not change.
    expect(placed?.body.widthMm).toBe(600);
    // And centred: the same along-coordinate the opening has, so 100 mm of gap either side.
    expect(placed?.alongMm).toBe(openingCentreMm);
  });

  // A 300 mm opening still refuses, and that is not a casualty of the amendment: no hood is made
  // that narrow, so there is no size to narrow *to*. The hood's set is what says so.
  it("still refuses an opening narrower than the narrowest hood", () => {
    const design = clearedNarrowWall();
    const { columns, opening } = narrowOpening(design);

    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns,
      target: { kind: "void", id: opening.id },
      buildId: "hood",
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
  });
});

describe("so the 300 mm opening gets a one-door, correctly named — backlog 13", () => {
  it("accepts the insert and builds at the opening's own width", () => {
    const design = clearedNarrowWall();
    const { columns, opening } = narrowOpening(design);
    expect(Math.round(opening.w * 1000)).toBe(NARROW_WIDTH_MM);

    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns,
      target: { kind: "void", id: opening.id },
      buildId: WALL_CABINET_BUILD_ID,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.at(-1)?.body.widthMm).toBe(NARROW_WIDTH_MM);
  });

  // The half that closes the defect. The cabinet the customer gets is a one-door, and the row they
  // chose it from said so — which is the thing that was false for as long as two entries existed.
  it("offers it under the one-door name, and the same entry under the two-door name at 600", () => {
    const design = clearedNarrowWall();
    const { columns, records, voids, opening } = narrowOpening(design);

    const row = offersFor({
      records,
      voids,
      columns,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "void", id: opening.id },
    }).find((offer) => offer.buildId === WALL_CABINET_BUILD_ID);

    expect(row?.verdict).toMatchObject({
      status: "offered",
      widthMm: NARROW_WIDTH_MM,
    });
    expect(row?.label).toBe("Corp suspendat 1 ușă");
    expect(doorFrontsAt(NARROW_WIDTH_MM)).toBe(1);

    // One entry, one id, two names — and the name that reaches the customer is the one the builder
    // will honour. There is nothing left for a resize to migrate between.
    const seededWide = offersFor({
      records,
      voids,
      columns,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p8" },
    }).find((offer) => offer.buildId === WALL_CABINET_BUILD_ID);
    expect(seededWide?.label).toBe("Corp suspendat 2 uși");
    expect(doorFrontsAt(TWO_DOOR_WIDTH_MM)).toBe(2);
  });

  // ADR 0030's half of the old bound, which the merge kept — and which is the reason the merged set
  // is still a bound rather than a ladder. §7's builder makes a **single** door anywhere in
  // (400, 450], and a single hinged door tops out at 400 for the swing arc, so that band is a width
  // this cabinet cannot honestly be made at and no floor can express a hole in the middle of a
  // range. The refusal itself is asserted in the domain (`set-width.test.ts`); what is asserted here
  // is the geometry that makes the refusal necessary.
  it("still skips the band where the builder makes a one-door too wide to use", () => {
    expect(doorFrontsAt(IN_THE_SKIPPED_BAND_MM)).toBe(1);
    expect(wallCabinetSizesMm()).not.toContain(IN_THE_SKIPPED_BAND_MM);
    expect(wallCabinetSizesMm()).toEqual(HINGED_CABINET_WIDTHS_MM);
  });
});
