import { CAMERA_PRESETS } from "@lemnaria/three-adapter";
import { describe, expect, it } from "vitest";

import { resolveSceneView, sceneViewKey } from "./scene-view";

describe("resolveSceneView", () => {
  it("resolves a preset to the exact position and target in DEVELOPMENT-SPEC 6.4", () => {
    expect(resolveSceneView({ kind: "preset", id: "overview" })).toEqual({
      position: [4.3, 3.0, 5.3],
      target: [1.6, 1.35, 0.85],
      isImmediate: false,
    });
  });

  it("eases preset changes and snaps fixed views", () => {
    expect(resolveSceneView({ kind: "preset", id: "wallB" }).isImmediate).toBe(
      false,
    );
    expect(
      resolveSceneView({
        kind: "fixed",
        position: [1, 2, 3],
        target: [0, 0, 0],
      }).isImmediate,
    ).toBe(true);
  });

  it("frames floor to ceiling on every preset, so the 2.20-2.60 row stays reachable", () => {
    for (const preset of CAMERA_PRESETS) {
      expect(
        preset.target[1],
        `${preset.id} target height`,
      ).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe("sceneViewKey", () => {
  it("is stable across equivalent view objects", () => {
    expect(sceneViewKey({ kind: "preset", id: "wallA" })).toBe(
      sceneViewKey({ kind: "preset", id: "wallA" }),
    );
  });

  it("changes when the view changes", () => {
    expect(sceneViewKey({ kind: "preset", id: "wallA" })).not.toBe(
      sceneViewKey({ kind: "preset", id: "wallB" }),
    );
  });
});
