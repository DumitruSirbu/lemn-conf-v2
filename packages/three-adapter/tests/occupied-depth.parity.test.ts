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
  buildInsertableBodyDefinitions,
  buildSeededBodyDefinitions,
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

/** The two cabinet depths ADR 0056 declares, **written here as data** for the reason the table in
 *  `cabinet-depth-parameter.test.ts` is: a test that reads the values it checks out of the module it
 *  checks proves nothing. The domain asserts the map holds exactly this pair.
 *
 *  **M6 wave 6I's criterion 4.** This gate is what keeps `occupiedDepth` honest — a declaration
 *  nothing checks is the defect DOM-002 was — and it must not become a claim about 600 only, or the
 *  depth control wave 6J ships would move every body with nothing looking at the result. */
const DECLARED_CABINET_DEPTHS_MM = [600, 700];

/** The depths a wall carcass is ever built to at a given kitchen depth, **cap first**: §7's
 *  head-clearance cap from the map, then the lifted depth over a full-height column (backlog entry
 *  5), which is the 600 mm the two deliberately deep tops are pinned at (ADR 0058) and is therefore
 *  the same at both. Both go through the sweep, because the parameterised rule is a formula and a
 *  formula checked at one point is a constant.
 *
 *  The cap's position is load-bearing: `wallDepthMmAt` reads it from here rather than from a second
 *  map, so the depth a kit is built at and the depth its bodies are swept at cannot drift apart. */
const WALL_BUILD_DEPTHS_MM_BY_CABINET_DEPTH: ReadonlyMap<
  number,
  readonly number[]
> = new Map([
  [600, [330, 600]],
  [700, [400, 600]],
]);

/** The depths a wall carcass is built to at this kitchen depth, or a refusal. Total rather than
 *  optional for the reason `wallDepthMmAt` below is: a cabinet depth added to
 *  `DECLARED_CABINET_DEPTHS_MM` without a row here would otherwise drop **every** wall and top
 *  carcass case out of the sweep — the whole `recorded-shell` population — with the suite still
 *  green. */
function wallBuildDepthsMmAt(cabinetDepthMm: number): readonly number[] {
  const depthsMm = WALL_BUILD_DEPTHS_MM_BY_CABINET_DEPTH.get(cabinetDepthMm);
  if (!depthsMm) {
    throw new Error(
      `no wall build depths row for ${String(cabinetDepthMm)} mm`,
    );
  }
  return depthsMm;
}

/** ADR 0028's map, as the kit takes it: the declared depth of a wall or top carcass at this cabinet
 *  depth. The adapter cannot derive it — §12 keeps the map in the domain — so a kit is handed the
 *  row, and `cabinet-depth-source.test.ts` is what holds these numbers to the domain's own map.
 *
 *  Read as the **first** entry of the sweep row above, which is the cap, rather than restated in a
 *  second map: the second entry is the lifted depth over a column and is not what a kit is built
 *  at. Two tables carrying the same column is the drift ADR 0028 exists to stop. */
function wallDepthMmAt(cabinetDepthMm: number): number {
  const [capMm] = wallBuildDepthsMmAt(cabinetDepthMm);
  if (capMm === undefined) {
    throw new Error(
      `empty wall build depths row for ${String(cabinetDepthMm)}`,
    );
  }
  return capMm;
}

const kits = new Map<number, { kit: Kit; room: THREE.Object3D }>();

/** The shipped kitchen's kit, which every assertion about the *seeded* population uses. */
let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  for (const cabinetDepthMm of DECLARED_CABINET_DEPTHS_MM) {
    const built = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
      wallDepthMm: wallDepthMmAt(cabinetDepthMm),
    });
    kits.set(cabinetDepthMm, {
      kit: built,
      room: built.builders["kitchen-l"](),
    });
  }
  const shipped = kits.get(SHIPPED_CABINET_DEPTH_MM);
  if (!shipped) throw new Error("no kit at the shipped depth");
  kit = shipped.kit;
  room = shipped.room;
});

/** The depth the shipped kitchen is declared at, and the one the third block below — a §5.3 swap
 *  over `KITCHEN_L_DESIGN` — runs at, because that design is the shipped document. */
const SHIPPED_CABINET_DEPTH_MM = 600;

function kitAt(cabinetDepthMm: number): { kit: Kit; room: THREE.Object3D } {
  const built = kits.get(cabinetDepthMm);
  if (!built) throw new Error(`no kit at ${String(cabinetDepthMm)} mm`);
  return built;
}

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

