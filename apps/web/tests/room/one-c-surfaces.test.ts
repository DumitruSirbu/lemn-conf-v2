// Wave 7F2 S3, review finding R1.1: **mid-burst, a surface stays only if the same sentence was showing
// when the burst began.** `stillShowing` is pure, so the rule is asserted here over plain issue views,
// built by the real issue model from real drafts — no screen and no clock.
import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  draftStateOf,
  presentOneC,
  stillShowing,
  type TypingState,
} from "@/room/one-c-surfaces";
import {
  createRoomDraft,
  withEnteredText,
  withRoomShape,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  type RoomIssueView,
} from "@/room/room-issue-model";

/** An L of the given millimetres, typed as the customer types them. */
function lRoom(wallA: string, wallB = "2400", height = "2600"): RoomDraft {
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

function viewOf(draft: RoomDraft): RoomIssueView {
  return deriveRoomIssueView({
    draft,
    draftState: draftStateOf(draft, APPROVED_ROOM_POLICY),
    policy: APPROVED_ROOM_POLICY,
  });
}

function typingFrom(before: RoomDraft, now: RoomDraft): TypingState {
  return { isTyping: true, draftBeforeTyping: before, draftInBurst: now };
}

describe("a reason survives a burst only as the same sentence (R1.1)", () => {
  it("withholds wall A's too-short reason and mark when the burst began on its too-long one", () => {
    const tooLong = viewOf(lRoom("6500"));
    const tooShort = viewOf(lRoom("650"));
    expect(tooLong.fieldReasons.map((reason) => reason.messageKey)).toEqual([
      "room.issue.wallTooLong",
    ]);
    expect(tooShort.fieldReasons.map((reason) => reason.messageKey)).toEqual([
      "room.issue.wallTooShort",
    ]);

    const shown = stillShowing(tooShort, tooLong);

    expect(shown.fieldReasons).toEqual([]);
    expect(shown.markedWalls).toEqual([]);
    expect(shown.isNoteShown).toBe(true);
  });

  it("keeps the same reason and the same mark through a keystroke that does not fix it", () => {
    const before = viewOf(lRoom("650"));
    const now = viewOf(lRoom("65"));

    const shown = stillShowing(now, before);

    expect(shown.fieldReasons).toEqual(now.fieldReasons);
    expect(shown.markedWalls).toEqual(now.markedWalls);
  });

  it("keeps a reason on another field while this field's sentence changes", () => {
    const before = viewOf(lRoom("6500", "2400", "2000"));
    const now = viewOf(lRoom("650", "2400", "2000"));

    const shown = stillShowing(now, before);

    expect(shown.fieldReasons.map((reason) => reason.field)).toEqual([
      "height",
    ]);
  });
});

describe("presentOneC applies the rule to the draft a burst began from", () => {
  it("shows nothing of wall A mid-burst from 6500 to 650, and all of it once paused", () => {
    const before = lRoom("6500");
    const now = lRoom("650");
    const inputs = {
      draft: now,
      draftState: draftStateOf(now, APPROVED_ROOM_POLICY),
      policy: APPROVED_ROOM_POLICY,
    };

    const midBurst = presentOneC({
      ...inputs,
      typing: typingFrom(before, now),
    });
    const paused = presentOneC({ ...inputs, typing: { isTyping: false } });

    expect(midBurst.surfaces.fieldReasons).toEqual([]);
    expect(paused.surfaces.fieldReasons.map((reason) => reason.field)).toEqual([
      "wallA",
    ]);
    expect(midBurst.isContinueActive).toBe(false);
    expect(paused.isContinueActive).toBe(false);
  });
});

describe("the shape refusal answers the chip, not the clock (7F2 S4)", () => {
  function midBurst(before: RoomDraft, now: RoomDraft) {
    return presentOneC({
      draft: now,
      draftState: draftStateOf(now, APPROVED_ROOM_POLICY),
      policy: APPROVED_ROOM_POLICY,
      typing: typingFrom(before, now),
    }).surfaces;
  }

  it("shows the moment a refused chip is chosen mid-burst", () => {
    const typed = lRoom("36");

    const shown = midBurst(typed, withRoomShape(typed, "U"));

    expect(shown.isShapeRefused).toBe(true);
  });

  it("goes the moment the L chip is chosen mid-burst", () => {
    const typed = withRoomShape(lRoom("36"), "U");

    const shown = midBurst(typed, withRoomShape(typed, "L"));

    expect(shown.isShapeRefused).toBe(false);
  });
});

describe("the linear suggestion shows only beside a reason still showing (7F2 S4, review R1.1)", () => {
  /** A view the domain would give once wave 7J makes a straight room validate: until then
   *  `validateRoomInput` refuses every non-L room, so the suggestion is forced on here, over the
   *  real model's reasons, rather than reached through a stubbed domain. */
  function suggesting(view: RoomIssueView): RoomIssueView {
    return { ...view, isLinearSuggested: true };
  }

  it("goes mid-burst when wall B turns from too short to too long, holding no reason", () => {
    const tooShort = suggesting(viewOf(lRoom("3600", "450")));
    const tooLong = suggesting(viewOf(lRoom("3600", "45000")));
    expect(tooShort.fieldReasons.map((reason) => reason.messageKey)).toEqual([
      "room.issue.wallTooShort",
    ]);
    expect(tooLong.fieldReasons.map((reason) => reason.messageKey)).toEqual([
      "room.issue.wallTooLong",
    ]);

    const shown = stillShowing(tooLong, tooShort);

    expect(shown.fieldReasons).toEqual([]);
    expect(shown.isLinearSuggested).toBe(false);
  });

  it("stays mid-burst beside a reason the keystroke does not change", () => {
    const before = suggesting(viewOf(lRoom("3600", "450")));
    const now = suggesting(viewOf(lRoom("3600", "45")));

    const shown = stillShowing(now, before);

    expect(shown.fieldReasons).toHaveLength(1);
    expect(shown.isLinearSuggested).toBe(true);
  });
});
