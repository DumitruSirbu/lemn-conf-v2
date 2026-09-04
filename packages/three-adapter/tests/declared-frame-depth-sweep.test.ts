// **A declared `frameDepthMm` against what the builder actually produces, over the whole catalogue
// at every declared depth** (M6 wave 6K-d, ADR 0075).
//
// `frameDepthMm` is `deriveFrame`'s fallback for a placement with no measured seat, and ADR 0018
// fixes its meaning: **twice a body's rear overhang**, which for a `wall-plane` entry — whose builder
// ignores the depth it is handed and produces the same body every time — is exactly the seat the
// probe measures. `wallCarcassSeatDepthMm`'s own comment already claims the seeded rows and §7's
// parameterised ones "cannot answer differently".
//
// This is that claim as a gate rather than a comment, and it is here rather than in the domain
// because only this package can build a body and measure it. It is the same shape as
// `cabinet-depth-source.test.ts`'s pairing gate: a declaration held to the geometry, in that
// direction — the geometry is the authority and the declaration follows.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  toMetres,
  wallCarcassDepthMm,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { isCatalogBuildId } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

beforeAll(() => {
  installHeadlessDocument();
});

function kitAt(cabinetDepthMm: number): {
  readonly kit: Kit;
  readonly room: THREE.Object3D;
} {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  return { kit, room: kit.builders["kitchen-l"]() };
}

/** Twice the seat the probe measures for one entry, in whole millimetres. */
function measuredFrameDepthMm(
  cabinetDepthMm: number,
  buildId: string,
  definition: BodyDefinition,
): number {
  const { kit, room } = kitAt(cabinetDepthMm);
  const measurement = createBodyProbe(kit, room).measure({
    buildId,
    widthM: 0.6,
    heightM: 0.72,
    depthM: toMetres(definition.frameDepthMm),
  });
  return Math.round(2 * measurement.seatOffsetM * 1000);
}

/**
 * **Two bodies are deliberately not seated against the wall plane, and for them the invariant above
 * is false by design.** Listed rather than derived, because **nothing declares it** — that gap is
 * reported as a finding rather than papered over, and this set is the smallest honest statement of
 * it until it is ruled on.
 *
 * - `base-corner-x-900` — [ADR 0025](../../../docs/decisions/0025-the-corner-base-legs-seat-on-the-l-joint.md)
 *   drives the X-leg **20 mm into** the return leg rather than leaving a visible gap behind it, and
 *   fixes its origin at `0.58 − 0.600/2 = 0.28`. So `frameDepthMm` is 560 — twice that origin, which
 *   is the placement quantity — while the mesh's back face is 0.300 behind the origin and the probe
 *   answers 600. The 40 mm difference is exactly twice the 20 mm inset.
 * - `hood-600` — [ADR 0039](../../../docs/decisions/0039-the-hood-is-a-standard-depth-hung-at-the-front.md) hangs the
 *   hood at the **front**, so a standard 500 mm hood at a 600 mm kitchen leaves 100 mm of gap behind
 *   it. Its origin is its own centre at 0.350, so `frameDepthMm` is 700 while the body is 500 deep
 *   and the probe answers 500.
 *
 * **Neither is reachable as a defect**: `hood-600` declares a `catalogEquivalentId`, so a depth
 * change resolves it away before the probe sees it, and `base-corner-x-900` is re-seated by `reseat`
 * from its **declared** frame depth rather than from a measurement of its bounding box.
 *
 * `occupiedDepth.measuredFrom` cannot express this. `wall-plane` says the *occupied* depth is
 * measured forward from the wall plane, which is true of both of these; it says nothing about
 * whether the body's own back face touches it.
 *
 * **This set is hand-written because the property is not declarable today, and that is the defect
 * behind it.** The proper fix is a catalogue field saying whether a body's back face sits on the
 * wall plane — declared per entry, never inferred, which is the stance ADR 0058, ADR 0060 and
 * ADR 0061 all take about depth facts. Deferred deliberately (2026-09-05): it is a catalogue-shape
 * change, and until it lands the assertion below that the set is *exactly* these two is what stops
 * a third being absorbed into a list instead of found.
 */
const NOT_SEATED_ON_THE_WALL_PLANE: ReadonlySet<string> = new Set([
  "base-corner-x-900",
  "hood-600",
]);

/** Every entry whose builder **ignores** the depth it is handed, so its seat is a fact about the
 *  body rather than about the request. `recorded-shell` entries are excluded because their seat is a
 *  function of what they were asked for, which is a different claim. */
function depthIgnoringEntries(
  cabinetDepthMm: number,
): readonly (readonly [string, BodyDefinition])[] {
  return [...buildKitchenLBodyCatalog(cabinetDepthMm)].filter(
    ([buildId, definition]) =>
      definition.occupiedDepth.measuredFrom === "wall-plane" &&
      !NOT_SEATED_ON_THE_WALL_PLANE.has(buildId),
  );
}

describe("a wall-plane entry declares the frame depth its builder produces", () => {
  // Not a vacuous sweep: the filter must reach both families and a useful number of rows.
  it.each(declaredCabinetDepthsMm())(
    "has rows of both families to sweep at %i mm",
    (cabinetDepthMm) => {
      const entries = depthIgnoringEntries(cabinetDepthMm);

      expect(entries.length).toBeGreaterThan(5);
      expect(
        entries.filter(([id]) => isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
      expect(
        entries.filter(([id]) => !isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
    },
  );

  // **The exception set is exactly two, and a third would fail here rather than be added quietly.**
  // Each is a body a dated decision moves off the wall plane; a row that disagrees for any other
  // reason is a defect and must be found, not listed.
  it.each(declaredCabinetDepthsMm())(
    "has no row off the wall plane beyond the two declared, at %i mm",
    (cabinetDepthMm) => {
      const offPlane = [...buildKitchenLBodyCatalog(cabinetDepthMm)]
        .filter(
          ([buildId, definition]) =>
            definition.occupiedDepth.measuredFrom === "wall-plane" &&
            definition.frameDepthMm !==
              measuredFrameDepthMm(cabinetDepthMm, buildId, definition),
        )
        .map(([buildId]) => buildId);

      expect(new Set(offPlane)).toEqual(NOT_SEATED_ON_THE_WALL_PLANE);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "declares twice its measured seat, for every such row, at %i mm",
    (cabinetDepthMm) => {
      const disagreeing = depthIgnoringEntries(cabinetDepthMm)
        .map(([buildId, definition]) => ({
          buildId,
          declared: definition.frameDepthMm,
          measured: measuredFrameDepthMm(cabinetDepthMm, buildId, definition),
        }))
        .filter((row) => row.declared !== row.measured);

      expect(disagreeing).toEqual([]);
    },
  );
});
