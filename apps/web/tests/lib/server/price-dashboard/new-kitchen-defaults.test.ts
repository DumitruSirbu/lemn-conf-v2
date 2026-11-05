import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  declaredCabinetDepthsMm,
  DEFAULT_HANDLE,
  fixedDefaultItemsOf,
  freeColourFinish,
  HandleSchema,
  isItemDisabled,
  isItemOffered,
  isSameItem,
  lookUpMaterial,
  materialOffersFinish,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  TOP_ROW_HANDLE,
  type Finish,
  type ItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import {
  completedDefaultsOf,
  readKitchenDefaultsForAdmittedPage,
  readNewKitchenDefaults,
} from "@/lib/server/price-dashboard/new-kitchen-defaults";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  disabledNow,
  saveDefaults,
  trySaveDefaults,
  writeWithoutJudgement,
} from "../../../support/availability-route-world";
import { FIXED_DEFAULTS } from "../../../support/kitchen-defaults-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";

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

/**
 * What a new kitchen starts from, over the persistence package's fakes: the one completion, the page's read of the saved
 * defaults as stored, and the customer's read of them as judged against what is on offer now.
 */

const FIXED_MATERIAL = "material.melamine";
const FIXED_HARDWARE = "hardware.standard";
const VENEER = "material.veneer";
const MATERIAL_IDS = [
  "material.melamine",
  "material.painted-mdf",
  "material.veneer",
  "material.unheard-of",
];
const HARDWARE_IDS = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
  "hardware.unheard-of",
];
const FINISHES: readonly Finish[] = [
  ...MATERIALS.flatMap((material) => paletteEntriesOf(material)).map(
    ({ entryId }) => paletteFinish(entryId),
  ),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#112233"),
];

/** Every partial row: each of the six keys present or absent, so `{}` is one of them. */
function partialRows(
  materialIds: readonly string[],
  hardwareIds: readonly string[],
) {
  return fc.record(
    {
      materialTierId: fc.constantFrom(...materialIds),
      hardwareTierId: fc.constantFrom(...hardwareIds),
      cabinetDepthMm: fc.constantFrom(...declaredCabinetDepthsMm()),
      finish: fc.constantFrom(...FINISHES),
      handle: fc.constantFrom(...HandleSchema.options),
      topRowHandle: fc.constantFrom(...HandleSchema.options),
    },
    { requiredKeys: [] },
  );
}

const savedRows = partialRows(MATERIAL_IDS, HARDWARE_IDS);
const savedRowsOfStatedTiers = partialRows(
  MATERIAL_IDS.slice(0, 3),
  HARDWARE_IDS.slice(0, 3),
);

/** What a judged switch can turn off: the fixed defaults never are, so a state that has one off is not one to test. */
const SWITCHABLE: readonly ItemRef[] = [
  ...MATERIAL_IDS.slice(0, 3).map((tierId) => ({
    kind: "material" as const,
    tierId,
  })),
  ...HARDWARE_IDS.slice(0, 3).map((tierId) => ({
    kind: "hardware" as const,
    tierId,
  })),
  ...HandleSchema.options.map((handle) => ({
    kind: "handle" as const,
    handle,
  })),
  ...FINISHES.flatMap((finish) =>
    finish.kind === "palette-entry"
      ? [{ kind: "finish" as const, finishId: finish.entryId }]
      : [],
  ),
];
const isFixedDefault = (item: ItemRef): boolean =>
  fixedDefaultItemsOf(ANCHORED_BOOK).some((fixed) => isSameItem(fixed, item));
const switchedOff = fc.subarray(
  SWITCHABLE.filter((item) => !isFixedDefault(item)),
  { maxLength: 8 },
);

let prices: PriceDashboardWorld;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function isOfferedBy(materialTierId: string, finish: Finish): boolean {
  const lookup = lookUpMaterial(materialTierId);
  return lookup.kind === "undeclared"
    ? true
    : materialOffersFinish(lookup.material, finish);
}

