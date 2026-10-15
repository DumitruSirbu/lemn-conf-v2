// An arrival with a body stands at that body's own wall view, in every room shape. A view that merely does not cut a
// wall may still not show it (a U's wall C is off the screen from wall A's), so the rule is not about cutting; but a
// wall's own view must not cut the wall it is named for, or the scene would deselect the body at once. Swept over the
// seeded rooms of every shape; nothing here needs a scene.
import {
  cabinetDepthMmOf,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import { cameraPresetsForRoom, cutawayWallsFor } from "@lemnaria/three-adapter";
import { describe, expect, it } from "vitest";

import { viewOfWall } from "@/scene/camera-preset-store";

import {
  ARMS,
  composedKitchensOf,
  U_ARM,
  type SweepArm,
} from "../support/swept-kitchens";

function wallsHoldingABody(kitchen: {
  design: { placements: readonly { wall: DesignWall }[] };
}): readonly DesignWall[] {
  return [...new Set(kitchen.design.placements.map((p) => p.wall))];
}

describe("in a U, a wall's own view does not cut that wall", () => {
  const kitchens = composedKitchensOf(U_ARM);
  const walls = kitchens.flatMap((kitchen) =>
    wallsHoldingABody(kitchen).map((wall) => ({ kitchen, wall })),
  );

  it("is swept over a real number of U kitchens and walls, wall C among them", () => {
    expect(kitchens.length).toBeGreaterThan(50);
    expect(walls.length).toBeGreaterThan(150);
    expect(walls.some(({ wall }) => wall === "C")).toBe(true);
  });

  it("holds for every U and every wall that holds a body", () => {
    const cutByOwnView = walls.filter(({ kitchen, wall }) => {
      const { room } = kitchen.design;
      const view = cameraPresetsForRoom(room).find(
        (p) => p.id === viewOfWall(wall, room),
      );
      if (view === undefined) return true;
      return cutawayWallsFor(
        view.position,
        room,
        cabinetDepthMmOf(kitchen.design),
      ).includes(wall);
    });

    expect(cutByOwnView).toEqual([]);
  });
});

describe.each(ARMS)("in a $name room", (arm: SweepArm) => {
  const kitchens = composedKitchensOf(arm);

  it("is swept over kitchens", () => {
    expect(kitchens.length).toBeGreaterThan(20);
  });

  it("every wall that holds a body has its own view, which the room offers", () => {
    for (const kitchen of kitchens) {
      const { room } = kitchen.design;
      const offered = cameraPresetsForRoom(room).map((p) => p.id);
      for (const wall of wallsHoldingABody(kitchen)) {
        const view = viewOfWall(wall, room);

        expect(view).toBe(`wall${wall}`);
        expect(offered).toContain(view);
      }
    }
  });
});

describe("a wall the room does not have", () => {
  const straight: DesignRoom = {
    shape: "linear",
    widthMm: 3600,
    depthMm: 600,
    heightMm: 2500,
  };

  it.each(["B", "C"] as const)("has no view: %s of a straight room", (wall) => {
    expect(viewOfWall(wall, straight)).toBeNull();
  });
});
