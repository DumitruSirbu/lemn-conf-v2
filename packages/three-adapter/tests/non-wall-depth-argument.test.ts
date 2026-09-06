// **No non-wall builder reads the depth it is handed**, measured on the built meshes.
//
// M6 wave 6I2 (ADR 0060) split a column's clearance from its build depth and made `resolveDepthM`
// read the declared build depth — on the **wall** arm. For every other band it still hands the
// builder `InsertOpening.d`, which is a clearance, and that is deliberate: base, full-height and
// appliance builders discard the depth argument entirely, so no manufactured size is being decided
// there and §5.2's literal `b.mk(w, h, void.d)` governs. Their depth reaches the kit through
// `makeKit({ cabinetDepthMm })` instead, never through the plan.
//
// That inertness is the **whole justification** for leaving the arm alone, so it is pinned here
// rather than left as a claim in a comment. It is also the thing a future wave is most likely to
// break by accident: giving one base builder a depth parameter would silently make a clearance
// decide a carcass again, which is exactly `docs/BACKLOG.md` entry 15's defect returning by a
// different door.
//
// Measured through the real builders because that is the only place the answer lives — a domain
// test cannot see whether a builder consumed an argument (backlog entry 9).
import {
  INSERTABLE_BODY_DEFINITIONS,
  normaliseBand,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  type CatalogBodySize,
} from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Far enough from any declared depth that a builder reading it would move visibly, and not so far
 *  that a body would be built to an implausible size if one did. */
const PERTURBATION_M = 0.25;

const WIDTH_M = 0.6;
const HEIGHT_M = 0.86;

/** The three entries that **do** consume `size.depthM` (`catalog-bodies.ts`: `wallCabinet`,
 *  `wallLift`, `openShelf`). Named as the expectation rather than derived from the band, so the
 *  sweep below states which side of the line each entry is on instead of assuming it. */
const DEPTH_CONSUMING_BUILD_IDS = ["wall-cabinet", "wall-lift", "open-shelf"];

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

/** Every vertex of every mesh in the built group, rounded to the nanometre and sorted, so two
 *  builds are compared on the geometry they produce rather than on a bounding box that could agree
 *  by luck while the interior moved. */
function geometryFingerprint(group: THREE.Group): string {
  const points: string[] = [];
  group.updateMatrixWorld(true);
  group.traverse((node) => {
    // `isMesh` rather than a bare `instanceof`: three.js declares `Mesh` with `any`-parameterised
    // geometry, so narrowing without it hands back an `any` and the attribute read below stops
    // being type-checked at all.
    if (!isMesh(node)) return;
    const position = node.geometry.getAttribute("position");
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex
        .fromBufferAttribute(position, index)
        .applyMatrix4(node.matrixWorld);
      points.push(
        `${vertex.x.toFixed(9)},${vertex.y.toFixed(9)},${vertex.z.toFixed(9)}`,
      );
    }
  });
  return points.sort().join("|");
}

function buildAtDepth(buildId: string, depthM: number): string {
  const size: CatalogBodySize = {
    widthM: WIDTH_M,
    heightM: HEIGHT_M,
    depthM,
  };
  return geometryFingerprint(buildCatalogBody(kit, buildId, size));
}

interface InsertableEntry {
  readonly buildId: string;
  readonly nominalDepthM: number;
}

function insertableEntries(bandFilter: (buildId: string) => boolean) {
  return INSERTABLE_BODY_DEFINITIONS.filter(
    ([buildId, definition]) =>
      bandFilter(buildId) && definition.nominalDepthMm !== undefined,
  ).map(
    ([buildId, definition]): InsertableEntry => ({
      buildId,
      nominalDepthM: (definition.nominalDepthMm ?? 0) / 1000,
    }),
  );
}

const NON_WALL_ENTRIES = insertableEntries(
  (buildId) => !DEPTH_CONSUMING_BUILD_IDS.includes(buildId),
);

describe("the depth argument reaches only the wall carcasses", () => {
  it("names every insertable entry on one side of the line or the other", () => {
    // The sweep below is worthless if it swept nothing, and the split has to be exhaustive: an
    // entry added later lands in one of these two lists without anyone choosing.
    const all = INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId);
    expect(NON_WALL_ENTRIES.length).toBeGreaterThanOrEqual(10);
    expect(
      DEPTH_CONSUMING_BUILD_IDS.filter((buildId) => !all.includes(buildId)),
    ).toEqual([]);
    expect(NON_WALL_ENTRIES.length + DEPTH_CONSUMING_BUILD_IDS.length).toBe(
      all.length,
    );
  });

  it.each(NON_WALL_ENTRIES)(
    "$buildId builds identical geometry whatever depth it is handed",
    ({ buildId, nominalDepthM }) => {
      const atNominal = buildAtDepth(buildId, nominalDepthM);
      const atPerturbed = buildAtDepth(buildId, nominalDepthM + PERTURBATION_M);

      expect(atNominal).not.toBe("");
      expect(atPerturbed).toBe(atNominal);
    },
  );

  it.each(DEPTH_CONSUMING_BUILD_IDS)(
    "%s does move with the depth it is handed, so the sweep above is a real distinction",
    (buildId) => {
      // The anti-invariant. Without it, "identical geometry at any depth" would also pass if
      // `buildCatalogBody` ignored its `size` argument altogether, or if the fingerprint were
      // constant for an unrelated reason.
      const entry = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === buildId);
      const nominalDepthM = (entry?.[1].nominalDepthMm ?? 0) / 1000;

      expect(buildAtDepth(buildId, nominalDepthM + PERTURBATION_M)).not.toBe(
        buildAtDepth(buildId, nominalDepthM),
      );
    },
  );

  it("puts every depth-consuming entry in the wall band, and no other", () => {
    // The domain's `resolveDepthM` branches on `normaliseBand(body.band) !== "wall"`, so the line
    // this file measures in the adapter and the line that rule draws in the domain have to be the
    // same one. ADR 0011 Gap C: `top` normalises to `wall`, so the raw band would not answer this.
    const wallBandIds = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) => normaliseBand(definition.band) === "wall",
    ).map(([buildId]) => buildId);

    expect(
      DEPTH_CONSUMING_BUILD_IDS.filter((id) => !wallBandIds.includes(id)),
    ).toEqual([]);
  });
});