function defaultFinishOf(materialTierId: string): Finish {
  const lookup = lookUpMaterial(materialTierId);
  return lookup.kind === "declared"
    ? lookup.material.defaultFinish
    : paletteFinish("pal.alb");
}

function isColourOfItsMaterial(settings: {
  materialTierId: string;
  finish: Finish;
}): boolean {
  return isOfferedBy(settings.materialTierId, settings.finish);
}

function failNoMaterial(): never {
  throw new Error("the first material offers a palette of at least two");
}

function linesWritten(): readonly unknown[][] {
  return logged.mock.calls;
}

describe("the completion of a saved row", () => {
  it("is the fixed fallbacks for a row that names nothing", () => {
    expect(completedDefaultsOf({}, ANCHORED_BOOK)).toEqual({
      materialTierId: FIXED_MATERIAL,
      hardwareTierId: FIXED_HARDWARE,
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: DEFAULT_HANDLE,
      topRowHandle: TOP_ROW_HANDLE,
    });
  });

  it("takes the colour of the material it stamps when the row names a material and no colour", () => {
    const completed = completedDefaultsOf(
      { materialTierId: VENEER },
      ANCHORED_BOOK,
    );

    expect(completed.finish).toEqual(paletteFinish("veneer.stejar"));
  });

  it("takes the book's own default tiers, not the sample's, when the book names others", () => {
    const [, otherHardware] = ANCHORED_BOOK.hardware.tiers;
    const book = {
      ...ANCHORED_BOOK,
      hardware: {
        ...ANCHORED_BOOK.hardware,
        defaultTierId: otherHardware?.tierId ?? "",
      },
    };

    expect(completedDefaultsOf({}, book).hardwareTierId).toBe(
      otherHardware?.tierId,
    );
  });

  it("carries all six keys for every partial row, keeps each key it holds, and takes every absent key from the fallbacks", () => {
    fc.assert(
      fc.property(savedRows, (saved) => {
        const completed = completedDefaultsOf(saved, ANCHORED_BOOK);

        const label = JSON.stringify({ saved, completed });
        expect(Object.keys(completed).sort(), label).toEqual(
          Object.keys(FIXED_DEFAULTS).sort(),
        );
        expect(completed.materialTierId, label).toBe(
          saved.materialTierId ?? FIXED_MATERIAL,
        );
        expect(completed.hardwareTierId, label).toBe(
          saved.hardwareTierId ?? FIXED_HARDWARE,
        );
        expect(completed.cabinetDepthMm, label).toBe(
          saved.cabinetDepthMm ?? 600,
        );
        expect(completed.handle, label).toBe(saved.handle ?? DEFAULT_HANDLE);
        expect(completed.topRowHandle, label).toBe(
          saved.topRowHandle ?? TOP_ROW_HANDLE,
        );
        expect(isColourOfItsMaterial(completed), label).toBe(true);
        if (saved.finish !== undefined) {
          expect(completed.finish, label).toEqual(
            isOfferedBy(completed.materialTierId, saved.finish)
              ? saved.finish
              : defaultFinishOf(completed.materialTierId),
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("the page's read of the defaults", () => {
  it("is nothing saved, with the fixed fallbacks, one head, and the book's tiers", async () => {
    const page = await readKitchenDefaultsForAdmittedPage();

    expect(page?.state).toMatchObject({
      revision: "0",
      saved: false,
      defaults: FIXED_DEFAULTS,
    });
    expect(page?.materials.map(({ tierId }) => tierId)).toEqual(
      ANCHORED_BOOK.material.tiers.map(({ tierId }) => tierId),
    );
    expect(page?.hardware.map(({ tierId }) => tierId)).toEqual(
      ANCHORED_BOOK.hardware.tiers.map(({ tierId }) => tierId),
    );
    expect(page?.disabled).toEqual([]);
  });

  it("is what was saved, as stored, with the revision a save is made against", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { ...FIXED_DEFAULTS, handle: "black" });

    const page = await readKitchenDefaultsForAdmittedPage();

    expect(page?.state.saved).toBe(true);
    expect(page?.state.defaults).toEqual({
      ...FIXED_DEFAULTS,
      handle: "black",
    });
    expect(page?.state.revision).not.toBe("0");
  });

  it("shows an item switched off after it was saved as saved, and lists it as disabled", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { ...FIXED_DEFAULTS, handle: "black" });
    await writeWithoutJudgement(
      admin,
      { kind: "handle", handle: "black" },
      false,
    );

    const page = await readKitchenDefaultsForAdmittedPage();

    expect(page?.state.defaults.handle).toBe("black");
    expect(page?.disabled).toEqual([{ kind: "handle", handle: "black" }]);
  });

  it("takes its revision and its disabled list from one read of the head", async () => {
    const admin = await administrator();
    await writeWithoutJudgement(
      admin,
      { kind: "handle", handle: "black" },
      false,
    );
    const realRead = prices.stores.availability.readCurrent.bind(
      prices.stores.availability,
    );
    const readHead = vi.spyOn(prices.stores.availability, "readCurrent");

    const page = await readKitchenDefaultsForAdmittedPage();

    expect(readHead).toHaveBeenCalledTimes(1);
    const head = await realRead();
    expect(page?.state.availabilityRevision).toBe(head.revision);
    expect(page?.disabled).toEqual(head.disabled);
  });

  it("takes no session and spends no bucket, and writes no audit row", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { ...FIXED_DEFAULTS, handle: "black" });
    const rowsBefore = prices.ledger.heldEvents().length;
    limiterLedger.counted.length = 0;

    await readKitchenDefaultsForAdmittedPage();

    expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("is undefined before any version was published", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });

    expect(await readKitchenDefaultsForAdmittedPage()).toBeUndefined();
  });

  it.each([
    ["a handle that is not one", { handle: "gold" }],
    ["a key a new kitchen does not take", { colour: "red" }],
    ["a null where a value is optional", { handle: null }],
    ["a list", []],
  ])(
    "throws for a row holding %s, and shows nothing as saved",
    async (_name, stored) => {
      vi.spyOn(prices.defaults, "read").mockResolvedValue({
        kind: "saved",
        saved: { revision: "1", defaults: stored, savedAt: new Date(0) },
      });

      await expect(readKitchenDefaultsForAdmittedPage()).rejects.toMatchObject({
        name: "DashboardStateUnreadableError",
      });
    },
  );

  it("throws when a store cannot answer", async () => {
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new DashboardStoreError("read the kitchen defaults", "unavailable"),
    );

    await expect(readKitchenDefaultsForAdmittedPage()).rejects.toBeInstanceOf(
      DashboardStoreError,
    );
  });
});

describe("the customer's read of the defaults", () => {
  it("is the fixed fallbacks while nothing is saved", async () => {
    expect(await readNewKitchenDefaults()).toEqual(FIXED_DEFAULTS);
    expect(linesWritten()).toEqual([]);
  });

  it("is what was saved while every item it names is on, which is the completion of the saved row", async () => {
    const admin = await administrator();
    await fc.assert(
      fc.asyncProperty(savedRowsOfStatedTiers, async (saved) => {
        await saveDefaults(admin, saved);

        const read = await readNewKitchenDefaults();

        expect(read, JSON.stringify(saved)).toEqual(
          completedDefaultsOf(saved, ANCHORED_BOOK),
        );
      }),
      { numRuns: 60 },
    );
    expect(linesWritten()).toEqual([]);
  });

  it("names no item the head has off or the book does not state, whichever saved row and whichever switches", async () => {
    const admin = await administrator();
    await fc.assert(
      fc.asyncProperty(savedRows, switchedOff, async (saved, off) => {
        await trySaveDefaults(admin, saved);
        for (const item of await disabledNow()) {
          await writeWithoutJudgement(admin, item, true);
        }
        for (const item of off) await writeWithoutJudgement(admin, item, false);
        const availability = await prices.stores.availability.readCurrent();

        const read = await readNewKitchenDefaults();

        const label = JSON.stringify({ saved, off, read });
        const named: readonly ItemRef[] = [
          { kind: "material", tierId: read.materialTierId ?? "" },
          { kind: "hardware", tierId: read.hardwareTierId ?? "" },
          { kind: "handle", handle: read.handle },
          { kind: "handle", handle: read.topRowHandle },
          ...(read.finish.kind === "palette-entry"
            ? [{ kind: "finish" as const, finishId: read.finish.entryId }]
            : []),
        ];
        for (const item of named) {
          if (item.kind === "finish") {
            expect(isItemDisabled(availability, item), label).toBe(false);
          } else {
            expect(
              isItemOffered(item, { book: ANCHORED_BOOK, availability }),
              label,
            ).toBe(true);
          }
        }
        expect(Object.keys(read).sort(), label).toEqual(
          Object.keys(FIXED_DEFAULTS).sort(),
        );
        expect(
          isColourOfItsMaterial(
            read as { materialTierId: string; finish: Finish },
          ),
          label,
        ).toBe(true);
      }),
      { numRuns: 80 },
    );
  });

  it("replaces a saved item that is off by its fixed fallback, and keeps every other saved value", async () => {
    const admin = await administrator();
    await saveDefaults(admin, {
      ...FIXED_DEFAULTS,
      handle: "black",
      topRowHandle: "steel",
      cabinetDepthMm: 700,
    });
    await writeWithoutJudgement(
      admin,
      { kind: "handle", handle: "black" },
      false,
    );

    const read = await readNewKitchenDefaults();

    expect(read).toEqual({
      ...FIXED_DEFAULTS,
      handle: DEFAULT_HANDLE,
      topRowHandle: "steel",
      cabinetDepthMm: 700,
    });
  });

  it("judges the colour after the material: a colour of a replaced material is not kept for the fallback material", async () => {
    const admin = await administrator();
    await saveDefaults(admin, {
      ...FIXED_DEFAULTS,
      materialTierId: VENEER,
      finish: paletteFinish("veneer.stejar"),
    });
    await writeWithoutJudgement(
      admin,
      { kind: "material", tierId: VENEER },
      false,
    );

    const read = await readNewKitchenDefaults();

    expect(read.materialTierId).toBe(FIXED_MATERIAL);
    expect(read.finish).toEqual(paletteFinish("pal.alb"));
  });

  it("replaces a saved colour that is switched off by the material's own colour", async () => {
    const admin = await administrator();
    await saveDefaults(admin, {
      ...FIXED_DEFAULTS,
      finish: paletteFinish("pal.alb"),
    });
    const [, second] = paletteEntriesOf(MATERIALS[0] ?? failNoMaterial());
    const other = second?.entryId ?? failNoMaterial();
    await saveDefaults(admin, {
      ...FIXED_DEFAULTS,
      finish: paletteFinish(other),
    });
    await writeWithoutJudgement(
      admin,
      { kind: "finish", finishId: other },
      false,
    );

    const read = await readNewKitchenDefaults();

    expect(read.finish).toEqual(paletteFinish("pal.alb"));
  });
});

describe("the customer's read order", () => {
  it("reads the head, then the book, then the saved defaults, as the staff save does", async () => {
    const readHead = vi.spyOn(prices.stores.availability, "readCurrent");
    const readBook = vi.spyOn(prices.stores.priceBook, "readActive");
    const readSaved = vi.spyOn(prices.defaults, "read");

    await readNewKitchenDefaults();

    const first = (spy: { mock: { invocationCallOrder: number[] } }) =>
      spy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    expect(first(readHead)).toBeLessThan(first(readBook));
    expect(first(readBook)).toBeLessThan(first(readSaved));
  });

  it("writes one line, not two, when the head and the book both cannot be read", async () => {
    vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
      new DashboardStoreError("read the catalogue availability", "unavailable"),
    );
    vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
      new DashboardStoreError("read the active price version", "unavailable"),
    );

    const read = await readNewKitchenDefaults();

    expect(Object.hasOwn(read, "materialTierId")).toBe(false);
    expect(linesWritten()).toHaveLength(1);
  });
});

