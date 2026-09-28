// **Adversarial QA for M7 wave 7J — a straight room through the URL and the camera seam.** A stored
// straight room is not proof of what wrote it: a hostile `cornerDirection: "right"` or an L's wall
// B in the query must neither reach the back-link, nor mirror the camera, nor survive into 1D.
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  parseRoomUrlState,
  roomHrefFromDesignRoom,
} from "@/room/room-url-state";
import { resolveSceneView } from "@/scene/scene-view";

const STRAIGHT_ROOM: DesignRoom = {
  shape: "linear",
  widthMm: 3700,
  depthMm: 3400,
  heightMm: 2600,
};

const HOSTILE_RIGHT_STRAIGHT_ROOM = {
  ...STRAIGHT_ROOM,
  cornerDirection: "right",
} as DesignRoom;

function queryOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, "https://example.test").searchParams);
}

describe("7J — the back-link of a straight room", () => {
  it("names wall A and the height only, even for a stored hostile cornerDirection: right", () => {
    expect(roomHrefFromDesignRoom(HOSTILE_RIGHT_STRAIGHT_ROOM)).toBe(
      "/configurator/room?shape=linear&wallA=3.7&height=2.6",
    );
  });

  it("round-trips to 1D and the same room, less the hostile key", () => {
    const state = parseRoomUrlState(
      queryOf(roomHrefFromDesignRoom(HOSTILE_RIGHT_STRAIGHT_ROOM)),
    );

    expect(state).toMatchObject({ substate: "1D", room: STRAIGHT_ROOM });
    if (state.substate !== "1D") return;
    expect(state.room).toStrictEqual(STRAIGHT_ROOM);
  });

  it.each([1200, 1201, 2500, 3699, 5999, 6000])(
    "round-trips a %i mm straight room to itself",
    (widthMm) => {
      const room: DesignRoom = { ...STRAIGHT_ROOM, widthMm };

      const state = parseRoomUrlState(queryOf(roomHrefFromDesignRoom(room)));

      expect(state).toMatchObject({ substate: "1D", room });
    },
  );
});

describe("7J — a straight query with an L's keys", () => {
  it("maps to the four-key straight room, ignoring wallB and direction=right", () => {
    const state = parseRoomUrlState({
      shape: "linear",
      wallA: "3.7",
      wallB: "0.1",
      wallC: "9",
      height: "2.6",
      direction: "right",
    });

    expect(state).toMatchObject({ substate: "1D" });
    if (state.substate !== "1D") return;
    expect(state.room).toStrictEqual(STRAIGHT_ROOM);
    expect(state.input).toStrictEqual({
      shape: "linear",
      wallAMm: 3700,
      heightMm: 2600,
    });
  });

  it.each([
    ["1.199", "1C"],
    ["1.2", "1D"],
    ["6", "1D"],
    ["6.001", "1C"],
  ])("puts wall A %s m at %s, naming only wall A", (wallA, expected) => {
    const state = parseRoomUrlState({ shape: "linear", wallA, height: "2.6" });

    expect(state.substate).toBe(expected);
    if (state.substate === "1C") {
      expect(state.markedFields).toEqual(["wallA"]);
    }
  });
});

describe("7J-A12 — the camera seam for a hostile straight room", () => {
  it.each(["overview", "wallA", "wallB"] as const)(
    "frames %s exactly as the key-less straight room does — never mirrored",
    (id) => {
      expect(
        resolveSceneView({ kind: "preset", id }, HOSTILE_RIGHT_STRAIGHT_ROOM),
      ).toStrictEqual(resolveSceneView({ kind: "preset", id }, STRAIGHT_ROOM));
    },
  );
});
