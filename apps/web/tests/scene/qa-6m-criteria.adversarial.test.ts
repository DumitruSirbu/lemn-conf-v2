// Wave 6M's two negative criteria and its save criterion, taken against what would actually falsify
// them rather than against a fixture that cannot.
//
// - **"The design still saves and resumes with the warning intact."** `overflow-mark.test.ts` proves
//   this with `DesignSchema.parse(JSON.parse(...))`, which is the *wire* boundary. The wire is not
//   what refused an overflowing design before wave 6A3: `assertDesignValidForCatalog` was, and ADR
//   0065 records the refusal in place — 500 `DESIGN_UNREADABLE` on load. A round trip through the
//   schema would have passed on the day the criterion was false, so it is not the criterion's test.
// - **"Bare wall at the end of a run is never marked."** The fixture the wave uses leaves a remainder
//   on a **round** 3560 mm wall. ADR 0067 is explicit that a real wall is not round — 2444 mm is
//   typical — and that a large remainder is the product working. Both shapes are swept here, and the
//   size of the remainder is asserted so the case cannot quietly stop being one.
// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  DesignSchema,
  fatalDesignValidationIssues,
  findOverflowingPlacementIds,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  validateDesignForCatalog,
  type Design,
  type DesignPlacement,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";

const store = vi.hoisted(() => ({ design: undefined as Design | undefined }));

vi.mock("@/store/configurator-store", () => ({
  useConfiguratorStore: (selector: (state: unknown) => unknown) =>
    // `isBodyProbeAttached` is the stage-is-mounted fact the warning is gated on: the sentence
    // must not claim bodies are "marked" while the canvas is still loading and nothing is.
    // These cases are all about the query/geometry agreement, so the stage is mounted throughout.
    selector({ design: store.design, isBodyProbeAttached: true }),
}));

const { OverflowWarning } = await import("@/scene/overflow-warning");

/** ADR 0067's real wall: not round, and the manufacturer closes what is left at final measurement.
 *  A run ending `remainderMm` short of it is the normal case and must produce no sentence. */
function designOnARealWall(remainderMm: number): Design {
  const wallLengthMm = 2444;
  const bodyWidthMm = 600;
  const runEndMm = wallLengthMm - remainderMm;
  const placements: DesignPlacement[] = [
    {
      id: "last-on-the-run",
      wall: "A",
      alongMm: runEndMm - bodyWidthMm / 2,
      y0Mm: 0,
      body: {
        buildId: "base-drawer3-600",
        widthMm: bodyWidthMm,
        heightMm: 820,
      },
    },
  ];
  return {
    ...KITCHEN_L_DESIGN,
    room: { ...KITCHEN_L_DESIGN.room, widthMm: wallLengthMm },
    placements,
  };
}

function renderFor(design: Design): string {
  store.design = design;
  return renderToStaticMarkup(createElement(OverflowWarning));
}

/** How much bare wall the furthest body on `wall` leaves behind. Negative means it overruns. */
function remainderOnWallMm(design: Design, wall: "A" | "B"): number {
  const wallLengthMm = wall === "A" ? design.room.widthMm : design.room.depthMm;
  const runEndMm = Math.max(
    ...design.placements
      .filter((placement) => placement.wall === wall)
      .map((placement) => placement.alongMm + placement.body.widthMm / 2),
  );
  return wallLengthMm - runEndMm;
}

beforeEach(() => {
  store.design = undefined;
});

describe("an overflowing design saves and resumes, at the boundary that used to refuse it", () => {
  it("carries no issue severe enough to refuse the write", () => {
    // ADR 0065 decision 7 with ADR 0069: "reaches past the end of its own wall" is a code family
    // demoted together. If any member of it is ever re-promoted to a refusal, the design stops
    // saving and this wave's warning describes a state the customer cannot reach twice.
    const issues = validateDesignForCatalog(
      OVERFLOWING_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    expect(issues.map((issue) => issue.code)).toStrictEqual([
      "PLACEMENT_PAST_WALL_END",
    ]);
    expect(fatalDesignValidationIssues(issues)).toStrictEqual([]);
  });

  it("still reports the same body once it has been through the wire and validated again", () => {
    const resumed = DesignSchema.parse(
      JSON.parse(JSON.stringify(OVERFLOWING_DESIGN)),
    );

    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(resumed, KITCHEN_L_BODY_CATALOG),
      ),
    ).toStrictEqual([]);
    expect(findOverflowingPlacementIds(resumed)).toStrictEqual([
      "dragged-past-wall-b",
    ]);
    expect(renderFor(resumed)).toContain(ro.configure.overflowWarning);
  });
});

