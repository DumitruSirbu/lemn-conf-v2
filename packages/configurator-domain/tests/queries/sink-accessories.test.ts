// Wave 6T2: where a kitchen's two sink extras go.
//
// ADR 0070 decision 4 states the rack's host in one sentence — *"the lowest wall-band cabinet whose
// along-wall extent overlaps the sink's span"* — and ADR 0092 decision 10 reads four things into it
// that the sentence does not say. **Each of the four wrong readings gets its own falsifying case
// here**, because three of them agree with the right answer on the seeded design and would ship
// green: the seeded kitchen alone is not a test of this rule, it is a coincidence that four rules
// pass.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import {
  findSinkAccessories,
  type SinkAccessoryPositions,
} from "../../src/queries/sink-accessories.js";
import { declaresASink } from "../../src/void-engine.js";
import {
  definitionOf,
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

function placement(
  id: string,
  buildId: string,
  at: {
    readonly wall?: "A" | "B";
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
    body: {
      buildId,
      widthMm: at.widthMm,
      heightMm: at.heightMm,
    },
  };
}

/** The seeded sink, spanning along-wall 900–1700 on wall A. Every fixture below places its own
 *  candidates over exactly this span, so the arithmetic a reader has to do is the same each time. */
const SINK = placement("sink", "base-sink-800", {
  alongMm: 1_300,
  y0Mm: 0,
  widthMm: 800,
  heightMm: 820,
});

const SINK_STARTS_MM = 900;
const SINK_ENDS_MM = 1_700;

describe("a sink is the declaration, and nothing else", () => {
  it("finds the seeded kitchen's one sink and no other body", () => {
    const found = findSinkAccessories(
      projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG).flatMap(
        (group) => group.entries,
      ),
      CATALOG,
    );

    expect(found.map((sink) => sink.sinkPlacementId)).toEqual(["p0"]);
  });

  /** The three inferences ADR 0092 decision 9 rejects, each shown to be unusable on the shipped
   *  catalogue rather than argued against. */
  it("cannot be read off a kind, an id prefix or an equivalent id", () => {
    // `kind`: the sink base and a drawer base are both `base_cabinet`.
    expect(definitionOf("base-sink-800").kind).toBe("base_cabinet");
    expect(definitionOf("base-drawer3-600").kind).toBe("base_cabinet");
    // An id prefix: the seeded row is not spelled `base-sink`, and `base-sink-800`'s prefix is a
    // spelling convention nothing enforces.
    expect(declaresASink(definitionOf("base-sink"))).toBe(true);
    expect(declaresASink(definitionOf("base-sink-800"))).toBe(true);
    // An equivalent id: the seeded row declares its own sink, so deleting the equivalence would not
    // take the sink away.
    expect(definitionOf("base-sink-800").catalogEquivalentId).toBe("base-sink");
    expect(definitionOf("base-drawer3-600").catalogEquivalentId).toBe(
      "base-3drawer",
    );
    expect(declaresASink(definitionOf("base-3drawer"))).toBe(false);
  });

  it("finds nothing in a kitchen with no sink", () => {
    expect(
      accessoriesOf([
        placement("wall", "wall-2door-800", {
          alongMm: 1_300,
          y0Mm: 1_500,
          widthMm: 800,
          heightMm: 700,
        }),
      ]),
    ).toEqual([]);
  });
});

describe("the rack's host on the seeded design", () => {
  it("hangs the rack in the wall cabinet directly above the sink", () => {
    const found = findSinkAccessories(
      projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG).flatMap(
        (group) => group.entries,
      ),
      CATALOG,
    );

    expect(found).toEqual([
      { sinkPlacementId: "p0", rackHostPlacementId: "p11" },
    ]);
  });

  /** **The first wrong reading: *any* overlapping body.** Two bodies overlap the seeded sink's
   *  900–1700 span — `p11` at `y0` 1500 and `p17` at `y0` 2200 — so a rule that counted every one of
   *  them would bill two racks for one sink. One record, one host. */
  it("resolves one host although two bodies stand over the sink", () => {
    const seeded = KITCHEN_L_DESIGN.placements;
    const overStandingSink = seeded.filter(
      (candidate) =>
        candidate.wall === "A" &&
        candidate.y0Mm > 0 &&
        candidate.alongMm - candidate.body.widthMm / 2 < SINK_ENDS_MM &&
        candidate.alongMm + candidate.body.widthMm / 2 > SINK_STARTS_MM,
    );

    expect(overStandingSink.map((candidate) => candidate.id)).toEqual([
      "p11",
      "p17",
    ]);
    expect(
      findSinkAccessories(
        projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG).flatMap(
          (group) => group.entries,
        ),
        CATALOG,
      ),
    ).toHaveLength(1);
  });

  /** **The second wrong reading: *the highest*.** `p17` is the top box at `y0` 2200; a rack there
   *  hangs near the ceiling, out of reach of the sink it drains into. */
  it("takes the lower of the two and not the higher", () => {
    const found = accessoriesOf([
      SINK,
      placement("low", "wall-2door-800", {
        alongMm: 1_300,
        y0Mm: 1_500,
        widthMm: 800,
        heightMm: 700,
      }),
      placement("high", "wall-2door-800-top", {
        alongMm: 1_300,
        y0Mm: 2_200,
        widthMm: 800,
        heightMm: 400,
      }),
    ]);

    expect(found).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "low" },
    ]);
  });
});

