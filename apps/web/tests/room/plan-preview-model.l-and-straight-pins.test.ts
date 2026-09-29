// M7B U5 S1, acceptance criterion 7's unit half: the L and the straight room are drawn exactly as they
// were before this slice touched the plan preview.
//
// **Each expected plan is a literal, captured from `plan-preview-model.ts` at `664eee6`** — the module
// as it stood before U5 S1 — by running that module over these drafts and pasting what it drew. It is
// not derived from the code under test, so a change to how an L or a straight room is placed (the
// slice moved a U's mirroring and its facing labels, and rewired which walls a shape has) fails here
// instead of agreeing with itself. The phone's own box and metric set and the desktop panel's are
// both pinned. AC7's visual re-run (7L S6's byte-identical mobile control) belongs to the visual
// reviewer; this is the guard that can run on every commit.
import { describe, expect, it } from "vitest";

import { derivePlanPreview } from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

const METRICS = {
  "the phone": { wallThicknessPx: 12, labelLinePx: 11, labelGapPx: 5 },
  "the desktop panel": { wallThicknessPx: 26, labelLinePx: 14, labelGapPx: 20 },
} as const;

const BOXES = {
  "the phone": { widthPx: 318, heightPx: 102 },
  "the desktop panel": { widthPx: 570, heightPx: 400 },
} as const;

