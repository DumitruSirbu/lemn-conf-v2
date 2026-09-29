// **Adversarial QA for M7 wave 7F2, slice S4 — the linear suggestion's switch is the domain's**
// (criterion 10, section 8). Under the approved policy the domain refuses every straight room
// (`validate-room.ts:79`), so the suggestion's positive arm cannot be reached by any policy today, and
// a gate stuck at `false` would be invisible until wave 7J. Here the domain is made to accept a
// straight room — and nothing else is changed — so the arm runs now:
//
// - the suggestion shows exactly when 1C has a reason **and** the same entry validates as a straight
//   room on wall A, and the question is put to the domain with that entry;
// - it follows the reasons it is appended to through a burst (`stillShowing`), and is never shown at
//   1B or 1D.
//
// The L judgement is the real domain's: only a `shape: "linear"` entry is answered by the double.
import {
  APPROVED_ROOM_POLICY,
  type RoomInput,
} from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const straightRooms = vi.hoisted(() => ({
  isAccepted: true,
  asked: [] as unknown[],
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    validateRoomInput: (input: RoomInput, policy: unknown) => {
      if (input.shape !== "linear")
        return actual.validateRoomInput(input, policy as never);
      straightRooms.asked.push(input);
      return straightRooms.isAccepted
        ? { ok: true, room: {} }
        : actual.validateRoomInput(input, policy as never);
    },
  };
});

import { draftStateOf, presentOneC } from "@/room/one-c-surfaces";
import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { deriveRoomIssueView } from "@/room/room-issue-model";

function lRoom(wallA: string, wallB: string, height: string): RoomDraft {
  const typed: readonly (readonly [RoomLengthField, string])[] = [
    ["wallA", wallA],
    ["wallB", wallB],
    ["height", height],
  ];
  return typed.reduce(
    (draft, [field, text]) => withEnteredText(draft, { field, text }),
    createRoomDraft("L"),
  );
}

function isSuggestedFor(draft: RoomDraft): boolean {
  return deriveRoomIssueView({
    draft,
    draftState: draftStateOf(draft, APPROVED_ROOM_POLICY),
    policy: APPROVED_ROOM_POLICY,
  }).isLinearSuggested;
}

beforeEach(() => {
  straightRooms.isAccepted = true;
  straightRooms.asked = [];
});

describe("the suggestion's positive arm, with the domain accepting a straight room (7J's handover)", () => {
  it("shows for an L refused on a field, and asks the domain about wall A and the ceiling", () => {
    // 3600 x 450 x 2600: wall B too short.
    expect(isSuggestedFor(lRoom("3600", "450", "2600"))).toBe(true);
    expect(straightRooms.asked).toContainEqual({
      shape: "linear",
      wallAMm: 3600,
      heightMm: 2600,
    });
  });

  it("shows for an L too small for the kitchen, whose reason is the room's", () => {
    expect(isSuggestedFor(lRoom("900", "2160", "2200"))).toBe(true);
  });

  it("is not shown for a room the domain accepts, which has no reason to append it to", () => {
    expect(isSuggestedFor(lRoom("3600", "2400", "2600"))).toBe(false);
  });

  it("is not shown at 1B, where no field is judged", () => {
    expect(isSuggestedFor(lRoom("3600", "", "2600"))).toBe(false);
  });

  it("is not shown when the domain refuses the straight room too — the gate is the domain's answer", () => {
    straightRooms.isAccepted = false;

    // 7J S5: the double's fallback now reaches the real domain, which accepts a straight kitchen —
    // so wall A here must be outside its own approved range (1200–6000), not merely wall B's.
    expect(isSuggestedFor(lRoom("100", "450", "2600"))).toBe(false);
    expect(straightRooms.asked).not.toHaveLength(0);
  });
});

describe("the suggestion follows its reasons through a burst", () => {
  it("waits for the pause when the burst began on a room with no reason", () => {
    const valid = lRoom("3600", "2400", "2600");
    const refused = lRoom("3600", "450", "2600");

    const presented = presentOneC({
      draft: refused,
      draftState: draftStateOf(refused, APPROVED_ROOM_POLICY),
      policy: APPROVED_ROOM_POLICY,
      typing: {
        isTyping: true,
        draftBeforeTyping: valid,
        draftInBurst: refused,
      },
    });

    expect(presented.surfaces.isLinearSuggested).toBe(false);
  });

  it("stays through a keystroke that keeps a reason, when it was showing at the burst's start", () => {
    const before = lRoom("3600", "450", "2600");
    const now = lRoom("3600", "45", "2600");

    const presented = presentOneC({
      draft: now,
      draftState: draftStateOf(now, APPROVED_ROOM_POLICY),
      policy: APPROVED_ROOM_POLICY,
      typing: { isTyping: true, draftBeforeTyping: before, draftInBurst: now },
    });

    expect(presented.surfaces.isLinearSuggested).toBe(true);
  });

  it("never shows without a reason held: wall B from too short to too long mid-burst (review R1.1)", () => {
    // The burst began on 3600 x 450 (wall B too short, suggestion showing). Wall B is typed to 45 000:
    // now too long. The too-short reason is not held (a changed sentence waits for the pause), so no
    // reason is on screen — and a suggestion appended to nothing must not be either.
    const before = lRoom("3600", "450", "2600");
    const now = lRoom("3600", "45000", "2600");
    expect(isSuggestedFor(before)).toBe(true);
    expect(isSuggestedFor(now)).toBe(true);

    const presented = presentOneC({
      draft: now,
      draftState: draftStateOf(now, APPROVED_ROOM_POLICY),
      policy: APPROVED_ROOM_POLICY,
      typing: { isTyping: true, draftBeforeTyping: before, draftInBurst: now },
    });

    expect(presented.surfaces.fieldReasons).toEqual([]);
    expect(presented.surfaces.roomReasons).toEqual([]);
    expect(presented.surfaces.isLinearSuggested).toBe(false);
  });
});
