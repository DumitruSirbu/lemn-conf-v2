// Adversarial QA for `clearHandle`. The wave's own file samples four cabinets; this one walks every cabinet of two
// shipped kitchens against every kitchen handle setting, because the panel reads the module line from a frame in
// metres and the price from the placement's whole millimetres, and a sample can miss the one cabinet where they part.
import { describe, expect, it } from "vitest";

import {
  clearFinish,
  clearHandle,
  setHandle,
} from "../../src/commands/set-appearance.js";
import {
  cabinetDepthMmOf,
  countHardwareMechanisms,
  HandleSchema,
  isTopRowFloorMm,
  KITCHEN_L_BODY_CATALOG,
  projectDesignForDisplay,
  type Design,
  type DisplayEntry,
  type Finish,
  type Handle,
  type KitchenHandleSettings,
} from "../../src/index.js";
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  migrateDesign,
  CURRENT_SCHEMA_VERSION,
} from "../../src/migrate-design.js";
import { kitchenHandleSettingsOf } from "../../src/kitchen-handle/index.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  derivePlacementRecords,
  type BodyCatalog,
} from "../../src/void-engine.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { OCCURRED_AT } from "../support/commands.js";
import { composeU } from "../support/generated-u.js";
import { createWorld } from "../support/kitchen-world.js";
import { uRoom } from "../support/u-plan-fixtures.js";
import {
  DEEPENING_ROWS,
  STANDARD_HARDWARE_ID,
} from "../price-dashboard/m2-support.js";

const HANDLES: readonly Handle[] = HandleSchema.options;
const UNSET = undefined;
const KITCHEN_SETTINGS: readonly KitchenHandleSettings[] = [
  UNSET,
  ...HANDLES,
].flatMap((handle) =>
  [UNSET, ...HANDLES].map((topRowHandle) => ({
    ...(handle === UNSET ? {} : { handle }),
    ...(topRowHandle === UNSET ? {} : { topRowHandle }),
  })),
);
const LATER_CLOCK = "2026-12-01T08:30:00.000Z";

interface Kitchen {
  readonly name: string;
  readonly design: Design;
  readonly catalog: BodyCatalog;
}

const generatedU = composeU(uRoom(3600, 3500, 4000)).design;
const SHIPPED_L: Kitchen = {
  name: "the shipped L",
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
};
const KITCHENS: readonly Kitchen[] = [
  SHIPPED_L,
  {
    name: "a generated U",
    design: generatedU,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(generatedU)),
  },
];

function withoutOwnHandles(
  design: Design,
  settings: KitchenHandleSettings,
): Design {
  const kitchen = { ...design.settings };
  delete kitchen.handle;
  delete kitchen.topRowHandle;
  return {
    ...design,
    settings: { ...kitchen, ...settings },
    placements: design.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.handle;
      return { ...placement, body };
    }),
  };
}

