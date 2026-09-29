// M7B wave U4 fix, F1 (ADR 0132 Amendment A3; AC4 (a)): an L's and a straight room's presets are
// **byte-identical** to what they were before the U overview moved.
//
// The triples below were recorded from `cameraPresetsForRoom` at `ab6d285` (the U4 fix's base),
// before the U overview's direction was turned, and are compared with `toEqual`, so every last digit
// counts. They cover the seeded room, the L policy box's eight corners, a right-hand L and two
// straight rooms — the rooms `stage.test.ts` samples, plus the mirror.
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { cameraPresetsForRoom } from "../src/stage.js";

interface RecordedPreset {
  readonly id: string;
  readonly position: readonly number[];
  readonly target: readonly number[];
}

const RECORDED_AT_BASE: readonly {
  readonly name: string;
  readonly room: DesignRoom;
  readonly presets: readonly RecordedPreset[];
}[] = [
  {
    name: "L 900 x 1000 x 2200",
    room: { shape: "L", widthMm: 900, depthMm: 1000, heightMm: 2200 },
    presets: [
      {
        id: "overview",
        position: [2.5450730168116054, 2.5803223991626476, 3.9529907128932016],
        target: [0.45, 1.3, 0.5],
      },
      {
        id: "wallA",
        position: [0.6127038870031388, 1.9101395762617706, 4.189625090330824],
        target: [0.45, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 0.965738025624201],
        target: [0, 1.3, 0.5],
      },
    ],
  },
  {
    name: "L 900 x 1000 x 3900",
    room: { shape: "L", widthMm: 900, depthMm: 1000, heightMm: 3900 },
    presets: [
      {
        id: "overview",
        position: [2.5450730168116054, 2.5803223991626476, 3.9529907128932016],
        target: [0.45, 1.3, 0.5],
      },
      {
        id: "wallA",
        position: [0.6127038870031388, 1.9101395762617706, 4.189625090330824],
        target: [0.45, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 0.965738025624201],
        target: [0, 1.3, 0.5],
      },
    ],
  },
  {
    name: "L 900 x 6000 x 2200",
    room: { shape: "L", widthMm: 900, depthMm: 6000, heightMm: 2200 },
    presets: [
      {
        id: "overview",
        position: [2.5450730168116054, 2.5803223991626476, 6.452990712893202],
        target: [0.45, 1.3, 3],
      },
      {
        id: "wallA",
        position: [0.6127038870031388, 1.9101395762617706, 4.189625090330824],
        target: [0.45, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 3.465738025624201],
        target: [0, 1.3, 3],
      },
    ],
  },
  {
    name: "L 900 x 6000 x 3900",
    room: { shape: "L", widthMm: 900, depthMm: 6000, heightMm: 3900 },
    presets: [
      {
        id: "overview",
        position: [2.5450730168116054, 2.5803223991626476, 6.452990712893202],
        target: [0.45, 1.3, 3],
      },
      {
        id: "wallA",
        position: [0.6127038870031388, 1.9101395762617706, 4.189625090330824],
        target: [0.45, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 3.465738025624201],
        target: [0, 1.3, 3],
      },
    ],
  },
  {
    name: "L 6000 x 1000 x 2200",
    room: { shape: "L", widthMm: 6000, depthMm: 1000, heightMm: 2200 },
    presets: [
      {
        id: "overview",
        position: [5.095073016811606, 2.5803223991626476, 3.9529907128932016],
        target: [3, 1.3, 0.5],
      },
      {
        id: "wallA",
        position: [3.162703887003139, 1.9101395762617706, 4.189625090330824],
        target: [3, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 0.965738025624201],
        target: [0, 1.3, 0.5],
      },
    ],
  },
  {
    name: "L 6000 x 1000 x 3900",
    room: { shape: "L", widthMm: 6000, depthMm: 1000, heightMm: 3900 },
    presets: [
      {
        id: "overview",
        position: [5.095073016811606, 2.5803223991626476, 3.9529907128932016],
        target: [3, 1.3, 0.5],
      },
      {
        id: "wallA",
        position: [3.162703887003139, 1.9101395762617706, 4.189625090330824],
        target: [3, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 0.965738025624201],
        target: [0, 1.3, 0.5],
      },
    ],
  },
  {
    name: "L 6000 x 6000 x 2200",
    room: { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2200 },
    presets: [
      {
        id: "overview",
        position: [5.095073016811606, 2.5803223991626476, 6.452990712893202],
        target: [3, 1.3, 3],
      },
      {
        id: "wallA",
        position: [3.162703887003139, 1.9101395762617706, 4.189625090330824],
        target: [3, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 3.465738025624201],
        target: [0, 1.3, 3],
      },
    ],
  },
  {
    name: "L 6000 x 6000 x 3900",
    room: { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 3900 },
    presets: [
      {
        id: "overview",
        position: [5.095073016811606, 2.5803223991626476, 6.452990712893202],
        target: [3, 1.3, 3],
      },
      {
        id: "wallA",
        position: [3.162703887003139, 1.9101395762617706, 4.189625090330824],
        target: [3, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 3.465738025624201],
        target: [0, 1.3, 3],
      },
    ],
  },
  {
    name: "L seeded 3560 x 2920 x 2600",
    room: { shape: "L", widthMm: 3560, depthMm: 2920, heightMm: 2600 },
    presets: [
      {
        id: "overview",
        position: [3.875073016811605, 2.5803223991626476, 4.912990712893201],
        target: [1.78, 1.3, 1.46],
      },
      {
        id: "wallA",
        position: [1.9427038870031388, 1.9101395762617706, 4.189625090330824],
        target: [1.78, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 1.925738025624201],
        target: [0, 1.3, 1.46],
      },
    ],
  },
  {
    name: "L 3700 x 3400 x 2600",
    room: { shape: "L", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    presets: [
      {
        id: "overview",
        position: [3.9450730168116053, 2.5803223991626476, 5.152990712893201],
        target: [1.85, 1.3, 1.7],
      },
      {
        id: "wallA",
        position: [2.012703887003139, 1.9101395762617706, 4.189625090330824],
        target: [1.85, 1.3, 0],
      },
      {
        id: "wallB",
        position: [4.149302410106519, 2.019776948691947, 2.1657380256242007],
        target: [0, 1.3, 1.7],
      },
    ],
  },
  {
    name: "L right-hand 3700 x 3400 x 2600",
    room: {
      shape: "L",
      widthMm: 3700,
      depthMm: 3400,
      heightMm: 2600,
      cornerDirection: "right",
    },
    presets: [
      {
        id: "overview",
        position: [-3.9450730168116053, 2.5803223991626476, 5.152990712893201],
        target: [-1.85, 1.3, 1.7],
      },
      {
        id: "wallA",
        position: [-2.012703887003139, 1.9101395762617706, 4.189625090330824],
        target: [-1.85, 1.3, 0],
      },
      {
        id: "wallB",
        position: [-4.149302410106519, 2.019776948691947, 2.1657380256242007],
        target: [-0, 1.3, 1.7],
      },
    ],
  },
  {
    name: "straight 3700 x 3400 x 2600",
    room: { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    presets: [
      {
        id: "overview",
        position: [3.9450730168116053, 2.5803223991626476, 5.152990712893201],
        target: [1.85, 1.3, 1.7],
      },
      {
        id: "wallA",
        position: [2.012703887003139, 1.9101395762617706, 4.189625090330824],
        target: [1.85, 1.3, 0],
      },
    ],
  },
  {
    name: "straight 6000 x 1000 x 3900",
    room: { shape: "linear", widthMm: 6000, depthMm: 1000, heightMm: 3900 },
    presets: [
      {
        id: "overview",
        position: [5.095073016811606, 2.5803223991626476, 3.9529907128932016],
        target: [3, 1.3, 0.5],
      },
      {
        id: "wallA",
        position: [3.162703887003139, 1.9101395762617706, 4.189625090330824],
        target: [3, 1.3, 0],
      },
    ],
  },
];

describe("an L's and a straight room's presets are byte-identical to the U4 fix's base", () => {
  it.each(RECORDED_AT_BASE)("$name", ({ room, presets }) => {
    const now = cameraPresetsForRoom(room).map((preset) => ({
      id: preset.id,
      position: [...preset.position],
      target: [...preset.target],
    }));

    expect(now).toEqual(presets);
  });
});
