// **Adversarial QA for wave 6T2's host rule** — the four wrong readings ADR 0092 decision 10 names
// each have a falsifying case in `sink-accessories.test.ts`, and this file is the search for the
// readings it does *not* name.
//
// **The one that was missing: the same-wall test is only same-wall on wall A.** Every shipped
// fixture puts its sink on wall A, so `entry.wall === search.sink.wall` and a hard-coded
// `entry.wall === "A"` are indistinguishable — the mutant passed the whole domain suite. A sink on
// wall B under a wall-B cabinet is what separates them, and it is the first block below.
//
// The rest sweeps what discrete examples leave a gap between: the containment cases neither span
// includes the other's boundary, the whole overlap transition rather than its two endpoints, and the
// tie-break's **third** key — the placement id — which no shipped case reaches because `alongMm`
// decides first.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { DesignPlacement, DesignWall } from "../../src/design.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import {
  findSinkAccessories,
  type SinkAccessoryPositions,
} from "../../src/queries/sink-accessories.js";
import {
  designOf,
  PROJECTION_CATALOG as CATALOG,
} from "../support/display-projection.js";

function accessoriesOf(
  placements: readonly DesignPlacement[],
): readonly SinkAccessoryPositions[] {
  const entries = projectDesignForDisplay(
    designOf(placements),
    CATALOG,
  ).flatMap((group) => group.entries);
  return findSinkAccessories(entries, CATALOG);
}

/** The host the query resolved for the only sink in the fixture, or `undefined` where it resolved
 *  none. Throws for a fixture holding no sink at all, so a probe that silently stopped placing one
 *  fails loudly instead of reading as *no host*. */
function hostOfTheOnlySink(
  placements: readonly DesignPlacement[],
): string | undefined {
  const found = accessoriesOf(placements);
  if (found.length !== 1) {
    throw new Error(
      `fixture holds ${String(found.length)} sinks, not the one this asks about`,
    );
  }
  return found[0]?.rackHostPlacementId;
}

function placement(
  id: string,
  buildId: string,
  at: {
    readonly wall?: DesignWall;
    readonly alongMm: number;
    readonly y0Mm: number;
    readonly widthMm: number;
    readonly heightMm: number;
  },
): DesignPlacement {
  return {
    id,
    wall: at.wall ?? "A",
    alongMm: at.alongMm,
    y0Mm: at.y0Mm,
    body: { buildId, widthMm: at.widthMm, heightMm: at.heightMm },
  };
}

/** The same 900–1700 span every shipped fixture uses, so the arithmetic a reader carries between
 *  the two files is one span. */
const SINK_CENTRE_MM = 1_300;
const SINK_WIDTH_MM = 800;
const SINK_STARTS_MM = SINK_CENTRE_MM - SINK_WIDTH_MM / 2;
const SINK_ENDS_MM = SINK_CENTRE_MM + SINK_WIDTH_MM / 2;

const WALL_BAND_Y0_MM = 1_500;

function sinkOn(wall: DesignWall): DesignPlacement {
  return placement("sink", "base-sink-800", {
    wall,
    alongMm: SINK_CENTRE_MM,
    y0Mm: 0,
    widthMm: SINK_WIDTH_MM,
    heightMm: 820,
  });
}

/**
 * **The eighth wrong reading, and the one no shipped case falsifies: *the same wall* read as
 * *wall A*.**
 *
 * Every fixture in `sink-accessories.test.ts` — and the seeded design itself — stands its sink on
 * wall A, so replacing `entry.wall === search.sink.wall` with `entry.wall === "A"` changes no
 * answer any of them asks for. Verified by mutation: the substitution passes all 3 225 domain tests.
 *
 * The separating case is a sink on **wall B** with its cabinet on wall B: the right rule hangs the
 * rack, the hard-coded one answers no host.
 */
describe("the wall the host must share is the sink's, not the letter A", () => {
  /** Both walls, both ways round, as one statement: a host is resolved **exactly** when the two
   *  walls agree, and the rule reads the sink's wall rather than a letter. */
  it.each([
    ["A", "A", "host"],
    ["A", "B", undefined],
    ["B", "B", "host"],
    ["B", "A", undefined],
  ] as const)(
    "a sink on wall %s under a cabinet on wall %s resolves %s",
    (sinkWall, hostWall, expected) => {
      const host = placement("host", "wall-2door-800", {
        wall: hostWall,
        alongMm: SINK_CENTRE_MM,
        y0Mm: WALL_BAND_Y0_MM,
        widthMm: 800,
        heightMm: 700,
      });

      expect(hostOfTheOnlySink([sinkOn(sinkWall), host])).toBe(expected);
    },
  );
});

/**
 * **Containment, which is an overlap neither endpoint case reaches.**
 *
 * The shipped boundary cases both put the two spans end to end. Neither asks what happens when one
 * span swallows the other, and containment is where an overlap written as *"the candidate's start
 * lies inside the sink"* — a plausible way to write the same predicate — answers wrongly in one of
 * the two directions.
 */
