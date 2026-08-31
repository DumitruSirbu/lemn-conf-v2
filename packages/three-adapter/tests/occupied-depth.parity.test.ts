// **The gate that makes DOM-002's fix a fact rather than a claim.**
//
// The domain declares how deep the space each body fills (`BodyDefinition.occupiedDepth`), and it
// has to: it is I/O-free, so it cannot measure a mesh. A declaration nothing checks is exactly the
// defect the finding is about — the old catch-all `return record.frame.d` was also a declaration,
// it was just wrong for four body families and nothing looked. This file looks, for every seeded and
// every insertable body, against the real builders and the real `BodyProbe`.
//
// ADR 0028's own remedy, applied to the pair wave S9 creates, the way `cabinet-depth-source.test.ts`
// applies it to ADR 0036's 39 mm.
//
// **What "occupied" means here, measured the way the scene places a body.** §11 row 19 seats a
// placement by its recorded seat: `deriveCabinetWorldTransform` puts the group origin `frame.d / 2`
// off the wall plane. So the space the body fills runs from the wall plane to the front of its
// bounding box — `seat + box.max.z` — and §3.1 says that is what a depth is: *"`h`, `d` from the
// **full extent** — a body must clear the ceiling with everything it carries."* Handles and proud
// fronts are in it, which is the same reading ADR 0036 decision 1 already takes for the 39 mm: a
// declared dimension is the **finished** cabinet, doors included.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  occupiedDepthM,
  toMillimetres,
  type BodyDefinition,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  rebuildDepthM,
  type CatalogBodySize,
} from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-08-31T12:00:00.000Z";

/** The two depths a wall carcass is ever built to in the shipped product: §7's head-clearance cap,
 *  and the lifted depth over a full-height column (backlog entry 5). Both go through the sweep,
 *  because the parameterised rule is a formula and a formula checked at one point is a constant. */
const WALL_BUILD_DEPTHS_MM = [330, 600];

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function frontOfGroupM(group: THREE.Group): number {
  group.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(group).max.z;
}

/** The distance from the wall plane to the front of a body seated at `seatDepthM`, in millimetres —
 *  measured off the meshes, with nothing the domain recorded in it. */
function measuredOccupiedMm(group: THREE.Group, seatDepthM: number): number {
  return Math.round((seatDepthM / 2 + frontOfGroupM(group)) * 1000);
}

/** What the domain answers for a body with this entry and this seat. Built as a record rather than
 *  read off the rule directly, so the production function is what is under test. */
function declaredOccupiedMm(
  definition: BodyDefinition,
  buildId: string,
  seatDepthM: number,
): number {
  const record: PlacementRecord = {
    id: "parity",
    buildId,
    kind: definition.kind,
    frame: { x: 0, z: 0, ry: 0, y0: 0, w: 0.6, h: 0.86, d: seatDepthM },
    occupiedDepth: definition.occupiedDepth,
    col: "A|0.00",
    wall: "A",
    rotated: false,
    band: definition.band,
    widthMm: 600,
    heightMm: 860,
    canFinish: definition.canFinish,
    canHandle: definition.canHandle,
    canReplace: definition.canReplace,
    canDelete: definition.canDelete,
    fixedWidth: definition.fixedWidth,
  };
  return toMillimetres(occupiedDepthM(record));
}

