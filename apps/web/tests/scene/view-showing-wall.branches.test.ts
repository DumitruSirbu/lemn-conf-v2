// The branches of E2's choice that the real views do not all reach: the standing view serves, the wall's own view
// serves, only a later view serves, and none does. The adapter's `cutawayWallsFor` is the one thing replaced, so each
// branch is reached by saying which views cut the wall.
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cutBy = vi.hoisted(() => ({ views: new Set<string>() }));

vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    // A view is told apart by its eye's x, which the real presets differ in; the table below names which cut wall C.
    cutawayWallsFor: (eye: readonly [number, number, number]) =>
      cutBy.views.has(String(eye[0])) ? ["C"] : [],
  };
});

import { cameraPresetsForRoom } from "@lemnaria/three-adapter";

import { viewShowingWall } from "@/scene/camera-preset-store";

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4000,
  depthMm: 3000,
  heightMm: 2600,
  wallCMm: 3000,
};

function eyeKey(view: string): string {
  const preset = cameraPresetsForRoom(U_ROOM).find((p) => p.id === view);
  if (preset === undefined) throw new Error(`no ${view}`);
  return String(preset.position[0]);
}

function choose(standingAt: "overview" | "wallA" | "wallB" | "wallC") {
  return viewShowingWall({
    wall: "C",
    standingAt,
    room: U_ROOM,
    cabinetDepthMm: 600,
  });
}

beforeEach(() => {
  cutBy.views = new Set();
});

describe("which view an arrival stands at", () => {
  it("keeps the standing view when it does not cut the wall", () => {
    cutBy.views = new Set([eyeKey("wallC")]);

    expect(choose("wallA")).toBe("wallA");
  });

  it("takes the wall's own view when the standing one cuts it", () => {
    cutBy.views = new Set([eyeKey("overview")]);

    expect(choose("overview")).toBe("wallC");
  });

  it("takes the first view, in the room's order, that does not cut it when the wall's own view does too", () => {
    cutBy.views = new Set([eyeKey("overview"), eyeKey("wallC")]);

    expect(choose("overview")).toBe("wallA");
  });

  it("takes the next one in order when the first is cut as well", () => {
    cutBy.views = new Set([
      eyeKey("overview"),
      eyeKey("wallC"),
      eyeKey("wallA"),
    ]);

    expect(choose("overview")).toBe("wallB");
  });

  it("answers null when no view shows the wall, so nothing is selected", () => {
    cutBy.views = new Set(
      cameraPresetsForRoom(U_ROOM).map((p) => String(p.position[0])),
    );

    expect(choose("overview")).toBeNull();
  });
});
