// ADR 0132 decision 5 (M7B plan D7): which walls a shape has, as one domain fact.
import { describe, expect, it } from "vitest";

import type { DesignRoomShape } from "../../src/design.js";
import { wallsOf } from "../../src/room/walls-of-shape.js";

describe("wallsOf", () => {
  it.each([
    ["linear", ["A"]],
    ["L", ["A", "B"]],
    ["U", ["A", "B", "C"]],
  ] satisfies readonly [DesignRoomShape, readonly string[]][])(
    "answers %s's walls in reading order from the A∩B corner",
    (shape, expected) => {
      expect(wallsOf(shape)).toEqual(expected);
    },
  );
});
