// M7B wave U4 round 3, adversarial QA — a stale recorded cut set drawn into an L (ADR 0132 A8.2 with
// AC4 (e), "must not: a cutaway in an L or a straight room"; A2, "An L and a straight room never cut
// anything away").
//
// `applyCutaway` records the cut set on the roots' parent and `syncSolidBodies` / `syncVoidMeshes`
// re-apply it to whatever they mount (`applyRecordedCutaway`), without reading the room's shape. A
// stage that was a U when a side wall was cut keeps that record when the same stage is synced to an
// L (7H's in-place redraw keeps one stage), so the L's wall-B bodies and voids are mounted hidden
// until some later `applyCutaway` runs.
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  buildUShellDesign,
  deriveRecordedColumns,
  derivePlacementRecords,
  recomputeVoids,
  toMetres,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCutaway } from "../src/cutaway.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit } from "../src/kitchen-parts.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { wallOf } from "../src/wall-tag.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { OCCURRED_AT } from "./support/u-scene.js";

beforeAll(() => {
  installHeadlessDocument();
});

const U_DESIGN = buildUShellDesign({
  room: {
    shape: "U",
    widthMm: 3000,
    depthMm: 3000,
    wallCMm: 3000,
    heightMm: 2600,
  },
  occurredAt: OCCURRED_AT,
});
const L_DESIGN = buildLShellDesign({
  room: { shape: "L", widthMm: 3000, depthMm: 3000, heightMm: 2600 },
  occurredAt: OCCURRED_AT,
});

describe("a U's recorded cut does not reach an L synced onto the same stage", () => {
  it("draws every body and void of an L after a U whose wall B was cut", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const room = new THREE.Group();
    const solidsRoot = new THREE.Group();
    const voidsRoot = new THREE.Group();
    solidsRoot.add(buildKitchenShell(kit, U_DESIGN.room));
    room.add(solidsRoot, voidsRoot);
    const show = (design: Design): void => {
      const records = derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(600),
      );
      syncSolidBodies({ kit, solidsRoot, records, room: design.room });
      syncVoidMeshes({
        voidsRoot,
        voids: recomputeVoids(
          records,
          deriveRecordedColumns(records, design, toMetres(design.room.widthMm)),
        ),
        room: design.room,
      });
    };
    show(U_DESIGN);
    applyCutaway(solidsRoot, voidsRoot, ["B"]);

    show(L_DESIGN);

    const hidden = [...solidsRoot.children, ...voidsRoot.children]
      .filter((object) => wallOf(object) !== undefined && !object.visible)
      .map(
        (object) =>
          `${String(wallOf(object))}:${String(object.userData["placementId"] ?? object.userData["voidId"])}`,
      );
    expect(hidden).toEqual([]);
  });
});
