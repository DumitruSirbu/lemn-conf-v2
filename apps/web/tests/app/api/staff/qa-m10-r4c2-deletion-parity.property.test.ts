import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  defaultItemsOf,
  isSameItem,
  type DraftChange,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe } from "@lemnaria/persistence";

import { PUT } from "@/app/api/staff/prices/draft/route";
import { judgeDraft } from "@/price-dashboard/draft-judgement";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  putDefaults,
  saveBody,
} from "../../../support/kitchen-defaults-route-world";
import {
  changeRequest,
  currentDraftRevision,
  readUsage,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { revertAs } from "../../../support/creation-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import { linkedAccessory } from "../../../support/wide-price-book";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

vi.mock("@/lib/server/price-dashboard/shipped-catalogue", async (original) => {
  const real =
    await original<
      typeof import("@/lib/server/price-dashboard/shipped-catalogue")
    >();
  return { ...real, shippedCatalogue: vi.fn(real.shippedCatalogue) };
});

const { shippedCatalogue } = await import(
  "@/lib/server/price-dashboard/shipped-catalogue"
);
const shippedCatalogueMock = vi.mocked(shippedCatalogue);
const realShippedCatalogue = shippedCatalogueMock.getMockImplementation();

/**
 * R4c2's parity sweeps. A deletion the route accepts is one `applyChanges` and `judgeDraft` accept; the default and the
 * count it judged by agree with the usage route's count and with `defaultItemsOf` for every deletable kind; and the
 * probes the pre-check asks are the usage route's, with only the deliberate difference (a linked accessory's own row).
 * Seed fixed so that a red run replays: 20261109.
 */

const SEED = 20_261_109;
const NUM_RUNS = 60;

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    linkedAccessory("plinth-light"),
    linkedAccessory("under-lights"),
  ],
};
const MATERIALS: readonly ItemRef[] = BOOK.material.tiers.map(({ tierId }) => ({
  kind: "material",
  tierId,
}));
const HARDWARE: readonly ItemRef[] = BOOK.hardware.tiers.map(({ tierId }) => ({
  kind: "hardware",
  tierId,
}));
const ACCESSORIES: readonly ItemRef[] = BOOK.linkedAccessories.map(
  ({ accessoryId }) => ({ kind: "accessory", accessoryId }),
);
const ROWS: readonly ItemRef[] = [...MATERIALS, ...HARDWARE, ...ACCESSORIES];
const DESIGN_SLOTS = 5;

function present<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error("the sweep indexed past a list");
  return value;
}

let prices: PriceDashboardWorld;
let cookie: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  cookie = (
    await signedInAs({ role: "administrator" }, "administrator@example.test")
  ).session.cookie;
});

