// M7B U4 round 4 (ADR 0132 A2 and A8.2): a cut set recorded while a stage shows a U applies only to a
// U. The web keeps one stage across a change of room shape (ADR 0074 d1), so the record outlives the
// U it was made for, and an L or a straight room synced onto it must draw every body and void.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  deriveRecordedColumns,
  derivePlacementRecords,
  recomputeVoids,
  toMetres,
  type Design,
  type DesignWall,
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

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const EVERY_WALL: readonly DesignWall[] = ["A", "B", "C"];

const DESIGNS = {
  U: buildUShellDesign({
    room: {
      shape: "U",
      widthMm: 3000,
      depthMm: 3000,
      wallCMm: 3000,
      heightMm: 2600,
    },
    occurredAt: OCCURRED_AT,
  }),
  L: buildLShellDesign({
    room: { shape: "L", widthMm: 3000, depthMm: 3000, heightMm: 2600 },
    occurredAt: OCCURRED_AT,
  }),
  linear: buildLinearShellDesign({
    room: { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    occurredAt: OCCURRED_AT,
  }),
} as const satisfies Record<string, Design>;

type Shape = keyof typeof DESIGNS;

beforeAll(() => {
  installHeadlessDocument();
});

/** One stage kept across every change of shape, mounted the way the web mounts it. */
function mountStage() {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const room = new THREE.Group();
  const solidsRoot = new THREE.Group();
  const voidsRoot = new THREE.Group();
  solidsRoot.add(buildKitchenShell(kit, DESIGNS.U.room));
  room.add(solidsRoot, voidsRoot);

  function show(shape: Shape, options: { readonly passRoomToVoids: boolean }) {
    const design = DESIGNS[shape];
    const records = derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(600),
    );
    const voids = recomputeVoids(
      records,
      deriveRecordedColumns(records, design, toMetres(design.room.widthMm)),
    );
    syncSolidBodies({ kit, solidsRoot, records, room: design.room });
    syncVoidMeshes({
      voidsRoot,
      voids,
      ...(options.passRoomToVoids ? { room: design.room } : {}),
    });
  }
  const wallKeyed = () =>
    [...solidsRoot.children, ...voidsRoot.children].filter(
      (object) => wallOf(object) !== undefined,
    );
  const hiddenWalls = () =>
    wallKeyed()
      .filter((object) => !object.visible)
      .map((object) => wallOf(object));
  const cut = (walls: readonly DesignWall[]): void => {
    applyCutaway(solidsRoot, voidsRoot, walls);
  };

  return { show, wallKeyed, hiddenWalls, cut, voidsRoot };
}

const BOTH_WAYS = [
  ["passing the room to the void sync", true],
  ["not passing it", false],
] as const;

describe("a recorded cut set applies only to a U", () => {
  it.each(BOTH_WAYS)(
    "U then L, %s: every body and void of the L is drawn",
    (_name, passRoomToVoids) => {
      const stage = mountStage();
      stage.show("U", { passRoomToVoids });
      stage.cut(["B"]);
      expect(stage.hiddenWalls().length).toBeGreaterThan(0);

      stage.show("L", { passRoomToVoids });

      expect(stage.wallKeyed().length).toBeGreaterThan(0);
      expect(stage.hiddenWalls()).toEqual([]);
    },
  );

  it.each(BOTH_WAYS)(
    "U, L, straight, U, %s: nothing is hidden by a stale record, and a U cut again holds through a sync",
    (_name, passRoomToVoids) => {
      const stage = mountStage();
      stage.show("U", { passRoomToVoids });
      stage.cut(EVERY_WALL);

      stage.show("L", { passRoomToVoids });
      expect(stage.hiddenWalls(), "L").toEqual([]);
      stage.show("linear", { passRoomToVoids });
      expect(stage.hiddenWalls(), "straight").toEqual([]);
      stage.show("U", { passRoomToVoids });
      expect(stage.hiddenWalls(), "U again, before a new cut").toEqual([]);

      stage.cut(["C"]);
      stage.show("U", { passRoomToVoids });
      const hidden = stage.hiddenWalls();
      expect(hidden.length, "U re-cut").toBeGreaterThan(0);
      expect(new Set(hidden)).toEqual(new Set(["C"]));
    },
  );

  it("a void-only sync of an L, given its room, discards the stale record and shows everything it hid", () => {
    const stage = mountStage();
    stage.show("U", { passRoomToVoids: true });
    stage.cut(["B"]);
    const design = DESIGNS.L;
    const records = derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(600),
    );

    syncVoidMeshes({
      voidsRoot: stage.voidsRoot,
      voids: recomputeVoids(
        records,
        deriveRecordedColumns(records, design, toMetres(design.room.widthMm)),
      ),
      room: design.room,
    });

    expect(stage.voidsRoot.children.length).toBeGreaterThan(0);
    expect(stage.hiddenWalls()).toEqual([]);
  });

  propertyTest.prop(
    [
      fc.array(fc.constantFrom<Shape>("U", "L", "linear"), {
        minLength: 1,
        maxLength: 8,
      }),
      fc.subarray([...EVERY_WALL]),
      fc.boolean(),
    ],
    { numRuns: 60 },
  )(
    "over any sequence of shapes an L or a straight room never has a hidden wall-keyed object after a sync, and a U hides only what was cut",
    (shapes, walls, passRoomToVoids) => {
      const stage = mountStage();

      for (const shape of shapes) {
        stage.show(shape, { passRoomToVoids });
        if (shape === "U") {
          stage.cut(walls);
          stage.show("U", { passRoomToVoids });
          expect(
            stage.hiddenWalls().every((wall) => walls.includes(wall ?? "A")),
          ).toBe(true);
        } else {
          expect(stage.hiddenWalls(), shape).toEqual([]);
        }
      }
    },
  );
});