describe("bare wall at the end of a run is never marked, on a wall that is not round", () => {
  // ADR 0067: "the copy has to work at a 200 mm remainder, not only at 30". Swept rather than
  // sampled, and up past the remainder a whole cabinet would leave.
  for (const remainderMm of [0, 1, 30, 44, 200, 344, 800, 1844]) {
    it(`says nothing with ${String(remainderMm)} mm of a 2444 mm wall left bare`, () => {
      const design = designOnARealWall(remainderMm);

      expect(remainderOnWallMm(design, "A")).toBe(remainderMm);
      expect(findOverflowingPlacementIds(design)).toStrictEqual([]);
      expect(renderFor(design)).not.toContain(ro.configure.overflowWarning);
    });
  }

  it("does say something one millimetre the other side of the same wall", () => {
    // The sensitivity check the sweep above needs: if this ever passes, the sweep has stopped
    // measuring the wall end and is asserting that nothing is ever marked.
    const design = designOnARealWall(-1);

    expect(remainderOnWallMm(design, "A")).toBe(-1);
    expect(renderFor(design)).toContain(ro.configure.overflowWarning);
  });

  it("leaves a remainder large enough that the wave's own fixture is testing one", () => {
    // The wave's `LARGE_REMAINDER_DESIGN` asserts only `placements.length > 0`, so widening its
    // filter back to the whole kitchen would leave it green while it stopped being a remainder case.
    const largeRemainder: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "A" && placement.alongMm < 1000,
      ),
    };

    expect(largeRemainder.placements.length).toBeGreaterThan(0);
    expect(remainderOnWallMm(largeRemainder, "A")).toBeGreaterThan(2000);
    expect(findOverflowingPlacementIds(largeRemainder)).toStrictEqual([]);
  });
});

describe("the two ruled strings stay two, in both directions", () => {
  it("keeps the flagged total's sentence out of the scene warning's surface", () => {
    // `overflow-warning-layout.test.ts` holds the price and panel sources to not reading
    // `configure.overflowWarning`. This is the same rule from the other side, which nothing held:
    // the scene's own surface must not reach for the total's flag either.
    const sceneSources = [
      "scene/overflow-warning.tsx",
      "scene/overflow-warning-layout.ts",
      "scene/use-overflowing-placements.ts",
      "scene/kitchen-stage.tsx",
    ].map((path) => ({
      path,
      text: readFileSync(
        resolve(import.meta.dirname, "../../src", path),
        "utf8",
      ),
    }));

    for (const source of sceneSources) {
      expect(
        source.text,
        `${source.path} reads the flagged total's sentence`,
      ).not.toContain("price.overflowingTotalWarning");
    }
  });

  it("shares only the noun the owner reconciled, and no clause", () => {
    // ADR 0065 decision 7b: "only the noun is now shared". A later wave that made one sentence a
    // rewording of the other would keep the two constants and lose the distinction they exist for.
    const clausesOf = (sentence: string) =>
      sentence
        .split(/[.,]/)
        .map((clause) => clause.trim().toLowerCase())
        .filter((clause) => clause.length > 0);

    const shared = clausesOf(ro.configure.overflowWarning).filter((clause) =>
      clausesOf(ro.price.overflowingTotalWarning).includes(clause),
    );

    expect(shared).toStrictEqual([]);
    expect(ro.configure.overflowWarning).toContain("dulap");
    expect(ro.price.overflowingTotalWarning).toContain("dulapuri");
  });
});
