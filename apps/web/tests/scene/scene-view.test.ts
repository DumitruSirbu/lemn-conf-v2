import {
  KITCHEN_L_DESIGN,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import {
  CAMERA_PRESETS,
  cameraPresetsForRoom,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
} from "@lemnaria/three-adapter";
import { describe, expect, it } from "vitest";

import { resolveSceneView, sceneViewKey } from "../../src/scene/scene-view";

const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
const CORRECTED_ROOM: DesignRoom = { ...SEEDED_ROOM, widthMm: 4560 };

describe("resolveSceneView", () => {
  /** **Wave 7H replaced the reference's three triples here with the room's own.** This asserted
   *  `DEVELOPMENT-SPEC` §6.4's literals, which were framed on the 4.2 x 3.4 m reference room; Q7H-1
   *  makes the drawn room the customer's and Q7H-5 withdraws the fixed point, so reproducing those
   *  numbers is no longer what correct means. What the resolver owes is that it reads the **room's**
   *  preset — asserted against the adapter's answer, which is the one authority on it. */
  it("resolves a preset to the adapter's preset for that room", () => {
    expect(resolveSceneView({ kind: "preset", id: "overview" }, SEEDED_ROOM)) //
      .toEqual({
        position: findCameraPresetForRoom("overview", SEEDED_ROOM).position,
        target: findCameraPresetForRoom("overview", SEEDED_ROOM).target,
        isImmediate: false,
      });
  });

  it("resolves the same preset differently in a different room", () => {
    const seeded = resolveSceneView(
      { kind: "preset", id: "wallA" },
      SEEDED_ROOM,
    );
    const corrected = resolveSceneView(
      { kind: "preset", id: "wallA" },
      CORRECTED_ROOM,
    );

    expect(corrected.target).not.toEqual(seeded.target);
  });

  /** A fixed view is the fidelity capture's own two vectors, and the room reaches it nowhere. */
  it("leaves a fixed view untouched, whatever the room", () => {
    const fixed = {
      kind: "fixed",
      position: [1, 2, 3],
      target: [0, 0, 0],
    } as const;

    expect(resolveSceneView(fixed, CORRECTED_ROOM)).toEqual({
      position: [1, 2, 3],
      target: [0, 0, 0],
      isImmediate: true,
    });
  });

  it("eases preset changes and snaps fixed views", () => {
    expect(
      resolveSceneView({ kind: "preset", id: "wallB" }, SEEDED_ROOM)
        .isImmediate,
    ).toBe(false);
    expect(
      resolveSceneView(
        { kind: "fixed", position: [1, 2, 3], target: [0, 0, 0] },
        SEEDED_ROOM,
      ).isImmediate,
    ).toBe(true);
  });

  /** §11 row 21, at the level this module can see it: every preset looks at the middle of the
   *  kitchen's height, so the 2.20–2.60 row is never at the edge of the frame. Restated from
   *  *frames floor to ceiling* by Q7H-3 — the presets frame the kitchen and the ceiling is
   *  permitted above the frame. */
  it("looks at the middle of the kitchen on every preset, in every room it is given", () => {
    for (const room of [SEEDED_ROOM, CORRECTED_ROOM]) {
      for (const preset of cameraPresetsForRoom(room)) {
        expect(preset.target[1], `${preset.id} eye height`).toBeCloseTo(
          KITCHEN_TOP_M / 2,
          6,
        );
      }
    }
  });
});

describe("sceneViewKey", () => {
  it("is stable across equivalent view objects", () => {
    expect(sceneViewKey({ kind: "preset", id: "wallA" }, SEEDED_ROOM)).toBe(
      sceneViewKey({ kind: "preset", id: "wallA" }, SEEDED_ROOM),
    );
  });

  it("changes when the view changes", () => {
    expect(sceneViewKey({ kind: "preset", id: "wallA" }, SEEDED_ROOM)).not.toBe(
      sceneViewKey({ kind: "preset", id: "wallB" }, SEEDED_ROOM),
    );
  });

  /** So a customer standing on *Perete A* who corrects a wall length eases to where *Perete A* now
   *  is, rather than staying framed on the room they no longer have. */
  it("changes when the room changes under an unchanged view", () => {
    expect(sceneViewKey({ kind: "preset", id: "wallA" }, SEEDED_ROOM)).not.toBe(
      sceneViewKey({ kind: "preset", id: "wallA" }, CORRECTED_ROOM),
    );
  });

  it("does not change when the room changes under a fixed view", () => {
    const fixed = {
      kind: "fixed",
      position: [1, 2, 3],
      target: [0, 0, 0],
    } as const;

    expect(sceneViewKey(fixed, SEEDED_ROOM)).toBe(
      sceneViewKey(fixed, CORRECTED_ROOM),
    );
  });
});

describe("the preset buttons", () => {
  /** `configure-screen.tsx` enumerates `CAMERA_PRESETS` for the three buttons. It reads their
   *  **ids** and never their vectors, so it is not a second live source for the framing — but the
   *  ids must stay the ones the room-driven function answers to. */
  it("offers exactly the ids the room-driven presets answer to", () => {
    expect(cameraPresetsForRoom(CORRECTED_ROOM).map((preset) => preset.id)) //
      .toEqual(CAMERA_PRESETS.map((preset) => preset.id));
  });
});