function draftFor(
  shape: "L" | "linear",
  lengths: readonly (readonly [RoomLengthField, number])[],
  direction: "left" | "right",
): RoomDraft {
  const typed = lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

interface Pin {
  readonly name: string;
  readonly shape: "L" | "linear";
  readonly lengths: readonly (readonly [RoomLengthField, number])[];
  readonly direction: "left" | "right";
  readonly set: keyof typeof METRICS;
  readonly plan: unknown;
}

const PINS: readonly Pin[] = [
  {
    name: "an L turning left, 3600 x 2400, on the phone",
    shape: "L",
    lengths: [
      ["wallA", 3600],
      ["wallB", 2400],
      ["height", 2600],
    ],
    direction: "left",
    set: "the phone",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 318,
        heightPx: 102,
      },
      scalePxPerMm: 0.030833333333333334,
      contentPx: {
        widthPx: 111,
        heightPx: 86,
      },
      cornerPx: {
        xPx: 103.5,
        yPx: 16,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 3600,
          xPx: 103.5,
          yPx: 16,
          widthPx: 111,
          heightPx: 12,
          labelPx: {
            xPx: 159,
            topPx: 0,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 2400,
          xPx: 103.5,
          yPx: 28,
          widthPx: 12,
          heightPx: 74,
          labelPx: {
            xPx: 120.5,
            topPx: 59.5,
            alignment: "leftAligned",
          },
        },
      ],
    },
  },
  {
    name: "an L turning right, 6000 x 1000, on the phone",
    shape: "L",
    lengths: [
      ["wallA", 6000],
      ["wallB", 1000],
      ["height", 2600],
    ],
    direction: "right",
    set: "the phone",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 318,
        heightPx: 102,
      },
      scalePxPerMm: 0.053,
      contentPx: {
        widthPx: 318,
        heightPx: 65,
      },
      cornerPx: {
        xPx: 318,
        yPx: 26.5,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 6000,
          xPx: 0,
          yPx: 26.5,
          widthPx: 318,
          heightPx: 12,
          labelPx: {
            xPx: 159,
            topPx: 10.5,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 1000,
          xPx: 306,
          yPx: 38.5,
          widthPx: 12,
          heightPx: 53,
          labelPx: {
            xPx: 301,
            topPx: 59.5,
            alignment: "rightAligned",
          },
        },
      ],
    },
  },
  {
    name: "a deep L turning left, 2100 x 6000, on the phone",
    shape: "L",
    lengths: [
      ["wallA", 2100],
      ["wallB", 6000],
      ["height", 2600],
    ],
    direction: "left",
    set: "the phone",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 318,
        heightPx: 102,
      },
      scalePxPerMm: 0.012333333333333333,
      contentPx: {
        widthPx: 25.9,
        heightPx: 86,
      },
      cornerPx: {
        xPx: 146.05,
        yPx: 16,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 2100,
          xPx: 146.05,
          yPx: 16,
          widthPx: 25.9,
          heightPx: 12,
          labelPx: {
            xPx: 159,
            topPx: 0,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 6000,
          xPx: 146.05,
          yPx: 28,
          widthPx: 12,
          heightPx: 74,
          labelPx: {
            xPx: 163.05,
            topPx: 59.5,
            alignment: "leftAligned",
          },
        },
      ],
    },
  },
  {
    name: "a straight room of 3600, said left, on the phone",
    shape: "linear",
    lengths: [
      ["wallA", 3600],
      ["height", 2600],
    ],
    direction: "left",
    set: "the phone",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 318,
        heightPx: 102,
      },
      scalePxPerMm: 0.08833333333333333,
      contentPx: {
        widthPx: 318,
        heightPx: 12,
      },
      cornerPx: {
        xPx: 0,
        yPx: 53,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 3600,
          xPx: 0,
          yPx: 53,
          widthPx: 318,
          heightPx: 12,
          labelPx: {
            xPx: 159,
            topPx: 37,
            alignment: "centred",
          },
        },
      ],
    },
  },
  {
    name: "a straight room of 6000, said right, on the phone",
    shape: "linear",
    lengths: [
      ["wallA", 6000],
      ["height", 2600],
    ],
    direction: "right",
    set: "the phone",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 318,
        heightPx: 102,
      },
      scalePxPerMm: 0.053,
      contentPx: {
        widthPx: 318,
        heightPx: 12,
      },
      cornerPx: {
        xPx: 318,
        yPx: 53,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 6000,
          xPx: 0,
          yPx: 53,
          widthPx: 318,
          heightPx: 12,
          labelPx: {
            xPx: 159,
            topPx: 37,
            alignment: "centred",
          },
        },
      ],
    },
  },
  {
    name: "an L turning left, 3600 x 2400, on the desktop panel",
    shape: "L",
    lengths: [
      ["wallA", 3600],
      ["wallB", 2400],
      ["height", 2600],
    ],
    direction: "left",
    set: "the desktop panel",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 570,
        heightPx: 400,
      },
      scalePxPerMm: 0.14166666666666666,
      contentPx: {
        widthPx: 510,
        heightPx: 366,
      },
      cornerPx: {
        xPx: 30,
        yPx: 34,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 3600,
          xPx: 30,
          yPx: 34,
          widthPx: 510,
          heightPx: 26,
          labelPx: {
            xPx: 285,
            topPx: 0,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 2400,
          xPx: 30,
          yPx: 60,
          widthPx: 26,
          heightPx: 340,
          labelPx: {
            xPx: 76,
            topPx: 223,
            alignment: "leftAligned",
          },
        },
      ],
    },
  },
  {
    name: "an L turning right, 6000 x 1000, on the desktop panel",
    shape: "L",
    lengths: [
      ["wallA", 6000],
      ["wallB", 1000],
      ["height", 2600],
    ],
    direction: "right",
    set: "the desktop panel",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 570,
        heightPx: 400,
      },
      scalePxPerMm: 0.095,
      contentPx: {
        widthPx: 570,
        heightPx: 121,
      },
      cornerPx: {
        xPx: 570,
        yPx: 156.5,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 6000,
          xPx: 0,
          yPx: 156.5,
          widthPx: 570,
          heightPx: 26,
          labelPx: {
            xPx: 285,
            topPx: 122.5,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 1000,
          xPx: 544,
          yPx: 182.5,
          widthPx: 26,
          heightPx: 95,
          labelPx: {
            xPx: 524,
            topPx: 223,
            alignment: "rightAligned",
          },
        },
      ],
    },
  },
  {
    name: "a deep L turning left, 2100 x 6000, on the desktop panel",
    shape: "L",
    lengths: [
      ["wallA", 2100],
      ["wallB", 6000],
      ["height", 2600],
    ],
    direction: "left",
    set: "the desktop panel",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 570,
        heightPx: 400,
      },
      scalePxPerMm: 0.056666666666666664,
      contentPx: {
        widthPx: 119,
        heightPx: 366,
      },
      cornerPx: {
        xPx: 225.5,
        yPx: 34,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 2100,
          xPx: 225.5,
          yPx: 34,
          widthPx: 119,
          heightPx: 26,
          labelPx: {
            xPx: 285,
            topPx: 0,
            alignment: "centred",
          },
        },
        {
          wall: "B",
          lengthMm: 6000,
          xPx: 225.5,
          yPx: 60,
          widthPx: 26,
          heightPx: 340,
          labelPx: {
            xPx: 271.5,
            topPx: 223,
            alignment: "leftAligned",
          },
        },
      ],
    },
  },
  {
    name: "a straight room of 3600, said left, on the desktop panel",
    shape: "linear",
    lengths: [
      ["wallA", 3600],
      ["height", 2600],
    ],
    direction: "left",
    set: "the desktop panel",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 570,
        heightPx: 400,
      },
      scalePxPerMm: 0.15833333333333333,
      contentPx: {
        widthPx: 570,
        heightPx: 26,
      },
      cornerPx: {
        xPx: 0,
        yPx: 204,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 3600,
          xPx: 0,
          yPx: 204,
          widthPx: 570,
          heightPx: 26,
          labelPx: {
            xPx: 285,
            topPx: 170,
            alignment: "centred",
          },
        },
      ],
    },
  },
  {
    name: "a straight room of 6000, said right, on the desktop panel",
    shape: "linear",
    lengths: [
      ["wallA", 6000],
      ["height", 2600],
    ],
    direction: "right",
    set: "the desktop panel",
    plan: {
      kind: "drawn",
      boxPx: {
        widthPx: 570,
        heightPx: 400,
      },
      scalePxPerMm: 0.095,
      contentPx: {
        widthPx: 570,
        heightPx: 26,
      },
      cornerPx: {
        xPx: 570,
        yPx: 204,
      },
      walls: [
        {
          wall: "A",
          lengthMm: 6000,
          xPx: 0,
          yPx: 204,
          widthPx: 570,
          heightPx: 26,
          labelPx: {
            xPx: 285,
            topPx: 170,
            alignment: "centred",
          },
        },
      ],
    },
  },
];

describe("the L and the straight room are drawn as before U5 S1", () => {
  it.each(PINS)("draws $name exactly as pinned", (pin) => {
    const plan = derivePlanPreview(
      draftFor(pin.shape, pin.lengths, pin.direction),
      BOXES[pin.set],
      METRICS[pin.set],
    );

    expect(plan).toEqual(pin.plan);
  });
});
