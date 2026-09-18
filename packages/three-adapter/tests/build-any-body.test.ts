// **One author for "which builder builds this id", and the guard that keeps it one** (M6 wave 6K-d).
//
// The choice between §7's parameterised rows and M2's seeded decompositions was made twice, and the
// two copies drifted: `scene-sync.ts` guarded on `isCatalogBuildId`, `measure-built-body.ts` did not.
// So `createBodyProbe` threw `No catalog builder registered` for every decomposition id, and a live
// depth change on the seeded kitchen threw.
//
// **The boundary, measured in a browser on 2026-09-04 rather than inferred.** A depth change does
// *not* hand the probe all 21 seeded ids: `resolveRebuildBody` resolves 22 of the 26 placements to
// their `catalogEquivalentId` **before** the probe sees them, so 22 measurements succeed and the
// command throws at the first body on `reseat`'s arm. The ids that reach the probe unresolved are
// exactly the four with no catalogue equivalent — `base-corner-x-900`, `base-corner-return-320`,
// `wall-corner-return-570`, `wall-corner-return-570-top` — and those are what `reseat` exists for.
// The last test below names that set, derived from the declaration rather than written out.
//
// The falsifiable form of "there is one author" is nevertheless the wider one: the **probe** can
// build everything the **scene** can, over both families, since the scene mounts every seeded id
// whether or not a depth change would resolve it. Wave 7D7 S3b makes the four corner widths a
// recorded input to this shared dispatch; other seeded decompositions still ignore size.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  toMetres,
  wallCarcassDepthMm,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildAnyBody } from "../src/build-any-body.js";
import { CATALOG_BUILD_IDS, isCatalogBuildId } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { describeStructure, findMesh, worldBox } from "./support/structure.js";

const DEFAULT_MM = 600;
const CORNER_CASES = [
  ["base-corner-x-900", 880, "carcass"],
  ["base-corner-return-320", 300, "carcass"],
  ["wall-corner-return-570", 550, "carcass_shell"],
  ["wall-corner-return-570-top", 550, "carcass_shell"],
] as const;
const CORNER_BUILD_IDS = new Set<string>(
  CORNER_CASES.map(([buildId]) => buildId),
);

/** Every id the shipped kitchen stands on. **All of them are decompositions**: M2's seeded scene is
 *  built entirely from them, and a catalogue id only appears once a customer inserts or a depth
 *  change resolves a seeded entry to its equivalent. */
const SEEDED_BUILD_IDS: readonly string[] = [
  ...new Set(KITCHEN_L_DESIGN.placements.map((p) => p.body.buildId)),
];

/** Both families, derived — the seeded scene plus §7's parameterised rows. Neither list is written
 *  out here, so a body added to either is swept without anybody remembering. */
const EVERY_BUILD_ID: readonly string[] = [
  ...new Set([...SEEDED_BUILD_IDS, ...CATALOG_BUILD_IDS]),
];

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: DEFAULT_MM,
    wallDepthMm: wallCarcassDepthMm(DEFAULT_MM),
  });
  room = kit.builders["kitchen-l"]();
});

