// M7B wave U4 adversarial QA — which pieces are the right corner's (ADR 0132 d2, A8.4; ADR 0121).
//
// The adapter wraps a piece in a reflection when its record's `corner` is `"right"`. That answer is
// the domain's own `cornerOf`, asked on the original placement when the records are derived, so it is
// checked here against `cornerOf` itself — over the engine's whole U range, at both catalogue depths,
// and on wall-A X-legs placed at, and a millimetre either side of, `W / 2` for odd and even `W`.
import {
  buildKitchenLBodyCatalog,
  cornerOf,
  type Design,
  type DesignPlacement,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { rightCornerRecordIds } from "../src/right-corner-wrapper.js";
import {
  anyEngineU,
  idsTheDomainCallsRight,
  recordsOf,
  SHELL_CABINET_DEPTH_MM,
  uShell,
} from "./support/u-scene.js";

const DECLARED_CABINET_DEPTHS_MM = [600, 700] as const;
const CATALOGUE = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);

const RIGHT_CORNER_IDS = ["right-p25", "right-p26", "right-p9", "right-p21"];
// The corner wall unit's two (M7C wave C2): in every U but a large one, whose back wall is base-only.
const RIGHT_CORNER_UNIT_IDS = ["right-p27", "right-p28"];

describe("rightCornerRecordIds agrees with cornerOf on the original placements", () => {
  propertyTest.prop(
    [anyEngineU, fc.constantFrom(...DECLARED_CABINET_DEPTHS_MM)],
    { numRuns: 150 },
  )(
    "over the engine's U range and both catalogue depths, the right pieces the shell placed and no other",
    (dimensions, cabinetDepthMm) => {
      const design = uShell(dimensions);
      const placedRightPieces = design.placements
        .map((placement) => placement.id)
        .filter((id) =>
          [...RIGHT_CORNER_IDS, ...RIGHT_CORNER_UNIT_IDS].includes(id),
        )
        .sort();

      const adapter = [
        ...rightCornerRecordIds({
          room: design.room,
          records: recordsOf(design, cabinetDepthMm),
        }),
      ].sort();

      expect(adapter).toEqual(idsTheDomainCallsRight(design));
      expect(adapter).toEqual(placedRightPieces);
      expect(adapter).toEqual(
        expect.arrayContaining(["right-p25", "right-p26"]),
      );
    },
  );

  /** A structural X-leg on wall A, placed wherever the case needs it — not a layout the product
   *  writes, but the input on which a corner decided by position would read the wrong side. */
  function xLegAt(id: string, alongMm: number): DesignPlacement {
    return {
      id,
      wall: "A",
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-corner-x-900", widthMm: 900, heightMm: 820 },
    };
  }

  it.each([2700, 2701, 3001, 4500, 4501, 6299])(
    "W = %i: X-legs at, and a millimetre either side of, W / 2 read the same side as cornerOf",
    (widthMm) => {
      const shell = uShell({
        widthMm,
        depthMm: 3000,
        wallCMm: 3000,
        heightMm: 2600,
      });
      const middle = widthMm / 2;
      const alongs = [
        Math.floor(middle) - 1,
        Math.floor(middle),
        Math.ceil(middle),
        Math.ceil(middle) + 1,
      ];
      const probes = alongs.map((alongMm, index) =>
        xLegAt(`probe-${String(index)}`, alongMm),
      );
      const design: Design = {
        ...shell,
        placements: [...shell.placements, ...probes],
      };

      const adapter = rightCornerRecordIds({
        room: design.room,
        records: recordsOf(design),
      });

      for (const probe of probes) {
        const domain = cornerOf(probe, design.room, CATALOGUE);
        expect(
          adapter.has(probe.id),
          `along ${String(probe.alongMm)} of ${String(widthMm)}`,
        ).toBe(domain === "right");
      }
      // The discriminating pair: floor(W/2) and ceil(W/2) are one and the same millimetre for an
      // even W, and straddle the midpoint for an odd one.
      expect(adapter.has("probe-1")).toBe(widthMm % 2 === 0);
      expect(adapter.has("probe-2")).toBe(true);
    },
  );

  it("never wraps a body that is not a structural corner, on wall A past W / 2 or on wall C", () => {
    const shell = uShell({
      widthMm: 4500,
      depthMm: 3000,
      wallCMm: 3600,
      heightMm: 2600,
    });
    const ordinary = (
      id: string,
      wall: "A" | "C",
      alongMm: number,
    ): DesignPlacement => ({
      id,
      wall,
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
    });
    const design: Design = {
      ...shell,
      placements: [
        ...shell.placements,
        ordinary("a-far", "A", 3300),
        ordinary("c-near", "C", 1200),
        ordinary("c-far", "C", 3000),
      ],
    };

    const adapter = rightCornerRecordIds({
      room: design.room,
      records: recordsOf(design),
    });

    expect([...adapter].sort()).toEqual([...RIGHT_CORNER_IDS].sort());
  });

  it("answers the same set from records derived at one catalogue depth, then the other, then the first again", () => {
    const design = uShell({
      widthMm: 3001,
      depthMm: 1000,
      wallCMm: 6000,
      heightMm: 2600,
    });
    const rightIdsAt = (cabinetDepthMm: number): string[] =>
      [
        ...rightCornerRecordIds({
          room: design.room,
          records: recordsOf(design, cabinetDepthMm),
        }),
      ].sort();

    const first = rightIdsAt(600);
    const other = rightIdsAt(700);
    const again = rightIdsAt(600);

    expect(first).toEqual([...RIGHT_CORNER_IDS].sort());
    expect(other).toEqual(first);
    expect(again).toEqual(first);
  });

  it.each([
    ["an L", { shape: "L", widthMm: 1800, depthMm: 3000, heightMm: 2600 }],
    [
      "a right-hand L",
      {
        shape: "L",
        widthMm: 1800,
        depthMm: 3000,
        heightMm: 2600,
        cornerDirection: "right",
      },
    ],
    [
      "a straight room",
      { shape: "linear", widthMm: 1800, depthMm: 3000, heightMm: 2600 },
    ],
  ] as const)(
    "wraps nothing in %s, whatever records it is handed",
    (_name, room) => {
      const design = uShell({
        widthMm: 1800,
        depthMm: 3000,
        wallCMm: 3000,
        heightMm: 2600,
      });

      expect(
        rightCornerRecordIds({ room, records: recordsOf(design) }).size,
      ).toBe(0);
    },
  );
});