function setting(
  kitchen: Kitchen,
  design: Design,
  id: string,
  handle: Handle,
): Design {
  const result = setHandle({
    design,
    catalog: kitchen.catalog,
    target: { kind: "placement", id },
    handle,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`fixture: ${id} ${result.reason.code}`);
  return result.design;
}

function clearing(kitchen: Kitchen, design: Design, id: string): Design {
  const result = clearHandle({
    design,
    catalog: kitchen.catalog,
    target: { kind: "placement", id },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`fixture: ${id} ${result.reason.code}`);
  return result.design;
}

function entryOf(kitchen: Kitchen, design: Design, id: string): DisplayEntry {
  const entry = projectDesignForDisplay(design, kitchen.catalog)
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.placementId === id);
  if (!entry) throw new Error(`fixture: no entry for ${id}`);
  return entry;
}

function panelDefaultOf(
  kitchen: Kitchen,
  design: Design,
  id: string,
): Handle | undefined {
  const world = createWorld(design, kitchen.catalog);
  return describeSelection({
    records: world.records,
    voids: world.voids,
    catalog: kitchen.catalog,
    target: { kind: "placement", id },
    kitchenSettings: kitchenHandleSettingsOf(design.settings),
  })?.defaultHandle;
}

function handleTakers(kitchen: Kitchen): readonly string[] {
  return derivePlacementRecords(kitchen.design, kitchen.catalog)
    .filter((record) => record.canHandle)
    .map((record) => record.id);
}

function handleRefusers(kitchen: Kitchen): readonly string[] {
  return derivePlacementRecords(kitchen.design, kitchen.catalog)
    .filter((record) => !record.canHandle)
    .map((record) => record.id);
}

function totalOf(kitchen: Kitchen, design: Design): number {
  const result = priceDesign({
    design,
    catalog: kitchen.catalog,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: { hardwareTierId: STANDARD_HARDWARE_ID },
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(result.failure.detail);
  return result.priced.totalMinor;
}

describe.each(KITCHENS)(
  "every cabinet of $name, under every kitchen handle setting",
  (kitchen) => {
    it("has handle-taking cabinets and handle-refusing ones, or the sweep below proves nothing", () => {
      expect(handleTakers(kitchen).length).toBeGreaterThan(5);
      expect(
        handleRefusers(kitchen).length + handleTakers(kitchen).length,
      ).toBe(kitchen.design.placements.length);
    });

    it("covers both sides of the module line, or the top row is not under test", () => {
      const takers = new Set(handleTakers(kitchen));
      const floors = kitchen.design.placements
        .filter((placement) => takers.has(placement.id))
        .map((placement) => isTopRowFloorMm(placement.y0Mm));

      expect(floors).toContain(true);
      expect(floors).toContain(false);
    });

    it("agrees across price, panel and the worn handle after any set and a clear", () => {
      const disagreements: string[] = [];
      for (const settings of KITCHEN_SETTINGS) {
        const untouched = withoutOwnHandles(kitchen.design, settings);
        for (const id of handleTakers(kitchen)) {
          const expectedWorn = entryOf(kitchen, untouched, id).wornHandle;
          for (const own of HANDLES) {
            const cleared = clearing(
              kitchen,
              setting(kitchen, untouched, id, own),
              id,
            );
            const worn = entryOf(kitchen, cleared, id).wornHandle;
            const offered = panelDefaultOf(kitchen, cleared, id);
            if (
              worn !== expectedWorn ||
              offered !== worn ||
              cleared.placements.some((p) => p.id === id && "handle" in p.body)
            ) {
              disagreements.push(
                `${id} kitchen=${JSON.stringify(settings)} own=${own}: worn=${String(worn)} expected=${String(expectedWorn)} panel=${String(offered)}`,
              );
            }
          }
        }
      }
      expect(disagreements).toEqual([]);
    });

    it("returns the mechanisms and the bill of a cabinet that never chose, for every setting", () => {
      const disagreements: string[] = [];
      for (const settings of KITCHEN_SETTINGS) {
        const untouched = withoutOwnHandles(kitchen.design, settings);
        const untouchedTotal = totalOf(kitchen, untouched);
        for (const id of handleTakers(kitchen)) {
          const cleared = clearing(
            kitchen,
            setting(kitchen, untouched, id, "black"),
            id,
          );
          const mechanisms = countHardwareMechanisms(
            [entryOf(kitchen, cleared, id)],
            kitchen.catalog,
          );
          const expected = countHardwareMechanisms(
            [entryOf(kitchen, untouched, id)],
            kitchen.catalog,
          );
          if (
            JSON.stringify(mechanisms) !== JSON.stringify(expected) ||
            totalOf(kitchen, cleared) !== untouchedTotal
          ) {
            disagreements.push(`${id} kitchen=${JSON.stringify(settings)}`);
          }
        }
      }
      expect(disagreements).toEqual([]);
    });

    it("leaves every other cabinet and the kitchen's own settings equal to the input, whichever cabinet is cleared", () => {
      const wearing = kitchen.design.placements.reduce(
        (design, placement) =>
          handleTakers(kitchen).includes(placement.id)
            ? setting(kitchen, design, placement.id, "black")
            : design,
        withoutOwnHandles(kitchen.design, {
          handle: "steel",
          topRowHandle: "steel",
        }),
      );
      for (const id of handleTakers(kitchen)) {
        const cleared = clearing(kitchen, wearing, id);

        expect(cleared.settings).toEqual(wearing.settings);
        expect(cleared.placements.filter((p) => p.id !== id)).toEqual(
          wearing.placements.filter((p) => p.id !== id),
        );
        expect(
          cleared.placements.find((p) => p.id === id)?.body,
        ).not.toHaveProperty("handle");
      }
    });

    it("refuses every cabinet whose definition takes no handle, handing the design back by identity", () => {
      for (const id of handleRefusers(kitchen)) {
        const result = clearHandle({
          design: kitchen.design,
          catalog: kitchen.catalog,
          target: { kind: "placement", id },
          occurredAt: OCCURRED_AT,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason.code).toBe("HANDLE_NOT_SUPPORTED");
        expect(result.design).toBe(kitchen.design);
      }
    });
  },
);

describe("clearHandle against clearFinish, case for case", () => {
  const input = {
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    occurredAt: LATER_CLOCK,
  };
  const records = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  );
  const canFinishNotHandle = records.find(
    (record) => record.canFinish && !record.canHandle,
  );
  const canHandleNotFinish = records.find(
    (record) => record.canHandle && !record.canFinish,
  );

  it.each([
    ["an unknown placement", { kind: "placement", id: "nope" }],
    ["a void", { kind: "void", id: "nope" }],
  ] as const)(
    "answers %s with the refusal clearFinish gives",
    (_name, target) => {
      const finish = clearFinish({ ...input, target });
      const handle = clearHandle({ ...input, target });

      expect(handle.ok).toBe(false);
      expect(finish.ok).toBe(false);
      if (handle.ok || finish.ok) return;
      expect(handle.reason).toEqual(finish.reason);
      expect(handle.design).toBe(KITCHEN_L_DESIGN);
    },
  );

  it("asks its own capability: a body that finishes but takes no handle is refused here and not by clearFinish", () => {
    if (!canFinishNotHandle)
      throw new Error("fixture: no body finishes without a handle");
    const target = { kind: "placement", id: canFinishNotHandle.id } as const;

    expect(clearFinish({ ...input, target }).ok).toBe(true);
    const handle = clearHandle({ ...input, target });
    expect(handle.ok).toBe(false);
    if (handle.ok) return;
    expect(handle.reason.code).toBe("HANDLE_NOT_SUPPORTED");
  });

  it("does not ask the finish capability: a body that takes a handle but no finish is cleared", () => {
    if (!canHandleNotFinish) return;
    const target = { kind: "placement", id: canHandleNotFinish.id } as const;

    expect(clearHandle({ ...input, target }).ok).toBe(true);
    expect(clearFinish({ ...input, target }).ok).toBe(false);
  });

  const coloured: Finish = { kind: "free-colour", value: "#336699" };

  function wearingBothOnP0(): Design {
    const kitchen = SHIPPED_L;
    const withHandle = setting(kitchen, KITCHEN_L_DESIGN, "p0", "push");
    return {
      ...withHandle,
      placements: withHandle.placements.map((placement) =>
        placement.id === "p0"
          ? { ...placement, body: { ...placement.body, finish: coloured } }
          : placement,
      ),
    };
  }

  it("moves the same fields of the document as clearFinish does, and no others", () => {
    const target = { kind: "placement", id: "p0" } as const;
    const wearingBoth = wearingBothOnP0();
    const finish = clearFinish({ ...input, design: wearingBoth, target });
    const handle = clearHandle({ ...input, design: wearingBoth, target });
    if (!finish.ok || !handle.ok)
      throw new Error("fixture: both should succeed");

    const movedBy = (after: Design) =>
      (Object.keys(after) as (keyof Design)[]).filter(
        (key) =>
          JSON.stringify(after[key]) !== JSON.stringify(wearingBoth[key]),
      );
    expect(movedBy(handle.design).sort()).toEqual(["placements", "updatedAt"]);
    expect(movedBy(handle.design).sort()).toEqual(
      movedBy(finish.design).sort(),
    );
    expect(handle.design.updatedAt).toBe(LATER_CLOCK);
    expect(handle.design.room).toBe(wearingBoth.room);
    expect(handle.design.settings).toBe(wearingBoth.settings);
  });

  it("keeps the colour a cabinet wears when its handle is cleared, and the handle when its colour is", () => {
    const target = { kind: "placement", id: "p0" } as const;
    const wearingBoth = wearingBothOnP0();
    const bodyOf = (design: Design) =>
      design.placements.find((placement) => placement.id === "p0")?.body;

    const handleCleared = clearHandle({
      ...input,
      design: wearingBoth,
      target,
    });
    const finishCleared = clearFinish({
      ...input,
      design: wearingBoth,
      target,
    });
    if (!handleCleared.ok || !finishCleared.ok)
      throw new Error("fixture: both should succeed");

    expect(bodyOf(handleCleared.design)?.finish).toEqual(coloured);
    expect(bodyOf(finishCleared.design)?.handle).toBe("push");
  });
});

describe("a cleared design saved and resumed", () => {
  it.each(KITCHEN_SETTINGS)(
    "keeps the key absent through the real load seam under kitchen %j",
    (settings) => {
      const kitchen = SHIPPED_L;
      const start = withoutOwnHandles(kitchen.design, settings);
      const cleared = clearing(
        kitchen,
        setting(kitchen, start, "p15", "steel"),
        "p15",
      );

      const resumed = migrateDesign(
        CURRENT_SCHEMA_VERSION,
        JSON.parse(JSON.stringify(cleared)),
      );

      expect(
        resumed.placements.find((p) => p.id === "p15")?.body,
      ).not.toHaveProperty("handle");
      expect(resumed).toEqual(cleared);
      expect(entryOf(kitchen, resumed, "p15").wornHandle).toBe(
        entryOf(kitchen, start, "p15").wornHandle,
      );
    },
  );

  it("reads a stored legacy null handle as no choice, and a clear removes the key all the same", () => {
    const kitchen = SHIPPED_L;
    const stored = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((p) =>
        p.id === "p0" ? { ...p, body: { ...p.body, handle: null } } : p,
      ),
    } as unknown as Design;

    const cleared = clearing(kitchen, stored, "p0");

    expect(
      cleared.placements.find((p) => p.id === "p0")?.body,
    ).not.toHaveProperty("handle");
  });
});