afterEach(() => {
  if (realShippedCatalogue !== undefined) {
    shippedCatalogueMock.mockImplementation(realShippedCatalogue);
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface DesignShape {
  readonly uses: readonly number[];
  readonly isDeletedByClient: boolean;
  readonly isUnreadable: boolean;
}

const designShape = fc.record({
  uses: fc.uniqueArray(fc.integer({ min: 0, max: ROWS.length - 1 }), {
    maxLength: 3,
  }),
  isDeletedByClient: fc.boolean(),
  isUnreadable: fc.boolean(),
});

const worldShape = fc.record({
  designs: fc.array(designShape, { maxLength: DESIGN_SLOTS }),
  savedMaterial: fc.integer({ min: 0, max: MATERIALS.length - 1 }),
  savedHardware: fc.integer({ min: 0, max: HARDWARE.length - 1 }),
  target: fc.integer({ min: 0, max: ROWS.length - 1 }),
});

/** Sets the designs of the world to `shapes`: a slot beyond them is planted as a design its client deleted, using nothing. */
function plantDesigns(shapes: readonly DesignShape[]): void {
  for (let slot = 0; slot < DESIGN_SLOTS; slot += 1) {
    const shape = shapes[slot];
    prices.designs.plant({
      designId: `slot-${String(slot)}`,
      uses:
        shape === undefined
          ? []
          : shape.uses.map((index) => present(ROWS[index])),
      isDeletedByClient: shape === undefined ? true : shape.isDeletedByClient,
      isUnreadable: shape?.isUnreadable ?? false,
    });
  }
}

/** Asks the route to save the two tiers as the defaults; the sweep reads back what the store holds, whatever it answered. */
async function saveDefaultsNaming(
  material: ItemRef,
  hardware: ItemRef,
): Promise<void> {
  await putDefaults({
    cookie,
    json: await saveBody({
      materialTierId: (material as { tierId: string }).tierId,
      hardwareTierId: (hardware as { tierId: string }).tierId,
    }),
  });
}

async function deleteRow(item: ItemRef): Promise<Response> {
  return PUT(
    changeRequest({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: { kind: "item-deleted", item }, value: true },
      },
    }),
  );
}

async function usageOf(item: ItemRef): Promise<number> {
  const answer = await readUsage({ cookie, json: { items: [item] } });
  const body = (await jsonOf(answer)) as { counts?: { count: number }[] };
  const [first] = body.counts ?? [];
  if (first === undefined) {
    throw new Error(`usage unreadable: ${JSON.stringify(body)}`);
  }
  return first.count;
}

describe("a deletion the route accepts, over any world of designs and saved defaults", () => {
  it("is the one the domain accepts, and the answer is the default's, then the count's: agreeing with defaultItemsOf and the usage route", async () => {
    const seen = { isDefault: 0, isInUse: 0, isAccepted: 0, savedByRoute: 0 };
    await fc.assert(
      fc.asyncProperty(worldShape, async (world) => {
        plantDesigns(world.designs);
        const material = present(MATERIALS[world.savedMaterial]);
        const hardware = present(HARDWARE[world.savedHardware]);
        await saveDefaultsNaming(material, hardware);
        const target = present(ROWS[world.target]);
        const held = await prices.stores.defaults.read();
        const savedDefaults: NewKitchenSettings | Record<string, never> =
          held.kind === "saved"
            ? (held.saved.defaults as NewKitchenSettings)
            : {};
        if (held.kind === "saved") seen.savedByRoute += 1;
        const isDefault = defaultItemsOf({
          book: BOOK,
          defaults: savedDefaults,
        }).some((item) => isSameItem(item, target));
        const usedBy = await usageOf(target);

        const answer = await deleteRow(target);

        const stored = (await prices.stores.priceBook.readDraft()).changes;
        if (isDefault) seen.isDefault += 1;
        else if (usedBy > 0) seen.isInUse += 1;
        else seen.isAccepted += 1;
        if (isDefault) {
          expect(answer.status).toBe(400);
          expect(await jsonOf(answer)).toEqual({
            status: "invalid-input",
            issues: [{ field: "change", code: "ITEM_IS_DEFAULT" }],
          });
        } else if (usedBy > 0) {
          expect(answer.status).toBe(400);
          expect(await jsonOf(answer)).toEqual({
            status: "invalid-input",
            issues: [{ field: "change", code: "ITEM_IN_USE" }],
          });
        } else {
          expect(answer.status).toBe(200);
          const changes = stored as readonly DraftChange[];
          expect(applyChanges(BOOK, changes).ok).toBe(true);
          expect(
            judgeDraft({ book: BOOK, changes, firstNewIndex: 0, stored: [] }),
          ).toEqual({ kind: "applies" });
          const reverted = await revertAs(cookie, {
            kind: "change",
            address: { kind: "item-deleted", item: target },
          });
          expect(reverted.status).toBe(200);
        }
        if (isDefault || usedBy > 0) expect(stored).toEqual([]);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    // Each of the three answers was reached, or the sweep proved nothing about it.
    expect(seen.isDefault).toBeGreaterThan(0);
    expect(seen.isInUse).toBeGreaterThan(0);
    expect(seen.isAccepted).toBeGreaterThan(0);
    expect(seen.savedByRoute).toBeGreaterThan(0);
  }, 60_000);
});

describe("the probes the pre-check asks, against the probes the usage route asks", () => {
  type Probe = ItemUsageProbe;

  async function probesOfUsageRoute(item: ItemRef): Promise<Probe[]> {
    const asked: Probe[] = [];
    const spy = vi
      .spyOn(prices.defaults, "countEach")
      .mockImplementation((probes) => {
        asked.push(...probes);
        return Promise.resolve({
          counts: probes.map((probe) => ({ item: probe.item, designCount: 0 })),
          unreadableDesigns: 0,
        });
      });
    const answer = await readUsage({ cookie, json: { items: [item] } });
    spy.mockRestore();
    expect(answer.status, JSON.stringify(await jsonOf(answer))).toBe(200);
    return asked;
  }

  async function probesOfPreCheck(item: ItemRef): Promise<Probe[]> {
    const asked: Probe[] = [];
    const spy = vi
      .spyOn(prices.defaults, "countEach")
      .mockImplementation((probes) => {
        asked.push(...probes);
        return Promise.resolve({
          counts: probes.map((probe) => ({ item: probe.item, designCount: 0 })),
          unreadableDesigns: 0,
        });
      });
    const answer = await deleteRow(item);
    spy.mockRestore();
    if (answer.status === 200) {
      await revertAs(cookie, {
        kind: "change",
        address: { kind: "item-deleted", item },
      });
    }
    return asked;
  }

  function shapeOf(probe: Probe): unknown {
    const { via, item } = probe;
    if (probe.via === "settings-tier")
      return { via, item, isFallback: probe.isFallback };
    if (probe.via === "placed-bodies")
      return { via, item, buildIds: [...probe.buildIds].sort() };
    return { via, item };
  }

  it.each(ROWS.map((item) => [JSON.stringify(item), item] as const))(
    "of %s are the same probe in both, the pre-check's never asking less than the usage route's",
    async (_name, item) => {
      const fromUsage = (await probesOfUsageRoute(item)).map(shapeOf);
      const fromCheck = (await probesOfPreCheck(item)).map(shapeOf);

      if (fromCheck.length === 0) {
        // The fixed default tiers are refused before any count: the usage route's probe is then the only one.
        expect(fromUsage.length).toBeGreaterThan(0);
        return;
      }
      expect(fromCheck).toHaveLength(1);
      const [fromUsageProbe] = fromUsage as {
        via: string;
        buildIds?: string[];
      }[];
      const [fromCheckProbe] = fromCheck as {
        via: string;
        buildIds?: string[];
      }[];
      expect(fromCheckProbe?.via).toBe(fromUsageProbe?.via);
      if (fromUsageProbe?.buildIds !== undefined) {
        for (const buildId of fromUsageProbe.buildIds) {
          expect(fromCheckProbe?.buildIds).toContain(buildId);
        }
      } else {
        expect(fromCheck).toEqual(fromUsage);
      }
    },
  );

  it("of a linked accessory whose row the catalogue no longer prices: the usage route asks of no build id, the pre-check also asks of the rule's own row", async () => {
    const linkedRow = present(BOOK.linkedAccessories[0]).linkedBuildId;
    const full = realShippedCatalogue?.() ?? new Map();
    shippedCatalogueMock.mockImplementation(
      () =>
        new Map(
          [...full].filter(([buildId]) => buildId !== linkedRow),
        ) as never,
    );
    const item = present(ACCESSORIES[0]);

    const fromUsage = (await probesOfUsageRoute(item)).map(shapeOf) as {
      buildIds: string[];
    }[];
    const fromCheck = (await probesOfPreCheck(item)).map(shapeOf) as {
      buildIds: string[];
    }[];

    expect(fromUsage[0]?.buildIds).toEqual([]);
    expect(fromCheck[0]?.buildIds).toEqual([linkedRow]);
  });

  it("of a deletion are never a count of the walk over every design, for any row", async () => {
    for (const item of ROWS) {
      const probes = await probesOfPreCheck(item);
      for (const probe of probes) expect(probe.via).not.toBe("migrated-design");
    }
  });
});