describe("the one dispatch the scene and the probe share", () => {
  // Not a vacuous sweep: the shipped kitchen must actually carry both families, or "the probe can
  // build everything the scene can" would be a claim about one of them.
  it("sweeps both families, so neither claim below is about only one", () => {
    const decompositions = EVERY_BUILD_ID.filter(
      (buildId) => !isCatalogBuildId(buildId),
    );
    const catalogue = EVERY_BUILD_ID.filter(isCatalogBuildId);

    expect(decompositions.length).toBeGreaterThan(0);
    expect(catalogue.length).toBeGreaterThan(0);
    // The two families partition the set: an id in both would make "which builder owns it" the very
    // question this module exists to answer once.
    expect(decompositions.length + catalogue.length).toBe(
      EVERY_BUILD_ID.length,
    );
  });

  it.each(EVERY_BUILD_ID)("builds %s through one entry point", (buildId) => {
    const built = buildAnyBody(kit, buildId, {
      widthM: 0.6,
      heightM: 0.72,
      depthM: toMetres(
        buildKitchenLBodyCatalog(DEFAULT_MM).get(buildId)?.frameDepthMm ?? 600,
      ),
    });

    expect(built.children.length).toBeGreaterThan(0);
  });

  // **The defect, as an assertion.** The probe threw for exactly the ids the scene handled, which no
  // suite saw because both fake probes build nothing at all.
  // **The narrow boundary, and the one a depth change actually reaches.** `reseat` passes a record's
  // own seeded id straight through, so these are the ids the probe must build unresolved. Derived
  // from `catalogEquivalentId` rather than listed, so a seeded row that gains or loses an equivalent
  // moves this set on its own.
  it("measures every seeded body a depth change cannot resolve away", () => {
    const catalog = buildKitchenLBodyCatalog(DEFAULT_MM);
    const unresolved = SEEDED_BUILD_IDS.filter(
      (buildId) => catalog.get(buildId)?.catalogEquivalentId === undefined,
    );
    const probe = createBodyProbe(kit, room);

    // Four today, and the count is asserted so the filter cannot quietly match nothing — the
    // failure mode a "does not throw" loop has when its input list is empty.
    expect(unresolved).toHaveLength(4);
    for (const buildId of unresolved) {
      expect(() =>
        probe.measure({
          buildId,
          widthM: 0.6,
          heightM: 0.72,
          depthM: toMetres(catalog.get(buildId)?.frameDepthMm ?? 600),
          seatedOn: "wall-plane",
        }),
      ).not.toThrow();
    }
  });

  it.each(EVERY_BUILD_ID)("measures %s with the real probe", (buildId) => {
    const probe = createBodyProbe(kit, room);

    const measured = probe.measure({
      buildId,
      seatedOn: "wall-plane",
      widthM: 0.6,
      heightM: 0.72,
      depthM: toMetres(
        buildKitchenLBodyCatalog(DEFAULT_MM).get(buildId)?.frameDepthMm ?? 600,
      ),
    });

    expect(measured.seatOffsetM).toBeGreaterThan(0);
  });
});

describe("the four structural corner widths cross the shared dispatch", () => {
  it.each([600, 700] as const)(
    "builds all four at non-reference widths and ignores supplied height/depth at %i mm",
    (cabinetDepthMm) => {
      const depthKit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
        wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
      });
      const probeRoom = depthKit.builders["kitchen-l"]();
      const probe = createBodyProbe(depthKit, probeRoom);
      for (const [buildId, widthMm, carcassName] of CORNER_CASES) {
        const widthM = toMetres(widthMm);
        const size = { widthM, heightM: 1.23, depthM: 0.19 };
        const built = buildAnyBody(depthKit, buildId, size);
        const box = worldBox(built, findMesh(built, carcassName));
        const changedOtherAxes = buildAnyBody(depthKit, buildId, {
          widthM,
          heightM: 0.2,
          depthM: 1.1,
        });
        const measured = probe.measure({
          ...size,
          buildId,
          seatedOn: "wall-plane",
        });

        expect(box.max.x - box.min.x, buildId).toBeCloseTo(widthM, 6);
        // The return's probe excludes its plain `carcass` mesh and measures the inset
        // plinth/counter set, whose union is 2 mm narrower than its authored carcass.
        const measuredWidthM =
          buildId === "base-corner-return-320" ? widthM - 0.002 : widthM;
        expect(measured.carcassWidthM, buildId).toBeCloseTo(measuredWidthM, 6);
        expect(describeStructure(changedOtherAxes), buildId).toStrictEqual(
          describeStructure(built),
        );
      }
    },
  );

  it("keeps every other seeded decomposition independent of all supplied size axes", () => {
    const nonCorners = SEEDED_BUILD_IDS.filter(
      (buildId) => !CORNER_BUILD_IDS.has(buildId),
    );
    expect(nonCorners.length).toBeGreaterThan(0);
    for (const buildId of nonCorners) {
      const first = buildAnyBody(kit, buildId, {
        widthM: 0.25,
        heightM: 0.3,
        depthM: 0.2,
      });
      const second = buildAnyBody(kit, buildId, {
        widthM: 1.1,
        heightM: 1.4,
        depthM: 0.9,
      });
      expect(describeStructure(second), buildId).toStrictEqual(
        describeStructure(first),
      );
    }
  });
});
