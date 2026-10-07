// E2 (M8 8D fix round): an arrival with a body selected stands where that body can be seen. The scene does not select
// a body on a wall the eye cuts away, so the view is chosen first, from each view's eye and `cutawayWallsFor`, both
// as the scene calls them. Swept over the seeded rooms of every shape; nothing here needs a scene.
//
// What this cannot see: the scene itself undoing a selection. `use-honour-arrival` in
// `configure-screen-arrival.dom.test.ts` holds the order; the e2e specs hold the rendered result.
import {
  cabinetDepthMmOf,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import {
  cameraPresetsForRoom,
  cutawayWallsFor,
  type CameraPresetId,
} from "@lemnaria/three-adapter";
import { describe, expect, it } from "vitest";

import { viewShowingWall } from "@/scene/camera-preset-store";

import {
  ARMS,
  composedKitchensOf,
  U_ARM,
  type SweepArm,
} from "../support/swept-kitchens";

const ALL_VIEWS: readonly CameraPresetId[] = [
  "overview",
  "wallA",
  "wallB",
  "wallC",
];

function wallsHoldingABody(kitchen: {
  design: { placements: readonly { wall: DesignWall }[] };
}): readonly DesignWall[] {
  return [...new Set(kitchen.design.placements.map((p) => p.wall))];
}

function cuts(
  room: DesignRoom,
  depthMm: number,
  view: CameraPresetId,
  wall: DesignWall,
): boolean {
  const preset = cameraPresetsForRoom(room).find((p) => p.id === view);
  if (preset === undefined) throw new Error(`${room.shape} has no ${view}`);
  return cutawayWallsFor(preset.position, room, depthMm).includes(wall);
}

describe("a wall's own view shows that wall", () => {
  const kitchens = composedKitchensOf(U_ARM);
  const walls = kitchens.flatMap((kitchen) =>
    wallsHoldingABody(kitchen).map((wall) => ({ kitchen, wall })),
  );

  it("is swept over a real number of U kitchens and walls, wall C among them", () => {
    expect(kitchens.length).toBeGreaterThan(50);
    expect(walls.length).toBeGreaterThan(150);
    expect(walls.some(({ wall }) => wall === "C")).toBe(true);
  });

  it("does not cut the wall it is named for, for every U and every wall that holds a body", () => {
    const cutByOwnView = walls.filter(({ kitchen, wall }) =>
      cuts(
        kitchen.design.room,
        cabinetDepthMmOf(kitchen.design),
        `wall${wall}`,
        wall,
      ),
    );

    expect(cutByOwnView).toEqual([]);
  });
});

describe.each(ARMS)(
  "in a $name room, from every view the customer may have stood at",
  (arm: SweepArm) => {
    const kitchens = composedKitchensOf(arm);

    it("is swept over kitchens", () => {
      expect(kitchens.length).toBeGreaterThan(20);
    });

    it("always returns a view that does not cut the wall, and keeps the standing one when it serves", () => {
      for (const kitchen of kitchens) {
        const { room } = kitchen.design;
        const depthMm = cabinetDepthMmOf(kitchen.design);
        const offered = cameraPresetsForRoom(room).map((p) => p.id);
        for (const wall of wallsHoldingABody(kitchen))
          for (const standingAt of ALL_VIEWS) {
            const chosen = viewShowingWall({
              wall,
              standingAt,
              room,
              cabinetDepthMm: depthMm,
            });

            expect(chosen).not.toBeNull();
            if (chosen === null) continue;
            expect(offered).toContain(chosen);
            expect(cuts(room, depthMm, chosen, wall)).toBe(false);
            const standing = offered.includes(standingAt)
              ? standingAt
              : "overview";
            if (!cuts(room, depthMm, standing, wall))
              expect(chosen).toBe(standing);
          }
      }
    });
  },
);

describe("the order the choice is made in", () => {
  const u = composedKitchensOf(U_ARM).find((kitchen) =>
    wallsHoldingABody(kitchen).includes("C"),
  );
  if (u === undefined)
    throw new Error("the sweep holds no U with a body on wall C");
  const room = u.design.room;
  const depthMm = cabinetDepthMmOf(u.design);

  it("leaves the view where it was when the wall is in sight from it", () => {
    const standing = ALL_VIEWS.find(
      (view) =>
        cameraPresetsForRoom(room).some((p) => p.id === view) &&
        !cuts(room, depthMm, view, "C"),
    );
    if (standing === undefined) throw new Error("no view shows wall C");

    expect(
      viewShowingWall({
        wall: "C",
        standingAt: standing,
        room,
        cabinetDepthMm: depthMm,
      }),
    ).toBe(standing);
  });

  it("goes to the wall's own view from one that cuts it", () => {
    const cutting = ALL_VIEWS.find(
      (view) =>
        cameraPresetsForRoom(room).some((p) => p.id === view) &&
        cuts(room, depthMm, view, "C"),
    );
    if (cutting === undefined) return;

    expect(
      viewShowingWall({
        wall: "C",
        standingAt: cutting,
        room,
        cabinetDepthMm: depthMm,
      }),
    ).toBe("wallC");
  });
});