/**
 * **The third wrong reading: a predicate on the raw `band`.**
 *
 * `top` folds into `wall` through `normaliseBand` (ADR 0011 Gap C), so a top box is a legitimate
 * candidate — it is simply never the lowest on the seeded design, which is why a raw-band predicate
 * agrees there by luck. This fixture takes the luck away: the **only** body over the sink is a `top`
 * row, and a rule reading `rawBand === "wall"` answers *no host* and drops the rack line entirely.
 */
describe("a top row is a wall-band candidate, because the band is the normalised one", () => {
  const ONLY_A_TOP_ROW_OVER_THE_SINK = [
    SINK,
    placement("top", "wall-2door-800-top", {
      alongMm: 1_300,
      y0Mm: 2_200,
      widthMm: 800,
      heightMm: 400,
    }),
  ];

  it("is a fixture whose only overlapping body declares the raw band `top`", () => {
    expect(definitionOf("wall-2door-800-top").band).toBe("top");
    const entries = projectDesignForDisplay(
      designOf(ONLY_A_TOP_ROW_OVER_THE_SINK),
      CATALOG,
    ).flatMap((group) => group.entries);
    const top = entries.find((entry) => entry.placementId === "top");

    expect([top?.rawBand, top?.band]).toEqual(["top", "wall"]);
  });

  it("hangs the rack in it rather than answering no host", () => {
    expect(accessoriesOf(ONLY_A_TOP_ROW_OVER_THE_SINK)).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "top" },
    ]);
  });
});

/**
 * **The fourth wrong reading: touching counts as overlapping.**
 *
 * On the seeded design `p12` (`open-shelf-600`) begins at exactly 1700, where the sink ends. Counting
 * it would tie it with `p11` at the same `y0` and hang a rack in an open shelf. The fixture below
 * removes the open shelf's own disqualification — it uses a wall cabinet with two leaves — so what is
 * being tested is the boundary and nothing else.
 */
