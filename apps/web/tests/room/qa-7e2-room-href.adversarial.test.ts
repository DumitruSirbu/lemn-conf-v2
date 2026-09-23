// QA round 2, wave 7E2 criterion 5: the editor's back controls must reopen Step 1 with the design's
// room already filled in. `roomHrefFromDesignRoom` is the whole of that promise, and a hand-picked
// room cannot show that the metre formatting survives every approved dimension — the trailing-zero
// strip and the three-digit pad are per-value transitions.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type CornerDirection,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  parseRoomUrlState,
  roomHrefFromDesignRoom,
  type RoomSearchParams,
} from "@/room/room-url-state";

// 6000 mm per wall since M7 7A3 (ADR 0120 Amendment B2).
const APPROVED_WALL_A_MM = fc.integer({ min: 900, max: 6000 });
const APPROVED_WALL_B_MM = fc.integer({ min: 1000, max: 6000 });
const APPROVED_HEIGHT_MM = fc.integer({ min: 2200, max: 3900 });
const SWEEP_RUNS = 1000;

// ADR 0129 D2: the right arm adds `cornerDirection`, the left arm leaves the room at its original
// four keys — so this sweep draws both the byte-identical-left rooms G4 fixed and the right ones
// D9 adds, in the same proportion `anyCornerDirection` picks.
const anyCornerDirection = fc.constantFrom<CornerDirection>("left", "right");
const APPROVED_L_ROOM: fc.Arbitrary<DesignRoom> = fc
  .record({
    shape: fc.constant<"L">("L"),
    widthMm: APPROVED_WALL_A_MM,
    depthMm: APPROVED_WALL_B_MM,
    heightMm: APPROVED_HEIGHT_MM,
  })
  .chain((room) =>
    anyCornerDirection.map((cornerDirection) =>
      cornerDirection === "right" ? { ...room, cornerDirection } : room,
    ),
  );

describe("the editor's back link, over every approved room", () => {
  it("reopens Step 1 on the design's own room, to the millimetre", () => {
    // The per-wall bounds are not the whole policy — the minimum-kitchen rule refuses a small L on
    // `shape` — so only rooms Step 1 would have accepted are swept, and the accepted count is
    // asserted so a filter that matched nothing could not report a pass.
    let sweptRooms = 0;

    fc.assert(
      fc.property(APPROVED_L_ROOM, (room: DesignRoom) => {
        fc.pre(isBuildableRoom(room));
        sweptRooms += 1;
        expect(stepOneStateFor(room)).toMatchObject({
          substate: "1D",
          room,
          markedFields: [],
        });
      }),
      { numRuns: SWEEP_RUNS },
    );

    expect(sweptRooms).toBeGreaterThan(SWEEP_RUNS / 2);
  });

  it("carries the room and nothing else — no document, locale or revision", () => {
    fc.assert(
      fc.property(APPROVED_L_ROOM, (room: DesignRoom) => {
        const query = queryOf(room);

        expect([...query.keys()]).toEqual([
          "shape",
          "wallA",
          "wallB",
          "height",
          "direction",
        ]);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  // The sweep reaches these by chance; pinned here so the three-digit pad and the trailing-zero
  // strip are each exercised on a named value rather than on whatever the sampler happened to draw.
  it.each([
    [3000, "3"],
    [3600, "3.6"],
    [3660, "3.66"],
    [3060, "3.06"],
    [3006, "3.006"],
  ] as const)("spells %i mm as %s and reads it back", (widthMm, metres) => {
    const room: DesignRoom = {
      shape: "L",
      widthMm,
      depthMm: 2400,
      heightMm: 2600,
    };

    expect(queryOf(room).get("wallA")).toBe(metres);
    expect(stepOneStateFor(room)).toMatchObject({ substate: "1D", room });
  });

  // ADR 0129 D9, as a property over the whole sweep rather than on one hand-picked pair.
  it("emits direction=right for a right room and direction=left for an absent or left one", () => {
    fc.assert(
      fc.property(APPROVED_L_ROOM, (room: DesignRoom) => {
        const expected = room.cornerDirection === "right" ? "right" : "left";

        expect(queryOf(room).get("direction")).toBe(expected);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("spells every length as a plain metre decimal", () => {
    fc.assert(
      fc.property(APPROVED_L_ROOM, (room: DesignRoom) => {
        const query = queryOf(room);

        for (const field of ["wallA", "wallB", "height"]) {
          expect(query.get(field)).toMatch(/^\d+(?:\.\d{1,3})?$/);
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });
});

describe("the editor's back link, on a room the policy would refuse", () => {
  // A row stored before wave 7E2 carries the seed's room, and the schema bounds a room far wider
  // than the owner-approved policy does. The back link must still hand the customer a working
  // Step 1 with the offending field marked, never a crash and never a malformed number.
  it.each([
    ["a wall A past the approved maximum", 6400, 2400, 2600, "wallA"],
    ["a wall B under the approved minimum", 3600, 900, 2600, "wallB"],
    ["a ceiling under the approved minimum", 3600, 2400, 2000, "height"],
  ] as const)("marks %s", (_name, widthMm, depthMm, heightMm, field) => {
    const state = stepOneStateFor({ shape: "L", widthMm, depthMm, heightMm });

    expect(state.substate).toBe("1C");
    expect(state.markedFields).toContain(field);
  });

  it("never emits a length the parser cannot read back", () => {
    fc.assert(
      fc.property(
        fc.record({
          shape: fc.constant<"L">("L"),
          widthMm: fc.integer({ min: 1, max: 20_000 }),
          depthMm: fc.integer({ min: 1, max: 20_000 }),
          heightMm: fc.integer({ min: 1, max: 20_000 }),
        }),
        (room: DesignRoom) => {
          const state = stepOneStateFor(room);

          // 1B is the sub-state a length the parser refused lands on, so reaching it would mean
          // the href spelled a room the form cannot read back.
          expect(state.substate).not.toBe("1B");
          expect(state.substate).not.toBe("1A");
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });
});

function isBuildableRoom(room: DesignRoom): boolean {
  return validateRoomInput(
    {
      shape: "L",
      wallAMm: room.widthMm,
      wallBMm: room.depthMm,
      heightMm: room.heightMm,
      cornerDirection: "left",
    },
    APPROVED_ROOM_POLICY,
  ).ok;
}

function queryOf(room: DesignRoom): URLSearchParams {
  return new URL(roomHrefFromDesignRoom(room), "https://lemnaria.test")
    .searchParams;
}

function stepOneStateFor(
  room: DesignRoom,
): ReturnType<typeof parseRoomUrlState> {
  return parseRoomUrlState(asNextSearchParams(queryOf(room)));
}

function asNextSearchParams(params: URLSearchParams): RoomSearchParams {
  return Object.fromEntries(params.entries());
}