describe("one span wholly inside the other is an overlap", () => {
  it("hangs the rack in a cabinet whose span contains the sink's entirely", () => {
    const swallowing = placement("wide", "wall-2door-800", {
      alongMm: SINK_CENTRE_MM,
      y0Mm: WALL_BAND_Y0_MM,
      widthMm: 1_200,
      heightMm: 700,
    });

    expect(hostOfTheOnlySink([sinkOn("A"), swallowing])).toBe("wide");
  });

  it("hangs the rack in a cabinet standing entirely inside the sink's span", () => {
    const swallowed = placement("narrow", "wall-1door-300", {
      alongMm: SINK_CENTRE_MM,
      y0Mm: WALL_BAND_Y0_MM,
      widthMm: 300,
      heightMm: 700,
    });

    expect(hostOfTheOnlySink([sinkOn("A"), swallowed])).toBe("narrow");
  });
});

/**
 * **The whole transition, not its two endpoints.**
 *
 * The four named points — touching at each end, and one millimetre in from each — are this block's
 * last case. A swept centre asserts the *shape*: a host exists for exactly the centres whose span strictly
 * overlaps the sink's, and for no others. A predicate off by a millimetre at one end only, or one
 * that admitted a candidate that has passed clean through, is a case in the range rather than a
 * point somebody thought to write down.
 */
describe("the overlap boundary, swept rather than sampled", () => {
  const HOST_WIDTH_MM = 600;
  /** The centre at which the candidate's right edge just touches the sink's left, and the one at
   *  which its left edge just touches the sink's right. Every centre strictly between the two
   *  overlaps; neither endpoint does. */
  const FIRST_TOUCHING_MM = SINK_STARTS_MM - HOST_WIDTH_MM / 2;
  const LAST_TOUCHING_MM = SINK_ENDS_MM + HOST_WIDTH_MM / 2;

  function hostAtCentre(alongMm: number): string | undefined {
    return hostOfTheOnlySink([
      sinkOn("A"),
      placement("candidate", "wall-2door-600", {
        alongMm,
        y0Mm: WALL_BAND_Y0_MM,
        widthMm: HOST_WIDTH_MM,
        heightMm: 700,
      }),
    ]);
  }

  propertyTest.prop([
    fc.integer({
      min: FIRST_TOUCHING_MM - 200,
      max: LAST_TOUCHING_MM + 200,
    }),
  ])(
    "resolves a host for exactly the centres that strictly overlap",
    (alongMm) => {
      const strictlyOverlaps =
        alongMm > FIRST_TOUCHING_MM && alongMm < LAST_TOUCHING_MM;

      expect(hostAtCentre(alongMm)).toBe(
        strictlyOverlaps ? "candidate" : undefined,
      );
    },
  );

  /** The two transitions themselves, named so a failure says which end moved. Touching is not
   *  overlapping: on the seeded design `p12` (`open-shelf-600`) begins at exactly 1700, where the sink
   *  ends, and counting it would tie it with `p11` at the same `y0`. */
  it("flips at each end between touching and overlapping by one millimetre", () => {
    expect(hostAtCentre(FIRST_TOUCHING_MM)).toBeUndefined();
    expect(hostAtCentre(FIRST_TOUCHING_MM + 1)).toBe("candidate");
    expect(hostAtCentre(LAST_TOUCHING_MM)).toBeUndefined();
    expect(hostAtCentre(LAST_TOUCHING_MM - 1)).toBe("candidate");
  });
});

/**
 * **The tie-break's third key, which no shipped case reaches.**
 *
 * `sink-accessories.test.ts` ties two candidates on `y0Mm` and on overlap and lets the projection
 * decide — but the projection decides on `alongMm`, its fourth key, and stops there. Two candidates
 * at one `y0`, one `alongMm` and one width tie on **every** key the projection has except its last,
 * the placement id. That is the only case in which the id is load-bearing, and it is what says the
 * answer is a function of the document rather than of the array it was serialised in.
 */
describe("two candidates identical in every key but their id", () => {
  function twin(id: string): DesignPlacement {
    return placement(id, "wall-2door-800", {
      alongMm: SINK_CENTRE_MM,
      y0Mm: WALL_BAND_Y0_MM,
      widthMm: 800,
      heightMm: 700,
    });
  }

  /** The same answer over every permutation of the whole document, so the claim is *"never the
   *  array's order"* rather than *"not these two orders"*. */
  propertyTest.prop([
    fc.shuffledSubarray([sinkOn("A"), twin("aaa-twin"), twin("zzz-twin")], {
      minLength: 3,
    }),
  ])("answers the same host however the document is ordered", (shuffled) => {
    expect(hostOfTheOnlySink(shuffled)).toBe("aaa-twin");
  });
});

/**
 * **The keys are ordered, and `y0Mm` outranks the overlap.**
 *
 * A rule that ranked on overlap first and broke *its* ties by height would agree with the shipped
 * one on every fixture in `sink-accessories.test.ts`, because none of them makes the two keys
 * disagree. This one does: the lower cabinet overlaps the sink by less.
 */
describe("the lowest wins even when a higher cabinet overlaps by more", () => {
  it("prefers the narrow low cabinet over the wide high one", () => {
    const lowAndNarrow = placement("low", "wall-1door-300", {
      alongMm: SINK_CENTRE_MM,
      y0Mm: WALL_BAND_Y0_MM,
      widthMm: 300,
      heightMm: 700,
    });
    const highAndWide = placement("high", "wall-2door-800", {
      alongMm: SINK_CENTRE_MM,
      y0Mm: 2_200,
      widthMm: 800,
      heightMm: 400,
    });

    expect(hostOfTheOnlySink([sinkOn("A"), lowAndNarrow, highAndWide])).toBe(
      "low",
    );
  });
});