function definitionFor(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for ${buildId}`);
  return definition;
}

interface SweepCase {
  readonly buildId: string;
  readonly widthMm: number;
  readonly depthMm: number;
}

/** Every insertable body at every width its entry offers, and a wall carcass at both depths it is
 *  ever built to. Derived from the catalogue rather than listed, so a new §7 row joins the sweep by
 *  existing. */
function insertableCases(): SweepCase[] {
  return CATALOG_BUILD_IDS.flatMap((buildId) => {
    const definition = definitionFor(buildId);
    const depthsMm =
      definition.occupiedDepth.measuredFrom === "recorded-shell"
        ? WALL_BUILD_DEPTHS_MM
        : [definition.nominalDepthMm ?? 580];
    return (definition.sizesMm ?? [600]).flatMap((widthMm) =>
      depthsMm.map((depthMm) => ({ buildId, widthMm, depthMm })),
    );
  });
}

function sizeOf(sweep: SweepCase): CatalogBodySize {
  return {
    widthM: sweep.widthMm / 1000,
    heightM: (definitionFor(sweep.buildId).nominalHeightMm ?? 700) / 1000,
    depthM: sweep.depthMm / 1000,
  };
}

describe("every insertable body fills the depth its catalogue entry declares", () => {
  it.each(insertableCases())(
    "$buildId at $widthMm mm wide, built to $depthMm mm",
    (sweep) => {
      const definition = definitionFor(sweep.buildId);
      const size = sizeOf(sweep);
      const measured = createBodyProbe(kit, room).measure({
        buildId: sweep.buildId,
        ...size,
      });
      const seatDepthM = 2 * measured.seatOffsetM;

      // **The entry's `frameDepthMm` really is `2 ×` the measured seat** (wave S9 review, F4). It is
      // the fallback for a placement with no measured seat of its own, and it is what the domain's
      // fake probe seats a `wall-plane` body from — so every domain-side depth assertion rests on
      // this number being the geometry's. Nothing compared them: the seeded block below does so for
      // seeded entries, and until this line the thirteen insertable `wall-plane` entries were an
      // ungated coincidence. Change a builder's rear overhang without moving `frameDepthMm` and the
      // whole domain suite keeps passing against a body that is no longer built.
      //
      // `wall-plane` only: a parameterised carcass's seat follows the depth it is asked for, so it
      // has no single seat to pin.
      //
      // Compared in whole millimetres, which is the domain's own unit for a depth and what
      // `frameDepthMm` is declared in. A raw metre comparison fails on float noise the geometry
      // really carries — a base seat measures 0.5800000047683715 off `Box3` — and that is the
      // rounding `toMillimetres` exists to do, not a tolerance being granted.
      if (definition.occupiedDepth.measuredFrom === "wall-plane") {
        expect(toMillimetres(seatDepthM)).toBe(definition.frameDepthMm);
      }

      expect(
        measuredOccupiedMm(
          buildCatalogBody(kit, sweep.buildId, size),
          seatDepthM,
        ),
      ).toBe(declaredOccupiedMm(definition, sweep.buildId, seatDepthM));
    },
  );
});

describe("every seeded body fills the depth its catalogue entry declares", () => {
  // A seeded entry describes one already-built body at one measured seat, so `frameDepthMm` is the
  // seat and the geometry takes no parameters — which is what makes the comparison exact.
  const seededBuildIds = [...KITCHEN_L_BODY_CATALOG.entries()]
    .filter(([, definition]) => definition.insertable !== true)
    .map(([buildId]) => buildId);

  it.each(seededBuildIds)("%s", (buildId) => {
    const definition = definitionFor(buildId);
    const seatDepthM = definition.frameDepthMm / 1000;

    expect(
      measuredOccupiedMm(buildDecomposedBody(kit, buildId), seatDepthM),
    ).toBe(declaredOccupiedMm(definition, buildId, seatDepthM));
  });
});

describe("remove → opening → rebuild puts the body back into the space it left", () => {
  function recordsOf(design: Design): PlacementRecord[] {
    return derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  }

  function recordFor(design: Design, placementId: string): PlacementRecord {
    const record = recordsOf(design).find(
      (candidate) => candidate.id === placementId,
    );
    if (!record) throw new Error(`No record for ${placementId}`);
    return record;
  }

  /** The §7 row a §5.4 rebuild or a §5.3 swap would put back in this placement's place. A
   *  structural corner declares none by design (§13.1) and is therefore not swappable at all. */
  function catalogEquivalentOf(buildId: string): string | undefined {
    return definitionFor(buildId).catalogEquivalentId;
  }

  const swappable = KITCHEN_L_DESIGN.placements.filter((placement) =>
    Boolean(catalogEquivalentOf(placement.body.buildId)),
  );

  it.each(swappable)(
    "$id is rebuilt into exactly the opening it vacated",
    (placement) => {
      const columns = deriveColumns(recordsOf(KITCHEN_L_DESIGN));
      const vacatedMm = toMillimetres(
        occupiedDepthM(recordFor(KITCHEN_L_DESIGN, placement.id)),
      );
      const buildId = catalogEquivalentOf(placement.body.buildId);
      if (!buildId) throw new Error(`No equivalent for ${placement.id}`);

      const result = insertBody({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        columns,
        target: { kind: "placement", id: placement.id },
        buildId,
        probe: createBodyProbe(kit, room),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) {
        throw new Error(
          `Swap of ${placement.id} refused: ${result.reason.code}`,
        );
      }

      // Rebuilt the way `scene-sync` rebuilds a persisted placement — through `rebuildDepthM`,
      // from the seat the swap recorded — and then measured. This is the claim the finding is
      // about, and it is about geometry and not about two declarations agreeing: the body that
      // came back fills **exactly** the space the one that left did. Under the old fallback the
      // opening was 40 mm short for a base run, 39 for a pantry and 62 for the fridge.
      const rebuilt = recordFor(result.design, result.effect.placementId);
      const group = buildCatalogBody(kit, buildId, {
        widthM: rebuilt.frame.w,
        heightM: rebuilt.frame.h,
        depthM: rebuildDepthM(kit, buildId, rebuilt.frame.d),
      });

      expect(measuredOccupiedMm(group, rebuilt.frame.d)).toBe(vacatedMm);
    },
  );
});
