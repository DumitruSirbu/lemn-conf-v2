import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_DESIGN,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  migrateDesign,
  usesItem,
} from "@lemnaria/configurator-domain";
import type { Design, ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usageProbesFor } from "../src/item-usage-probes.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import {
  LINKED_TO_A_ROW_PLACED_MANY_TIMES,
  LINKED_TO_AN_UNPLACED_ROW,
  USAGE_BASIS,
  USAGE_FIXTURES,
  USAGE_ITEMS,
} from "./support/usage-fixture-designs.js";
import type { UsageFixtureDesign } from "./support/usage-fixture-designs.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The usage reader against `usesItem`, one design at a time. The shared parity file compares totals over all fixtures,
 * where an error in one design can be cancelled by another's; here each stored design is its own case, and a generated
 * sweep of designs (some cabinets removed, tiers and handles varied) is held to the same two relations:
 *
 * - the walk answers exactly what `usesItem` says of the migrated design, for a colour, a handle and a built-in accessory;
 * - the stored-document model of each SQL statement's condition never says "not used" where `usesItem` says "used", since
 *   a missed use is the one error that would let a used tier or linked accessory be deleted. (The model is TypeScript
 *   written from the statement's own condition: the live file runs the SQL itself.)
 */
const STORED = USAGE_FIXTURES.filter(
  ({ isDeletedByClient }) => !isDeletedByClient,
);

const WALKED_ITEMS: readonly ItemRef[] = USAGE_ITEMS.filter(
  (item) =>
    item.kind === "finish" ||
    item.kind === "handle" ||
    (item.kind === "accessory" &&
      (item.accessoryId === "sinkProtectiveCover" ||
        item.accessoryId === "dishDryingRack")),
);

const SQL_ITEMS: readonly ItemRef[] = USAGE_ITEMS.filter(
  (item) => !WALKED_ITEMS.includes(item),
);

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

function fixtureNamed(name: string): UsageFixtureDesign {
  const found = USAGE_FIXTURES.find((fixture) => fixture.name === name);
  if (found === undefined) throw new Error(`no fixture named ${name}`);
  return found;
}

function migrated(fixture: UsageFixtureDesign): Design {
  return migrateDesign(fixture.schemaVersion, fixture.document);
}

function isUsed(design: Design, item: ItemRef): boolean {
  return usesItem({ design, item, ...USAGE_BASIS });
}

function probeOf(item: ItemRef): ItemUsageProbe {
  const [probe] = usageProbesFor([item], USAGE_BASIS);
  if (probe === undefined) throw new Error("no probe");
  return probe;
}

/** What the tier and placed-bodies statements' conditions say of one stored document. */
function sqlModelSaysUsed(probe: ItemUsageProbe, document: unknown): boolean {
  if (probe.via === "settings-tier") {
    const key =
      probe.item.kind === "material" ? "materialTierId" : "hardwareTierId";
    const settings = (document as { settings?: Record<string, unknown> })
      .settings;
    const named =
      settings?.[key] ?? (probe.isFallback ? probe.item.tierId : null);
    return named === probe.item.tierId;
  }
  if (probe.via === "placed-bodies") {
    const { placements } = document as {
      placements?: readonly { body: { buildId: string } }[];
    };
    return (placements ?? []).some(({ body }) =>
      probe.buildIds.includes(body.buildId),
    );
  }
  throw new Error("not a probe the SQL counts");
}

async function walkedCountsOfOneDesign(
  schemaVersion: number,
  document: unknown,
): Promise<ReadonlyMap<string, number>> {
  resetQueryDriver();
  answerQueryWith([
    { id: "only-design", schema_version: schemaVersion, document },
  ]);
  const counts = (
    await newReader().countEach(usageProbesFor(WALKED_ITEMS, USAGE_BASIS))
  ).counts;
  return new Map(
    counts.map(({ item, designCount }) => [JSON.stringify(item), designCount]),
  );
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the fixtures separate what a count by a shortcut would confuse", () => {
  it("has a sink with a rack, a sink with no rack, and cabinets with no sink at all", () => {
    const withRack = migrated(
      fixtureNamed("the shipped kitchen, which names nothing"),
    );
    const topBoxHosts = migrated(
      fixtureNamed(
        "a sink whose lowest rack host is gone and whose top box above it still hosts the rack",
      ),
    );
    const noHost = migrated(
      fixtureNamed(
        "a sink with no wall cabinet over it at all, so a cover and no rack",
      ),
    );
    const noSink = migrated(
      fixtureNamed(
        "a kitchen with cabinets and no sink, so no cover and no rack",
      ),
    );
    const cover: ItemRef = {
      kind: "accessory",
      accessoryId: "sinkProtectiveCover",
    };
    const rack: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };

    expect([isUsed(withRack, cover), isUsed(withRack, rack)]).toEqual([
      true,
      true,
    ]);
    expect([isUsed(topBoxHosts, cover), isUsed(topBoxHosts, rack)]).toEqual([
      true,
      true,
    ]);
    expect([isUsed(noHost, cover), isUsed(noHost, rack)]).toEqual([
      true,
      false,
    ]);
    expect([isUsed(noSink, cover), isUsed(noSink, rack)]).toEqual([
      false,
      false,
    ]);
  });

  it("leaves a handle written on a cabinet that cannot wear one unused, and a colour on one likewise", () => {
    const handleOnPlainCabinet = migrated(
      fixtureNamed(
        "a kitchen whose only handle is written on a cabinet that cannot wear one",
      ),
    );

    expect(
      isUsed(handleOnPlainCabinet, { kind: "handle", handle: "steel" }),
    ).toBe(false);
  });

  it("has, for every kind of item, an item some design uses, and no item that every design uses", () => {
    const kinds = new Set(USAGE_ITEMS.map(({ kind }) => kind));
    const designsUsing = (item: ItemRef): number =>
      STORED.filter((fixture) => isUsed(migrated(fixture), item)).length;

    for (const kind of kinds) {
      const counts = USAGE_ITEMS.filter((item) => item.kind === kind).map(
        designsUsing,
      );
      expect(Math.max(...counts), `a ${kind} some design uses`).toBeGreaterThan(
        0,
      );
    }
    for (const item of USAGE_ITEMS) {
      expect(designsUsing(item), JSON.stringify(item)).toBeLessThan(
        STORED.length,
      );
    }
  });

  it("has an item of each kind but the three handles that no design uses", () => {
    for (const kind of ["material", "hardware", "finish", "accessory"]) {
      const counts = USAGE_ITEMS.filter((item) => item.kind === kind).map(
        (item) =>
          STORED.filter((fixture) => isUsed(migrated(fixture), item)).length,
      );
      expect(Math.min(...counts), `a ${kind} no design uses`).toBe(0);
    }
  });

  it("has a design that names no tier and one that names the fallback, both priced at it", () => {
    const fallbackMaterial: ItemRef = {
      kind: "material",
      tierId: USAGE_BASIS.book.material.defaultTierId,
    };
    const naming = STORED.filter(({ document }) =>
      JSON.stringify(document).includes(
        `"materialTierId":"${USAGE_BASIS.book.material.defaultTierId}"`,
      ),
    );
    const namingNone = STORED.filter(
      ({ document }) => !JSON.stringify(document).includes("materialTierId"),
    );

    expect(naming.length).toBeGreaterThan(0);
    expect(namingNone.length).toBeGreaterThan(0);
    for (const fixture of [...naming, ...namingNone]) {
      expect(isUsed(migrated(fixture), fallbackMaterial), fixture.name).toBe(
        true,
      );
    }
  });
});

