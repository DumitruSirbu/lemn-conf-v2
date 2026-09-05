// Wave 6J-c — the along-wall chain's own arithmetic, and the structural fact that it has a reader.
//
// The command-level criteria live in `commands/set-cabinet-depth.along-wall-chain.test.ts`. What is
// here is the module: the two chains carry **different** deltas, the shift is a pure function of the
// setting, and `alongWallPositionFollows` is read by something that ships.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  alongWallPositionAtMm,
  alongWallShiftMm,
  cornerReachAlongWallMm,
  WALL_THE_CORNER_IS_TAKEN_FROM,
} from "../src/along-wall-chain-shift.js";
import type { AlongWallDepthChain } from "../src/cabinet-depth-rule.js";
import type { DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";

const SHALLOW_MM = 600;
const DEEP_MM = 700;

const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

/** Where the field is declared, so "read outside `tests/`" can mean "read somewhere other than the
 *  module that declares it" rather than being satisfied by its own declaration. */
const DECLARING_MODULE = "cabinet-depth-rule.ts";

function sourceFiles(): readonly string[] {
  return readdirSync(SOURCE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) =>
      path.relative(SOURCE, path.join(entry.parentPath, entry.name)),
    );
}

function sourceFilesContaining(needle: string): readonly string[] {
  return sourceFiles().filter(
    (file) =>
      path.basename(file) !== DECLARING_MODULE &&
      readFileSync(path.join(SOURCE, file), "utf8").includes(needle),
  );
}

/** A wall-B placement lifted out of the seeded fixture by id, so a test states a body rather than an
 *  index into a list that has been renumbered once already. */
function seeded(id: string): DesignPlacement {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === id,
  );
  if (!placement) throw new Error(`no seeded placement ${id}`);
  return placement;
}

describe("the declaration has a production reader", () => {
  // The criterion wave 6J-a recorded and did not meet, as a structural test rather than a promise:
  // the field was declared, validated and read nowhere, which is indistinguishable from a field
  // somebody forgot to wire up (`cabinet-depth-rule.ts`'s own head comment).
  it("is read by a module in src/ other than the one that declares it", () => {
    expect(sourceFilesContaining("alongWallPositionFollows")).toContain(
      "along-wall-chain-shift.ts",
    );
  });

  // Not merely mentioned: **branched on**. A reader that reads the field and treats both answers the
  // same is the unread declaration wearing a consumer's clothes.
  it("branches on both of the two chains outside that module", () => {
    for (const chain of ["base-formula", "wall-map"]) {
      expect(sourceFilesContaining(`"${chain}"`), chain).toContain(
        "along-wall-chain-shift.ts",
      );
    }
  });
});

describe("the two chains", () => {
  // **The reason the field exists at all** (ADR 0089): one uniform shift is wrong for one of the two
  // by 30 mm. Asserted as two numbers *and* as their inequality, so a reader that collapsed them to
  // one delta cannot pass by landing on whichever arm it chose.
  it("carry different deltas between the two declared depths", () => {
    const shiftOf = (chain: AlongWallDepthChain): number =>
      alongWallShiftMm({
        fromCabinetDepthMm: SHALLOW_MM,
        toCabinetDepthMm: DEEP_MM,
        chain,
      });

    expect(shiftOf("base-formula")).toBe(100);
    expect(shiftOf("wall-map")).toBe(70);
    expect(shiftOf("base-formula")).not.toBe(shiftOf("wall-map"));
  });

  // The reaches themselves, which are what those deltas are differences of: the base run's carcass
  // and the wall band's carcass seat, at both settings.
  it("reach the distances the two corner bands actually occupy", () => {
    expect(
      cornerReachAlongWallMm({
        cabinetDepthMm: SHALLOW_MM,
        chain: "base-formula",
      }),
    ).toBe(560);
    expect(
      cornerReachAlongWallMm({
        cabinetDepthMm: DEEP_MM,
        chain: "base-formula",
      }),
    ).toBe(660);
    expect(
      cornerReachAlongWallMm({ cabinetDepthMm: SHALLOW_MM, chain: "wall-map" }),
    ).toBe(291);
    expect(
      cornerReachAlongWallMm({ cabinetDepthMm: DEEP_MM, chain: "wall-map" }),
    ).toBe(361);
  });

  it.each(["base-formula", "wall-map"] as const)(
    "moves nothing on %s when the setting does not change",
    (chain) => {
      for (const cabinetDepthMm of [SHALLOW_MM, DEEP_MM]) {
        expect(
          alongWallShiftMm({
            fromCabinetDepthMm: cabinetDepthMm,
            toCabinetDepthMm: cabinetDepthMm,
            chain,
          }),
        ).toBe(0);
      }
    },
  );

  it.each(["base-formula", "wall-map"] as const)(
    "sums to nothing on %s over there and back",
    (chain) => {
      const out = alongWallShiftMm({
        fromCabinetDepthMm: SHALLOW_MM,
        toCabinetDepthMm: DEEP_MM,
        chain,
      });
      const back = alongWallShiftMm({
        fromCabinetDepthMm: DEEP_MM,
        toCabinetDepthMm: SHALLOW_MM,
        chain,
      });

      expect(out).not.toBe(0);
      expect(out + back).toBe(0);
    },
  );
});

describe("which placements the corner reaches", () => {
  const catalog = buildKitchenLBodyCatalog(DEEP_MM);
  const move = { fromCabinetDepthMm: SHALLOW_MM, toCabinetDepthMm: DEEP_MM };

  it("takes the wall it is declared to take from, and no other", () => {
    expect(WALL_THE_CORNER_IS_TAKEN_FROM).toBe("B");
  });

  // Wall A is anchored at the corner (ADR 0083 decision 1), so a deeper corner never shortens it.
  it("leaves every wall-A placement where it stands", () => {
    const wallA = KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.wall === "A",
    );

    expect(wallA.length).toBeGreaterThan(0);
    for (const placement of wallA) {
      expect(
        alongWallPositionAtMm({ placement, catalog, ...move }),
        placement.id,
      ).toBe(placement.alongMm);
    }
  });

  // ADR 0058's pinned tops and the freestanding fridge do not follow the setting in **depth** and
  // still slide: where a body stands and what it is built to are two questions, and answering the
  // second for the first is what left the run overlapping itself at the pinned rows.
  it("slides a body whose own depth the setting does not reach", () => {
    for (const id of ["p7", "p22", "p24"]) {
      const placement = seeded(id);
      expect(alongWallPositionAtMm({ placement, catalog, ...move }), id).toBe(
        placement.alongMm + 100,
      );
    }
  });

  // The same stance `setCabinetDepth` takes for a body it cannot resolve: left where it is, so the
  // command's own refusal reports it rather than this module throwing on the way there.
  it("leaves a placement whose entry left the catalogue exactly where it is", () => {
    const orphan: DesignPlacement = {
      ...seeded("p5"),
      body: { ...seeded("p5").body, buildId: "no-such-entry" },
    };

    expect(alongWallPositionAtMm({ placement: orphan, catalog, ...move })).toBe(
      orphan.alongMm,
    );
  });
});