describe("the customer's read when something cannot be read", () => {
  const SAVED: NewKitchenSettings = { ...FIXED_DEFAULTS, handle: "black" };

  async function savedHandleIsNotKept(): Promise<void> {
    expect(await readNewKitchenDefaults()).toEqual(FIXED_DEFAULTS);
  }

  function expectOneLineNamingOnly(cause: string): void {
    expect(linesWritten()).toEqual([
      ["[new-kitchen-defaults]", { event: "fixed-fallbacks", cause }],
    ]);
    expect(JSON.stringify(linesWritten())).not.toContain(DRIVER_FAILURE_MARKER);
    expect(JSON.stringify(linesWritten())).not.toContain("black");
  }

  it("gives the fixed fallbacks and one line when the defaults store is unavailable, and never throws", async () => {
    await saveDefaults(await administrator(), SAVED);
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new DashboardStoreError("read the kitchen defaults", "unavailable"),
    );

    await savedHandleIsNotKept();

    expectOneLineNamingOnly("store-unavailable");
  });

  it("gives the fixed fallbacks and one line when the store fails in a way of its own", async () => {
    await saveDefaults(await administrator(), SAVED);
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    await savedHandleIsNotKept();

    expectOneLineNamingOnly("unexpected");
  });

  it.each([
    ["a handle that is not one", { handle: "gold" }],
    ["a key a new kitchen does not take", { colour: "red" }],
    ["a null where a value is optional", { handle: null }],
    ["a list", []],
  ])(
    "gives the fixed fallbacks and one line for a row holding %s",
    async (_name, stored) => {
      vi.spyOn(prices.defaults, "read").mockResolvedValue({
        kind: "saved",
        saved: { revision: "1", defaults: stored, savedAt: new Date(0) },
      });

      await savedHandleIsNotKept();

      expect(linesWritten()).toHaveLength(1);
      expect(linesWritten()[0]?.[1]).toEqual({
        event: "fixed-fallbacks",
        cause: "state-unreadable",
      });
    },
  );

  it("gives the fixed fallbacks and one line when the availability head cannot be read", async () => {
    await saveDefaults(await administrator(), SAVED);
    vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
      new DashboardStoreError("read the catalogue availability", "database"),
    );

    await savedHandleIsNotKept();

    expectOneLineNamingOnly("store-failed");
  });

  it("keeps the two tier keys absent and stamps the other four when the book cannot be read", async () => {
    await saveDefaults(await administrator(), SAVED);
    vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
      new DashboardStoreError("read the active price version", "unavailable"),
    );

    const read = await readNewKitchenDefaults();

    expect(read).toEqual({
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: DEFAULT_HANDLE,
      topRowHandle: TOP_ROW_HANDLE,
    });
    expect(Object.hasOwn(read, "materialTierId")).toBe(false);
    expect(Object.hasOwn(read, "hardwareTierId")).toBe(false);
    expectOneLineNamingOnly("store-unavailable");
  });

  it("does the same, without a line, before any version was published: that is a state of the data", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });

    const read = await readNewKitchenDefaults();

    expect(Object.keys(read).sort()).toEqual([
      "cabinetDepthMm",
      "finish",
      "handle",
      "topRowHandle",
    ]);
    expect(linesWritten()).toEqual([]);
  });

  it("does not throw when the line itself cannot be written", async () => {
    logged.mockImplementation(() => {
      throw new Error("the console is closed");
    });
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    await savedHandleIsNotKept();
  });
});
