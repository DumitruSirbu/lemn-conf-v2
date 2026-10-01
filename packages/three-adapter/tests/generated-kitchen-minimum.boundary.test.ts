// **The real probe agrees with the validator at the minimum** — M7 wave 7F4a, criterion 34.
//
// **The gap this closes, stated exactly.** `configurator-domain`'s
// `tests/room/minimum-kitchen.test.ts` already asserts `validation.ok === generated.ok` over the
// whole approved L rectangle — but it runs against `createFakeProbeFactory()`, and fit is judged on
// the **measured carcass** (`body-probe.ts:22-33`). So agreement is proven for a probe the product
// does not use. Wave 7F4a gives generation its first production caller, and that caller builds a
// **real Three.js kit**. This file is the same agreement asserted against that kit, at the boundary
// where a disagreement would live.
//
// `generated-kitchen.parity.test.ts` already generates with the real probe, which is why a gross
// disagreement would have been caught long ago — but it samples comfortable rooms, and the rooms that
// matter here are the three ADR 0108 Amendment E accepted **by one millimetre**.
//
// **A failure here is not a number to nudge.** If the real probe refuses a room the validator
// accepts, that is ADR 0110's to settle: no exception is added to the domain and no bound is moved to
// make this green. The assertion names both sides so a report can quote them.
import {
  APPROVED_ROOM_POLICY,
  createBodyProbeLease,
  generateKitchen,
  validateRoomInput,
  type BodyProbeFactory,
  type LRoomInput,
} from "@lemnaria/configurator-domain";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";

/** The ceiling ADR 0108 Amendment E's own boundary cases are stated at. */
const BOUNDARY_HEIGHT_MM = 2200;

/**
 * **The three rooms the amendment accepts at the matching one-millimetre boundary**, in
 * `minimum-kitchen.test.ts`'s own `wallA × wallB` order so the two files name the same rooms — plus
 * each one's `+1 mm` neighbours, which are the first rooms on the accepted side of each edge.
 */
const ACCEPTED_BOUNDARY_ROOMS: readonly (readonly [number, number])[] = [
  [900, 2200],
  [901, 2200],
  [900, 2201],
  [2100, 1000],
  [2101, 1000],
  [2100, 1001],
  [1500, 1600],
  [1501, 1600],
  [1500, 1601],
];

beforeAll(() => {
  installHeadlessDocument();
});

/** The room screen's own probe factory, in shape: a transient kit at the asked-for depth, measured in
 *  that kit's own room, released by the site that allocated it. */
function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function inputFor(wallAMm: number, wallBMm: number): LRoomInput {
  return {
    shape: "L",
    wallAMm,
    wallBMm,
    heightMm: BOUNDARY_HEIGHT_MM,
    cornerDirection: "left",
  };
}

describe("the real probe and the validator at the minimum boundary (criterion 34)", () => {
  it.each(ACCEPTED_BOUNDARY_ROOMS)(
    "composes %i x %i, which the validator accepts",
    (wallAMm, wallBMm) => {
      const validation = validateRoomInput(
        inputFor(wallAMm, wallBMm),
        APPROVED_ROOM_POLICY,
      );
      // The precondition, asserted rather than assumed: a room the validator had started refusing
      // would make the generation assertion below a claim about a different question.
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      const generated = generateKitchen({
        room: validation.room,
        occurredAt: OCCURRED_AT,
        probeAt: realProbeFactory(),
      });

      expect({
        validatorAccepts: validation.ok,
        generatorAccepts: generated.ok,
      }).toEqual({ validatorAccepts: true, generatorAccepts: true });
    },
  );

  it("places both required bodies in every one of those rooms", () => {
    const withoutBothRequired = ACCEPTED_BOUNDARY_ROOMS.filter(
      ([wallAMm, wallBMm]) => {
        const validation = validateRoomInput(
          inputFor(wallAMm, wallBMm),
          APPROVED_ROOM_POLICY,
        );
        if (!validation.ok) return true;
        const generated = generateKitchen({
          room: validation.room,
          occurredAt: OCCURRED_AT,
          probeAt: realProbeFactory(),
        });
        return !["sink", "hob"].every((role) =>
          generated.log.steps.some(
            (step) => step.role === role && step.status === "placed",
          ),
        );
      },
    );

    expect(withoutBothRequired).toEqual([]);
  });
});
