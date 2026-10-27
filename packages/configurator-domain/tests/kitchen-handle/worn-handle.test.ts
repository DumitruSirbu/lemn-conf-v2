// Wave H1b: `DisplayEntry.wornHandle` is the handle a customer-facing list names for a body, and it must never name a
// latch the price does not bill. A body with no front that opens (an open shelf, a hood) is billed no latch whatever
// row it stands on, so it wears nothing; a top-row body that takes no handle but has doors still wears push-to-open.
// The oracle is written out here (own handle, else the kitchen's below the top row, else steel; the top row is the
// kitchen's top-row handle, else push, at the literal 2200 mm), and the price's latch count is the independent witness.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  countHardwareMechanisms,
  frontPopulationQueryFor,
  openingFrontCount,
  projectDesignForDisplay,
  type BodyCatalog,
  type BodyDefinition,
  type Design,
  type DisplayEntry,
  type Handle,
} from "../../src/index.js";

const MODULE_LINE_MM = 2_200;
const FLOORS_MM = [0, 1_500, MODULE_LINE_MM - 1, MODULE_LINE_MM, 2_400];
const CHOICES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const CATALOGUE_DEPTHS_MM = [600, 700];

interface Probe {
  readonly buildId: string;
  readonly definition: BodyDefinition;
  readonly catalog: BodyCatalog;
}

const PROBES: readonly Probe[] = CATALOGUE_DEPTHS_MM.flatMap((depthMm) => {
  const catalog = buildKitchenLBodyCatalog(depthMm);
  return [...catalog].map(([buildId, definition]) => ({
    buildId,
    definition,
    catalog,
  }));
});

function bodyOf(probe: Probe, own: Handle | undefined) {
  return {
    buildId: probe.buildId,
    widthMm: probe.definition.sizesMm?.[0] ?? 600,
    heightMm: probe.definition.nominalHeightMm ?? 700,
    ...(own === undefined ? {} : { handle: own }),
  };
}

function entryOf(args: {
  readonly probe: Probe;
  readonly y0Mm: number;
  readonly own: Handle | undefined;
  readonly kitchen: Handle | undefined;
  readonly topRow: Handle | undefined;
}): DisplayEntry {
  const { probe, y0Mm, own, kitchen, topRow } = args;
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      ...(kitchen === undefined ? {} : { handle: kitchen }),
      ...(topRow === undefined ? {} : { topRowHandle: topRow }),
    },
    placements: [
      { id: "probe", wall: "A", alongMm: 300, y0Mm, body: bodyOf(probe, own) },
    ],
  };
  const [entry] = projectDesignForDisplay(design, probe.catalog).flatMap(
    (group) => group.entries,
  );
  if (entry === undefined) throw new Error(`no entry for ${probe.buildId}`);
  return entry;
}

function frontsOf(entry: DisplayEntry, probe: Probe): number {
  return openingFrontCount(
    frontPopulationQueryFor({ body: entry, definition: probe.definition }),
  );
}

/** The rule from its words: what a body is read as wearing. */
function oracleWorn(args: {
  readonly canHandle: boolean;
  readonly fronts: number;
  readonly y0Mm: number;
  readonly own: Handle | undefined;
  readonly kitchen: Handle | undefined;
  readonly topRow: Handle | undefined;
}): Handle | undefined {
  const isTopRow = args.y0Mm >= MODULE_LINE_MM;
  if (!args.canHandle) return isTopRow && args.fronts > 0 ? "push" : undefined;
  return (
    args.own ?? (isTopRow ? (args.topRow ?? "push") : (args.kitchen ?? "steel"))
  );
}

describe("the handle a list names for a body", () => {
  it("is the oracle's, and names push exactly where the price bills a latch, for every row at every floor", () => {
    const wrong: string[] = [];
    let swept = 0;
    for (const probe of PROBES) {
      for (const y0Mm of FLOORS_MM) {
        for (const own of CHOICES) {
          for (const kitchen of CHOICES) {
            for (const topRow of CHOICES) {
              const entry = entryOf({ probe, y0Mm, own, kitchen, topRow });
              const expected = oracleWorn({
                canHandle: probe.definition.canHandle,
                fronts: frontsOf(entry, probe),
                y0Mm,
                own,
                kitchen,
                topRow,
              });
              const latches = countHardwareMechanisms(
                [entry],
                probe.catalog,
              ).pushToOpen;
              const agreesWithThePrice =
                (entry.wornHandle === "push") === latches > 0;
              swept += 1;
              if (entry.wornHandle !== expected || !agreesWithThePrice) {
                wrong.push(
                  `${probe.buildId} y0=${String(y0Mm)} own=${String(own)} kitchen=${String(kitchen)} topRow=${String(topRow)}: worn ${String(entry.wornHandle)}, oracle ${String(expected)}, latches ${String(latches)}`,
                );
              }
            }
          }
        }
      }
    }

    expect(swept).toBe(
      PROBES.length *
        FLOORS_MM.length *
        CHOICES.length *
        CHOICES.length *
        CHOICES.length,
    );
    expect(wrong).toEqual([]);
  });

  it("is nothing for every row with no front that opens, on the top row too, whatever is recorded", () => {
    const frontless = PROBES.filter((probe) => {
      const entry = entryOf({
        probe,
        y0Mm: 0,
        own: undefined,
        kitchen: undefined,
        topRow: undefined,
      });
      return frontsOf(entry, probe) === 0;
    });
    const named: string[] = [];
    for (const probe of frontless) {
      for (const y0Mm of FLOORS_MM) {
        for (const own of CHOICES) {
          for (const topRow of CHOICES) {
            const entry = entryOf({
              probe,
              y0Mm,
              own,
              kitchen: "push",
              topRow,
            });
            if (entry.wornHandle !== undefined) named.push(probe.buildId);
          }
        }
      }
    }

    expect(frontless.map((probe) => probe.buildId)).toContain("open-shelf-600");
    expect(frontless.map((probe) => probe.buildId)).toContain("hood-600");
    expect(named).toEqual([]);
  });

  it("reaches, on the top row, rows that take a handle, rows that take none but have fronts, and rows with no front", () => {
    const atTheLine = PROBES.map((probe) => {
      const entry = entryOf({
        probe,
        y0Mm: MODULE_LINE_MM,
        own: undefined,
        kitchen: undefined,
        topRow: undefined,
      });
      return { probe, fronts: frontsOf(entry, probe) };
    });
    const arm = (isMatch: (row: (typeof atTheLine)[number]) => boolean) =>
      atTheLine.filter(isMatch).length;

    expect(arm((row) => row.probe.definition.canHandle)).toBeGreaterThan(10);
    expect(
      arm((row) => !row.probe.definition.canHandle && row.fronts > 0),
    ).toBeGreaterThan(0);
    expect(arm((row) => row.fronts === 0)).toBeGreaterThan(0);
  });

  it("is push for the top-row corner return, which takes no handle but has a door the price bills a latch for", () => {
    const probe = PROBES.find(
      (candidate) => candidate.buildId === "wall-corner-return-570-top",
    );
    if (probe === undefined) throw new Error("the catalogue lost the row");
    const entry = entryOf({
      probe,
      y0Mm: MODULE_LINE_MM,
      own: undefined,
      kitchen: "steel",
      topRow: "steel",
    });

    expect(probe.definition.canHandle).toBe(false);
    expect(entry.wornHandle).toBe("push");
    expect(
      countHardwareMechanisms([entry], probe.catalog).pushToOpen,
    ).toBeGreaterThan(0);
  });
});
