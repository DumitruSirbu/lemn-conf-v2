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
    draftState: draftStateOf(draft),
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
      draftState: draftStateOf(now),
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