describe("the walk, design by design", () => {
  it.each(STORED.map((fixture) => [fixture.name, fixture] as const))(
    "answers for %s what usesItem says of the migrated design, for every colour, handle and built-in accessory",
    async (_name, fixture) => {
      const counts = await walkedCountsOfOneDesign(
        fixture.schemaVersion,
        fixture.document,
      );

      for (const item of WALKED_ITEMS) {
        expect(counts.get(JSON.stringify(item)), JSON.stringify(item)).toBe(
          isUsed(migrated(fixture), item) ? 1 : 0,
        );
      }
    },
  );

  it("counts a legacy colour the migration rewrote as the colour it became, and not as the one stored", async () => {
    const legacy = fixtureNamed(
      "a kitchen that stored a legacy colour name on a cabinet",
    );
    const counts = await walkedCountsOfOneDesign(
      legacy.schemaVersion,
      legacy.document,
    );
    const colourItems = WALKED_ITEMS.filter((item) => item.kind === "finish");
    const namedAfterMigration = colourItems.filter((item) =>
      isUsed(migrated(legacy), item),
    );

    expect(
      colourItems.filter((item) => counts.get(JSON.stringify(item)) === 1),
    ).toEqual(namedAfterMigration);
    expect(JSON.stringify(legacy.document)).toContain('"finish":"white"');
    expect(colourItems.map((item) => JSON.stringify(item))).not.toContain(
      '{"kind":"finish","finishId":"white"}',
    );
  });
});

