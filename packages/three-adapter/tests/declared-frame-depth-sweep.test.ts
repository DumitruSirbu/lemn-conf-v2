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
  measurableSeatOf,
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
    seatedOn: measurableSeatOf({ buildId, rule: definition.seatRule }),
  });
  return Math.round(2 * measurement.seatOffsetM * 1000);
}

/**
 * **There is no exception set any more, and that is the point of ADR 0077.**
 *
 * This file used to carry a hand-written `NOT_SEATED_ON_THE_WALL_PLANE` of `base-corner-x-900` and
 * `hood-600`, with a comment saying the set existed "because the property is not declarable today".
 * It is declarable now: every entry states its `seatRule`, and each row below is measured against
 * **its own declared plane** rather than against an assumed one. A list nobody can add a row to is
 * strictly better than a list that is asserted to be exactly two.
 *
 * **One sentence in that comment was false when it was written**, and is recorded here because it is
 * why the defect survived the wave that introduced it. It said neither exception was "reachable as a
 * defect" because `base-corner-x-900` is "re-seated by `reseat` from its **declared** frame depth
 * rather than from a measurement of its bounding box". `reseat` passed the declaration *in* as the
 * probe's `depthM` argument and persisted `2 × seatOffsetM` *out*; `cornerBaseX()` takes no
 * arguments, so the declaration reached nothing and the measurement was what got stored. A round
 * trip moved the leg 20 mm forward into `base-corner-return-320`.
 *
 * `hood-600` now joins the sweep rather than being excused from it: under `cabinet-front-line` its
 * declared 700 is measurable, which closes a latent defect where it declared 700, measured 500, and
 * was saved only by being resolved away before the probe saw it.
 */

/** Every entry whose builder **ignores** the depth it is handed, so its seat is a fact about the
 *  body rather than about the request. `recorded-shell` entries are excluded because their seat is a
 *  function of what they were asked for, which is a different claim. */
function depthIgnoringEntries(
  cabinetDepthMm: number,
): readonly (readonly [string, BodyDefinition])[] {
  return [...buildKitchenLBodyCatalog(cabinetDepthMm)].filter(
    ([, definition]) =>
      definition.occupiedDepth.measuredFrom === "wall-plane" &&
      // **Excused by its own declaration, not by a list.** A joint-seated body has no plane of its
      // own, so "declares twice its measured seat" is not a claim that can be made about it — the
      // probe cannot be asked. Its gate is the non-intersection check instead, which is a stronger
      // claim than the one it is excused from, not a weaker one.
      definition.seatRule?.seatedOn !== "joint",
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

  // **Every arm has a member, so the sweep cannot pass by reaching only one kind of body.** This is
  // what the deleted exception set is replaced by: not a shorter list, but a check that the three
  // declared arms are all populated and therefore all exercised somewhere in this file.
  it.each(declaredCabinetDepthsMm())(
    "has a member of every declared seat rule at %i mm",
    (cabinetDepthMm) => {
      const bySeatRule = new Map<string, string[]>();
      for (const [buildId, definition] of buildKitchenLBodyCatalog(
        cabinetDepthMm,
      )) {
        const seatedOn = definition.seatRule?.seatedOn ?? "undeclared";
        bySeatRule.set(seatedOn, [
          ...(bySeatRule.get(seatedOn) ?? []),
          buildId,
        ]);
      }

      expect(bySeatRule.get("undeclared")).toBeUndefined();
      expect(bySeatRule.get("wall-plane")?.length).toBeGreaterThan(5);
      expect(bySeatRule.get("cabinet-front-line")?.length).toBeGreaterThan(0);
      expect(bySeatRule.get("joint")?.length).toBeGreaterThan(0);
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
