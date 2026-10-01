// M7B U5 S1, acceptance criterion 3 (backlog 76): which walls a shape has is one fact, the domain's
// `wallsOf`, and the form's field list and the plan's drawn walls both read it.
//
// `requiredFieldsFor` and the plan preview's walls used to be two hand-written enumerations of the
// same fact with nothing to fail when a shape was added to one and not the other. Now both derive from
// `wallsOf`, and this file is what fails if either stops: it walks **every shape the type names** —
// `EVERY_SHAPE` is a `Record<RoomShape, …>`, so a fourth shape is a compile error here before it is a
// test that never ran — and checks the form's fields, the plan's walls and the parser's marked
// fields against the domain's answer, each independently of the others.
import { wallsOf, type RoomShape } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { derivePlanPreview } from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withStoredLength,
  type RoomDraft,
} from "@/room/room-draft";
import { parseRoomUrlState, requiredFieldsFor } from "@/room/room-url-state";

const EVERY_SHAPE = {
  linear: true,
  L: true,
  U: true,
} as const satisfies Readonly<Record<RoomShape, true>>;

const SHAPES = Object.keys(EVERY_SHAPE) as readonly RoomShape[];

const PLAN_BOX = { widthPx: 318, heightPx: 102 };

/** Every length typed, whichever the shape asks for, so which walls are drawn is the shape's alone. */
function draftWithEveryLength(shape: RoomShape): RoomDraft {
  return (["wallA", "wallB", "wallC", "height"] as const).reduce<RoomDraft>(
    (draft, field) =>
      withStoredLength(draft, {
        field,
        millimetres: 2400 + 100 * field.length,
      }),
    createRoomDraft(shape),
  );
}

describe.each(SHAPES)("%s: one enumeration of its walls", (shape) => {
  const walls = wallsOf(shape);

  it("has at least wall A, so the tests below are not vacuous", () => {
    expect(walls).toContain("A");
  });

  it("is entered in one field per wall the domain gives it, then the height", () => {
    expect(requiredFieldsFor(shape)).toEqual([
      ...walls.map((wall) => `wall${wall}`),
      "height",
    ]);
  });

  it("is drawn as exactly the walls the domain gives it, though every length is typed", () => {
    const plan = derivePlanPreview(draftWithEveryLength(shape), PLAN_BOX);

    expect(plan.kind).toBe("drawn");
    if (plan.kind !== "drawn") return;
    expect(plan.walls.map((wall) => wall.wall)).toEqual([...walls]);
  });

  it("is asked, at 1B, for exactly the fields the domain's walls name", () => {
    const state = parseRoomUrlState({ shape });

    expect(state.substate).toBe("1B");
    if (state.substate !== "1B") return;
    const asked = state.markedFields.filter((field) => field !== "direction");
    expect(asked).toEqual([...requiredFieldsFor(shape)]);
  });
});

describe("the enumeration is the domain's, not a copy the web keeps", () => {
  it("has a shape with more walls than another, so the walls really do differ by shape", () => {
    const counts = SHAPES.map((shape) => wallsOf(shape).length);

    expect(new Set(counts).size).toBe(SHAPES.length);
  });
});