describe("touching is not overlapping", () => {
  it("finds no host in a cabinet that begins exactly where the sink ends", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("abutting", "wall-2door-600", {
          alongMm: SINK_ENDS_MM + 300,
          y0Mm: 1_500,
          widthMm: 600,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });

  it("finds no host in a cabinet that ends exactly where the sink begins", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("abutting", "wall-2door-600", {
          alongMm: SINK_STARTS_MM - 300,
          y0Mm: 1_500,
          widthMm: 600,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });

  it("finds a host in a cabinet overlapping by a single millimetre", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("just-over", "wall-2door-600", {
          alongMm: SINK_ENDS_MM + 299,
          y0Mm: 1_500,
          widthMm: 600,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink", rackHostPlacementId: "just-over" }]);
  });
});

describe("a host must be a wall-band body that declares a door leaf", () => {
  it("does not hang a rack in the open shelf standing over the sink", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("shelf", "open-shelf-600", {
          alongMm: 1_300,
          y0Mm: 1_500,
          widthMm: 600,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });

  it("does not hang a rack in the hood standing over the sink", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("hood", "hood-600", {
          alongMm: 1_300,
          y0Mm: 1_500,
          widthMm: 600,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });

  it("does not hang a rack in a base body sharing the sink's span", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("column", "tall-pantry-600", {
          alongMm: 1_300,
          y0Mm: 0,
          widthMm: 600,
          heightMm: 2_200,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });

  it("does not hang a rack on the other wall, whatever its along-wall coordinate", () => {
    expect(
      accessoriesOf([
        SINK,
        placement("elsewhere", "wall-2door-800", {
          wall: "B",
          alongMm: 1_300,
          y0Mm: 1_500,
          widthMm: 800,
          heightMm: 700,
        }),
      ]),
    ).toEqual([{ sinkPlacementId: "sink" }]);
  });
});

/** *"The lowest"* is not by itself a function: two wall cabinets can sit at one `y0` over one sink.
 *  ADR 0092 decision 10 makes the rest of the order part of the rule — larger overlap, then the
 *  **projection's** order, and never the `placements` array's, which is persistence order and
 *  reorders under editing. */
describe("the tie-break at one y0", () => {
  /** The narrow cabinet stands **first** in the projection's order — a lower `alongMm` at the same
   *  `y0` — so a rule that ranked by the smaller overlap, or that simply kept the first candidate it
   *  met, would keep it. Only the larger-overlap key reaches the wide one. */
  it("prefers the cabinet that overlaps the sink by more", () => {
    const wide = placement("wide", "wall-2door-800", {
      alongMm: 1_300,
      y0Mm: 1_500,
      widthMm: 800,
      heightMm: 700,
    });
    const narrow = placement("narrow", "wall-1door-300", {
      alongMm: 1_000,
      y0Mm: 1_500,
      widthMm: 300,
      heightMm: 700,
    });

    expect(accessoriesOf([SINK, wide, narrow])).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "wide" },
    ]);
    // The array's own order changes nothing: the query reads the projection.
    expect(accessoriesOf([SINK, narrow, wide])).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "wide" },
    ]);
  });

  /** Same `y0`, same overlap, so the projection's order decides — wall, band, `y0Mm`, `alongMm`,
   *  then the placement id. The left-hand cabinet comes first in it whichever order the document
   *  stores the two in. */
  it("falls back to the projection's order and never to the array's", () => {
    const left = placement("zzz-left", "wall-1door-300", {
      alongMm: 1_050,
      y0Mm: 1_500,
      widthMm: 300,
      heightMm: 700,
    });
    const right = placement("aaa-right", "wall-1door-300", {
      alongMm: 1_550,
      y0Mm: 1_500,
      widthMm: 300,
      heightMm: 700,
    });

    expect(accessoriesOf([SINK, left, right])).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "zzz-left" },
    ]);
    expect(accessoriesOf([SINK, right, left])).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "zzz-left" },
    ]);
  });
});

/** Owner ruling, 2026-09-04, against the recommendation on record: **two sinks means two racks and
 *  two covers, even where both racks resolve to the same wall cabinet.** The rule is applied once per
 *  sink and never once per kitchen. */
describe("the rule is applied per sink", () => {
  it("answers two records for two sinks under one wall cabinet", () => {
    const wide = placement("host", "wall-2door-800", {
      alongMm: 1_300,
      y0Mm: 1_500,
      widthMm: 800,
      heightMm: 700,
    });
    const secondSink = placement("sink-b", "base-sink-800", {
      alongMm: 1_500,
      y0Mm: 0,
      widthMm: 400,
      heightMm: 820,
    });

    expect(accessoriesOf([SINK, secondSink, wide])).toEqual([
      { sinkPlacementId: "sink", rackHostPlacementId: "host" },
      { sinkPlacementId: "sink-b", rackHostPlacementId: "host" },
    ]);
  });

  it("answers one hosted and one unhosted sink where only one has a cabinet above it", () => {
    const hosted = placement("hosted", "base-sink-800", {
      alongMm: 1_300,
      y0Mm: 0,
      widthMm: 800,
      heightMm: 820,
    });
    const stranded = placement("stranded", "base-sink-800", {
      alongMm: 3_000,
      y0Mm: 0,
      widthMm: 800,
      heightMm: 820,
    });
    const host = placement("host", "wall-2door-800", {
      alongMm: 1_300,
      y0Mm: 1_500,
      widthMm: 800,
      heightMm: 700,
    });

    expect(accessoriesOf([hosted, stranded, host])).toEqual([
      { sinkPlacementId: "hosted", rackHostPlacementId: "host" },
      { sinkPlacementId: "stranded" },
    ]);
  });
});

describe("a sink with nothing above it", () => {
  /** **Absent, and never a placeholder id.** The pricing query turns the absence into *no line*, and
   *  the difference matters: a zero-amount line renders *inclus* and tells a customer a rack they are
   *  not getting is included. */
  it("carries no host key at all rather than an empty one", () => {
    const [found] = accessoriesOf([SINK]);

    expect(found).toEqual({ sinkPlacementId: "sink" });
    expect(found && "rackHostPlacementId" in found).toBe(false);
  });
});