describe("the SQL conditions, design by design", () => {
  it.each(
    STORED.flatMap((fixture) =>
      SQL_ITEMS.map(
        (item) => [fixture.name, JSON.stringify(item), fixture, item] as const,
      ),
    ),
  )(
    "for %s and %s, the stored document is read as usesItem reads the migrated design",
    (_f, _i, fixture, item) => {
      const isUsedByDomain = isUsed(migrated(fixture), item);

      expect(sqlModelSaysUsed(probeOf(item), fixture.document)).toBe(
        isUsedByDomain,
      );
    },
  );

  it("counts the designs that place a row many times over as the designs that earn the accessory linked to it", () => {
    const item: ItemRef = {
      kind: "accessory",
      accessoryId: LINKED_TO_A_ROW_PLACED_MANY_TIMES,
    };
    const probe = probeOf(item);
    const placingMany = STORED.filter(({ document }) => {
      const { placements } = document as {
        placements: { body: { buildId: string } }[];
      };
      return (
        placements.filter(
          ({ body }) =>
            probe.via === "placed-bodies" &&
            probe.buildIds.includes(body.buildId),
        ).length > 1
      );
    });

    expect(placingMany.length).toBeGreaterThan(0);
    expect(
      STORED.filter(({ document }) => sqlModelSaysUsed(probe, document)).length,
    ).toBe(STORED.filter((fixture) => isUsed(migrated(fixture), item)).length);
  });

  it("leaves a linked accessory with no placement of its row unused by every design", () => {
    const item: ItemRef = {
      kind: "accessory",
      accessoryId: LINKED_TO_AN_UNPLACED_ROW,
    };

    expect(STORED.some((fixture) => isUsed(migrated(fixture), item))).toBe(
      false,
    );
  });
});

describe("a generated sweep of designs", () => {
  const BOOK_MATERIALS = USAGE_BASIS.book.material.tiers.map(
    ({ tierId }) => tierId,
  );
  const BOOK_HARDWARE = USAGE_BASIS.book.hardware.tiers.map(
    ({ tierId }) => tierId,
  );
  const PLACEMENT_IDS = KITCHEN_L_DESIGN.placements.map(({ id }) => id);

  const generatedDesign = fc.record({
    removed: fc.subarray(PLACEMENT_IDS),
    material: fc.option(fc.constantFrom(...BOOK_MATERIALS), { nil: undefined }),
    hardware: fc.option(fc.constantFrom(...BOOK_HARDWARE), { nil: undefined }),
    colour: fc.option(fc.constantFrom(...PALETTE_ENTRY_IDS), {
      nil: undefined,
    }),
  });

  function documentOfGenerated(spec: {
    removed: readonly string[];
    material: string | undefined;
    hardware: string | undefined;
    colour: (typeof PALETTE_ENTRY_IDS)[number] | undefined;
  }): unknown {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        ({ id }) => !spec.removed.includes(id),
      ),
      settings: {
        cabinetDepthMm: 600,
        ...(spec.material === undefined
          ? {}
          : { materialTierId: spec.material }),
        ...(spec.hardware === undefined
          ? {}
          : { hardwareTierId: spec.hardware }),
        ...(spec.colour === undefined
          ? {}
          : { finish: paletteFinish(spec.colour) }),
      },
    };
    return JSON.parse(JSON.stringify(design)) as unknown;
  }

  function migratedOrUndefined(document: unknown): Design | undefined {
    try {
      return migrateDesign(5, document);
    } catch {
      return undefined;
    }
  }

  it("holds both relations for every design the product reads", async () => {
    let readableDesigns = 0;
    await fc.assert(
      fc.asyncProperty(generatedDesign, async (spec) => {
        const document = documentOfGenerated(spec);
        const design = migratedOrUndefined(document);
        fc.pre(design !== undefined);
        readableDesigns += 1;

        const counts = await walkedCountsOfOneDesign(5, document);
        for (const item of WALKED_ITEMS) {
          expect(counts.get(JSON.stringify(item))).toBe(
            isUsed(design, item) ? 1 : 0,
          );
        }
        for (const item of SQL_ITEMS) {
          expect(
            sqlModelSaysUsed(probeOf(item), document),
            JSON.stringify(item),
          ).toBe(isUsed(design, item));
        }
      }),
      { seed: 20261104, numRuns: 150 },
    );

    expect(readableDesigns).toBeGreaterThan(30);
  });
});