/** The seeded map's entry, which describes one already-built body at the shipped depth. */
function definitionFor(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for ${buildId}`);
  return definition;
}

/** The §7 entry **as it is built at this cabinet depth** — the catalogue is a function of the depth
 *  since wave 6H, and reading the shipped materialisation here would sweep a 700 mm kitchen against
 *  a 600 mm kitchen's declarations. */
function insertableDefinitionAt(
  cabinetDepthMm: number,
  buildId: string,
): BodyDefinition {
  const found = buildInsertableBodyDefinitions(cabinetDepthMm).find(
    ([id]) => id === buildId,
  );
  if (!found) throw new Error(`No catalogue entry for ${buildId}`);
  return found[1];
}

interface SweepCase {
  readonly cabinetDepthMm: number;
  readonly buildId: string;
  readonly widthMm: number;
  readonly depthMm: number;
}

/** Every insertable body at every width its entry offers, at every depth a wall carcass is ever
 *  built to, **at every cabinet depth the product declares**. Derived from the catalogue rather than
 *  listed, so a new §7 row joins the sweep by existing and a new map row joins it by being declared. */
function insertableCases(): SweepCase[] {
  return DECLARED_CABINET_DEPTHS_MM.flatMap((cabinetDepthMm) =>
    CATALOG_BUILD_IDS.flatMap((buildId) => {
      const definition = insertableDefinitionAt(cabinetDepthMm, buildId);
      const depthsMm =
        definition.occupiedDepth.measuredFrom === "recorded-shell"
          ? wallBuildDepthsMmAt(cabinetDepthMm)
          : [definition.nominalDepthMm ?? 580];
      return (definition.sizesMm ?? [600]).flatMap((widthMm) =>
        depthsMm.map((depthMm) => ({
          cabinetDepthMm,
          buildId,
          widthMm,
          depthMm,
        })),
      );
    }),
  );
}

function sizeOf(sweep: SweepCase): CatalogBodySize {
  return {
    widthM: sweep.widthMm / 1000,
    heightM:
      (insertableDefinitionAt(sweep.cabinetDepthMm, sweep.buildId)
        .nominalHeightMm ?? 700) / 1000,
    depthM: sweep.depthMm / 1000,
  };
}

describe("every insertable body fills the depth its catalogue entry declares", () => {
  it.each(insertableCases())(
    "$buildId at $widthMm mm wide, built to $depthMm mm, in a $cabinetDepthMm mm kitchen",
    (sweep) => {
      const definition = insertableDefinitionAt(
        sweep.cabinetDepthMm,
        sweep.buildId,
      );
      const size = sizeOf(sweep);
      const built = kitAt(sweep.cabinetDepthMm);
      const measured = createBodyProbe(built.kit, built.room).measure({
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
          buildCatalogBody(built.kit, sweep.buildId, size),
          seatDepthM,
        ),
      ).toBe(declaredOccupiedMm(definition, sweep.buildId, seatDepthM));
    },
  );
});

describe("every seeded body fills the depth its catalogue entry declares", () => {
  // A seeded entry describes one already-built body at one measured seat, so `frameDepthMm` is the
  // seat and the geometry takes no parameters at a given depth — which is what makes the comparison
  // exact.
  //
  // **At both declared depths since wave 6I, which is criterion 4's other half.** The seeded map was
  // a module constant materialised at 600, so this gate — the one that keeps `occupiedDepth` honest
  // at all — could only ever have been a claim about the shipped kitchen. It is also where ADR 0058's
  // two pinned entries live, so sweeping it at 700 is what makes the pin an observation rather than
  // an assertion about a catalogue nobody built.
  const seededCases = DECLARED_CABINET_DEPTHS_MM.flatMap((cabinetDepthMm) =>
    buildSeededBodyDefinitions(cabinetDepthMm).map(([buildId, definition]) => ({
      cabinetDepthMm,
      buildId,
      definition,
    })),
  );

  it.each(seededCases)("$buildId in a $cabinetDepthMm mm kitchen", (seeded) => {
    const seatDepthM = seeded.definition.frameDepthMm / 1000;

    expect(
      measuredOccupiedMm(
        buildDecomposedBody(kitAt(seeded.cabinetDepthMm).kit, seeded.buildId),
        seatDepthM,
      ),
    ).toBe(declaredOccupiedMm(seeded.definition, seeded.buildId, seatDepthM));
  });

  // The seeded population is the whole of M2's scene and nothing has been dropped from the sweep by
  // the parameterisation — the shipped map and the map built at the shipped depth are the same rows.
  it("sweeps every seeded row the shipped catalogue holds", () => {
    expect(buildSeededBodyDefinitions(600).map(([buildId]) => buildId)).toEqual(
      [...KITCHEN_L_BODY_CATALOG.entries()]
        .filter(([, definition]) => definition.insertable !== true)
        .map(([buildId]) => buildId),
    );
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
      const columns = deriveColumns(
        recordsOf(KITCHEN_L_DESIGN),
        {},
        KITCHEN_L_DESIGN.room,
      );
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
