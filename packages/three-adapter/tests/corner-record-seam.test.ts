import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  toMetres,
  type BodyProbeFactory,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { findMesh, worldBox } from "./support/structure.js";

const OCCURRED_AT = "2026-09-18T11:00:00.000Z";
const CORNER_IDS = ["p25", "p26", "p9", "p21"] as const;

beforeAll(() => {
  installHeadlessDocument();
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function changedTo700(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm: 700,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`depth change refused: ${result.reason.code}`);
  return result.design;
}

/** The normal scene mount reads record widths through buildAnyBody, then places each group at its
 * recorded centre. This measures the mounted carcass, not a width returned by the same domain
 * query that supplied the test expectation. */
function expectMountedCornersMatchRecords(design: Design): void {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: cabinetDepthMmOf(design),
  });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  try {
    syncSolidBodies({
      kit,
      solidsRoot: solids,
      records: derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
      ),
      room: design.room,
    });
    for (const id of CORNER_IDS) {
      const placement = design.placements.find(
        (candidate) => candidate.id === id,
      );
      const mounted = solids.children.find(
        (candidate) => candidate.userData["placementId"] === id,
      );
      if (!placement || !mounted)
        throw new Error(`missing ${id} corner record or mesh`);
      const carcassName =
        id === "p25" || id === "p26" ? "carcass" : "carcass_shell";
      const box = worldBox(solids, findMesh(mounted, carcassName));
      const widthM =
        placement.wall === "A" ? box.max.x - box.min.x : box.max.z - box.min.z;
      const alongM =
        placement.wall === "A" ? mounted.position.x : mounted.position.z;
      expect(widthM, id).toBeCloseTo(toMetres(placement.body.widthMm), 6);
      expect(alongM, id).toBeCloseTo(toMetres(placement.alongMm), 6);
    }
  } finally {
    disposeKit(kit, room);
  }
}

describe("wave 7D7 S3b — a corner record reaches the mounted body", () => {
  it("draws the engine-only 880 × 1000 shell's non-reference X-leg at 600 and keeps its width after the depth command", () => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm: 880, depthMm: 1000, heightMm: 2600 },
      occurredAt: OCCURRED_AT,
    });
    expect(shell.placements.find(({ id }) => id === "p25")?.body.widthMm).toBe(
      880,
    );
    expectMountedCornersMatchRecords(shell);

    const deepened = changedTo700(shell);
    expect(cabinetDepthMmOf(deepened)).toBe(700);
    expect(
      deepened.placements.map(({ id, body }) => [id, body.widthMm]),
    ).toStrictEqual(shell.placements.map(({ id, body }) => [id, body.widthMm]));
    expectMountedCornersMatchRecords(deepened);
  });

  it("renders a generated customer room at 600, then its 700 mm command result with frozen corner widths", () => {
    const result = generateKitchen({
      room: KITCHEN_L_DESIGN.room,
      occurredAt: OCCURRED_AT,
      probeAt: realProbeFactory(),
    });
    if (!result.ok)
      throw new Error(`generation refused: ${result.reason.code}`);
    const generated = result.design;
    const cornersAt600 = generated.placements
      .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
      .map(({ id, body }) => [id, body.widthMm]);
    expect(cornersAt600).toStrictEqual([
      ["p25", 900],
      ["p26", 320],
      ["p9", 570],
      ["p21", 570],
    ]);
    expectMountedCornersMatchRecords(generated);

    const deepened = changedTo700(generated);
    expect(cabinetDepthMmOf(deepened)).toBe(700);
    expect(
      deepened.placements
        .filter(({ id }) => (CORNER_IDS as readonly string[]).includes(id))
        .map(({ id, body }) => [id, body.widthMm]),
    ).toStrictEqual(cornersAt600);
    expectMountedCornersMatchRecords(deepened);
  });
});
