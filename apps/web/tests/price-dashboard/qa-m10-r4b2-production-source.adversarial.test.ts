import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import { FETCHING_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/fetching-item-lifecycle-client";
import { readItemPage } from "@/price-dashboard/item-page-read";
import {
  deleteStandOf,
  switchStandOf,
  type LifecycleContext,
  type SwitchStand,
} from "@/price-dashboard/item-lifecycle-model";
import { readKitchenDefaults } from "@/price-dashboard/kitchen-defaults-source";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
} from "../support/account-world";
import {
  administrator,
  saveDefaults,
  writeWithoutJudgement,
  type Administrator,
} from "../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../support/price-dashboard-world";
import { freshStaffWorld } from "../support/staff-world";
import { codeOf, importClosureOf } from "../support/source-import-closure";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

/**
 * QA of M10 R4b2 items 3 and 4 and of the R-d allow-list's new entry: the production wiring of the defaults client, the
 * production read of the defaults source, and what switch-off still refuses over the defaults it now reads.
 */

const WHAT_THE_PRODUCTION_CLIENT_CAN_DO = {
  canWrite: FETCHING_ITEM_LIFECYCLE_CLIENT.canWrite,
  canDeleteStatedItems: FETCHING_ITEM_LIFECYCLE_CLIENT.canDeleteStatedItems,
} as const;
const MATERIALS = [
  "material.melamine",
  "material.veneer",
  "material.painted-mdf",
];
const HARDWARES = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
];
const HANDLES = ["steel", "black", "push"] as const;
const FIXED_DEFAULT_IDS = new Set([
  "material.melamine",
  "hardware.standard",
  "steel",
  "push",
]);
const SOURCE = "price-dashboard/kitchen-defaults-source.ts";

let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;
let admin: Administrator;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("NODE_ENV", "production");
  admin = await administrator();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const readPage = () =>
  readItemPage({
    canDerive: () => true,
    loadSampleUsage: () => Promise.resolve([]),
  });

async function contextOfThePage(): Promise<LifecycleContext> {
  const read = await readPage();
  if (read.kind !== "ready") throw new Error("the item page is unavailable");
  const { state, defaults } = read.page;
  return {
    book: state.active.book,
    availability: state.active.availability,
    defaults,
    isCreatedInDraft: () => false,
    ...WHAT_THE_PRODUCTION_CLIENT_CAN_DO,
  };
}

async function standOfSwitchingOff(item: ItemRef): Promise<SwitchStand> {
  return switchStandOf(item, await contextOfThePage());
}

function itemsOfTheBook(): readonly ItemRef[] {
  return [
    ...MATERIALS.map((tierId) => ({ kind: "material", tierId }) as const),
    ...HARDWARES.map((tierId) => ({ kind: "hardware", tierId }) as const),
    ...HANDLES.map((handle) => ({ kind: "handle", handle }) as const),
  ];
}

function idOf(item: ItemRef): string {
  if (item.kind === "handle") return item.handle;
  if (item.kind === "material" || item.kind === "hardware") return item.tierId;
  throw new Error("not an item of this table");
}

describe("every default keeps its refusal over the defaults a production build reads", () => {
  const SAVED_MATERIAL = MATERIALS;
  const SAVED_HARDWARE = HARDWARES;
  const SAVED_HANDLE = HANDLES;

  for (const material of SAVED_MATERIAL) {
    for (const hardware of SAVED_HARDWARE) {
      for (const handle of SAVED_HANDLE) {
        it(`saved ${material}, ${hardware}, ${handle}: the fixed defaults and the saved ones are refused for what they are and every other option is offered`, async () => {
          await saveDefaults(admin, {
            materialTierId: material,
            hardwareTierId: hardware,
            handle,
          });
          const saved = new Set([material, hardware, handle]);

          const stands = await Promise.all(
            itemsOfTheBook().map(async (item) => ({
              id: idOf(item),
              stand: await standOfSwitchingOff(item),
            })),
          );

          for (const { id, stand } of stands) {
            if (FIXED_DEFAULT_IDS.has(id)) {
              expect(stand, id).toEqual({
                kind: "off",
                reason: "item-is-fixed-default",
              });
            } else if (saved.has(id)) {
              expect(stand, id).toEqual({
                kind: "off",
                reason: "item-is-default",
              });
            } else {
              expect(stand.kind, id).toBe("disable");
            }
          }
        });
      }
    }
  }

  it("keeps every fixed default refused while nothing is saved, and offers every other option", async () => {
    for (const item of itemsOfTheBook()) {
      const stand = await standOfSwitchingOff(item);

      if (FIXED_DEFAULT_IDS.has(idOf(item))) {
        expect(stand, idOf(item)).toEqual({
          kind: "off",
          reason: "item-is-fixed-default",
        });
      } else {
        expect(stand.kind, idOf(item)).toBe("disable");
      }
    }
  });
});

describe("the last option that is on keeps its refusal over the production defaults", () => {
  it.each([
    ["material", MATERIALS, "material.veneer"],
    ["hardware", HARDWARES, "hardware.soft-close"],
    ["handle", HANDLES, "black"],
  ] as const)(
    "of the %s group: with one other option on the item is offered, and once that one is off it is the last and refused",
    async (kind, ids, lastOn) => {
      const asItem = (id: string): ItemRef =>
        kind === "handle"
          ? { kind, handle: id as (typeof HANDLES)[number] }
          : { kind, tierId: id };
      const [stayingOn, ...switchedOff] = ids.filter((id) => id !== lastOn);
      for (const id of switchedOff) {
        await writeWithoutJudgement(admin, asItem(id), false);
      }

      const withOneOther = await standOfSwitchingOff(asItem(lastOn));
      await writeWithoutJudgement(admin, asItem(stayingOn ?? ""), false);
      const alone = await standOfSwitchingOff(asItem(lastOn));

      expect(withOneOther.kind).toBe("disable");
      expect(alone).toEqual({ kind: "last-active-option" });
    },
  );
});

describe("a saved row that does not parse turns switch-off on for no item", () => {
  const JUNK_ROWS: readonly [string, unknown][] = [
    ["a handle nobody sells", { handle: "STORED-JUNK-4471" }],
    ["a row that is a list", ["STORED-JUNK-4471"]],
    ["a row that is a string", "STORED-JUNK-4471"],
    ["a depth that is a string", { cabinetDepthMm: "STORED-JUNK-4471" }],
    ["a member no setting has", { STORED_JUNK_4471: true }],
    ["a finish that is no finish", { finish: { kind: "STORED-JUNK-4471" } }],
    ["a depth nobody manufactures", { cabinetDepthMm: 9999 }],
  ];

  it.each(JUNK_ROWS)(
    "holding %s: the defaults screen is unavailable, the item page has no defaults and every item's switch-off cannot be judged, with the row's text nowhere",
    async (_name, row) => {
      vi.spyOn(prices.defaults, "read").mockResolvedValue({
        kind: "saved",
        saved: { revision: "3", defaults: row as never, savedAt: new Date(0) },
      });

      expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
      const page = await readPage();
      expect(page.kind === "ready" && page.page.defaults).toBeUndefined();
      for (const item of itemsOfTheBook()) {
        const stand = await standOfSwitchingOff(item);
        expect(stand.kind, idOf(item)).toBe("off");
        expect(stand).not.toMatchObject({ kind: "disable" });
      }
      expect(console_.everything()).not.toContain("STORED-JUNK-4471");
    },
  );
});

describe("the defaults screen's read fails by one rule whichever store fails", () => {
  const FAILING_STORES: readonly [string, () => void][] = [
    [
      "the active version",
      () => {
        vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
          new DashboardStoreError(
            "read the active price version",
            "unavailable",
          ),
        );
      },
    ],
    [
      "the availability head",
      () => {
        vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
          new DashboardStoreError(
            "read the catalogue availability",
            "unavailable",
          ),
        );
      },
    ],
    [
      "the saved defaults",
      () => {
        vi.spyOn(prices.defaults, "read").mockRejectedValue(
          new DashboardStoreError("read the kitchen defaults", "unavailable"),
        );
      },
    ],
  ];

  it.each(FAILING_STORES)(
    "is unavailable when %s cannot be read, and no item screen is offered a switch-off",
    async (_name, arrange) => {
      arrange();

      expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
      const page = await readPage();
      expect(
        page.kind === "ready" ? page.page.defaults : undefined,
      ).toBeUndefined();
    },
  );

  it.each(FAILING_STORES)(
    "rethrows what is not a store's failure when %s throws a defect of ours",
    async (name) => {
      const defect = new RangeError(`a defect near ${name}`);
      for (const spy of [
        vi.spyOn(prices.stores.priceBook, "readActive"),
        vi.spyOn(prices.stores.availability, "readCurrent"),
        vi.spyOn(prices.defaults, "read"),
      ]) {
        spy.mockRejectedValue(defect);
        await expect(readKitchenDefaults()).rejects.toBe(defect);
        spy.mockRestore();
      }
    },
  );

  it("is unavailable, never a screen of invented values, while no version was ever published, and no item page is ready", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });

    expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
    expect(await readPage()).toEqual({ kind: "unavailable" });
  });

  it("shows no driver text in the console when a store's own failure is absorbed", async () => {
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      Object.assign(
        new DashboardStoreError(
          "read the kitchen defaults",
          "unexpected-answer",
        ),
        { message: DRIVER_FAILURE_MARKER },
      ),
    );

    await readKitchenDefaults();

    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("Delete of a stated row, with the defaults now readable and the client leaving it to the draft route", () => {
  it("is judged by the defaults and nothing else: a fixed default is refused for what it is, every other class is counted first", async () => {
    for (const saved of [undefined, { handle: "black" as const }]) {
      if (saved !== undefined) await saveDefaults(admin, saved);
      const context = await contextOfThePage();
      expect(context.defaults).toBeDefined();
      expect(FETCHING_ITEM_LIFECYCLE_CLIENT.canDeleteStatedItems).toBe(true);

      for (const item of itemsOfTheBook()) {
        if (item.kind === "handle" || item.kind === "finish") continue;
        const stand = deleteStandOf(item, context);
        if (FIXED_DEFAULT_IDS.has(idOf(item))) {
          expect(stand, idOf(item)).toEqual({
            kind: "off",
            reason: "item-is-fixed-default",
          });
        } else {
          expect(stand, idOf(item)).toEqual({ kind: "count-first" });
        }
      }
    }
  });

  it("is refused for a class the saved defaults name, and offered again once the defaults name another", async () => {
    const savedHardware = { hardwareTierId: "hardware.soft-close" } as const;
    await saveDefaults(admin, savedHardware);
    const item = { kind: "hardware", tierId: "hardware.soft-close" } as const;

    const whileSaved = deleteStandOf(item, await contextOfThePage());
    await saveDefaults(admin, { hardwareTierId: "hardware.premium" });
    const afterMoving = deleteStandOf(item, await contextOfThePage());

    expect(whileSaved).toEqual({ kind: "off", reason: "item-is-default" });
    expect(afterMoving).toEqual({ kind: "count-first" });
  });

  it("is offered a stated row only by a client that leaves it to the draft route, and a created row by any that can write", async () => {
    const context = await contextOfThePage();
    const item = { kind: "hardware", tierId: "hardware.soft-close" } as const;

    expect(
      deleteStandOf(item, { ...context, canDeleteStatedItems: false }),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
    expect(
      deleteStandOf(item, {
        ...context,
        canDeleteStatedItems: false,
        isCreatedInDraft: () => true,
      }),
    ).toEqual({ kind: "count-first" });
    expect(deleteStandOf(item, { ...context, canWrite: false })).toEqual({
      kind: "off",
      reason: "cannot-judge",
    });
  });
});

describe("the allow-list's entry for the defaults source is as narrow as the file", () => {
  const DRAFT_OR_ARCHIVE =
    /\.(?:readVersion|listVersions|readDraft|writeDraft)\b|\bversion-wire\b|\breadVersionBook\b|\bpriceBook\.publish\b|\bpublish\b|\bdraft\b|\barchive/i;

  it("opens with the server-only import and imports one thing from the server's directory: the admitted-page read of the defaults", () => {
    const text = readFileSync(
      join(import.meta.dirname, "../../src", SOURCE),
      "utf8",
    );

    const firstImport = /^import\s.*$/m.exec(text)?.[0];
    const serverImports = [
      ...text.matchAll(/from\s+"(@\/lib\/server\/[^"]+)"/g),
    ].map((match) => match[1]);

    expect(firstImport).toBe('import "server-only";');
    expect(serverImports).toEqual([
      "@/lib/server/price-dashboard/new-kitchen-defaults",
    ]);
    expect(codeOf(SOURCE)).not.toMatch(DRAFT_OR_ARCHIVE);
  });

  it("takes one reader from the admitted-state module, readAdmitted, and names none of the six others that module exports (a draft, a version or a first page of versions)", () => {
    const text = readFileSync(
      join(import.meta.dirname, "../../src", SOURCE),
      "utf8",
    );

    const fromAdmittedStateRead = [
      ...text.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*"\.\/admitted-state-read"/g,
      ),
    ].flatMap((match) =>
      (match[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
    const OTHER_READERS =
      /\b(?:readVersion|readStateOrNothing|readStateReading|readFirstVersionPage|readPredecessorOf|readDeletionFactsOfPage)\b/;

    expect(fromAdmittedStateRead).toEqual(["readAdmitted"]);
    expect(codeOf(SOURCE)).not.toMatch(OTHER_READERS);
    expect(codeOf(SOURCE)).not.toMatch(/export\s*\*|export\s*\{[^}]*\}\s*from/);
  });

  it("is served by three server modules that name no draft read, no version read, no list and no publish (the whole closure also holds the dashboard's own readers, which only a call would reach)", () => {
    const readers = [
      "lib/server/price-dashboard/new-kitchen-defaults.ts",
      "lib/server/price-dashboard/saved-defaults.ts",
      "lib/server/price-dashboard/item-ref-reading.ts",
    ];

    const offenders = readers.filter((path) =>
      /\.(?:readVersion|listVersions|readDraft|writeDraft|publish)\b|\breadDraft\b|\breadVersion\b/.test(
        codeOf(path),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("asks the price book store for its active version alone: no draft, no version, no list, no publish, across a defaults screen read", async () => {
    await saveDefaults(admin, { handle: "black" });
    const forbidden = (
      [
        "readDraft",
        "writeDraft",
        "readVersion",
        "listVersions",
        "publish",
      ] as const
    ).map((method) =>
      vi
        .spyOn(prices.priceBook, method)
        .mockRejectedValue(new Error(`${method} was called`)),
    );
    const readsActive = vi.spyOn(prices.priceBook, "readActive");

    const screen = await readKitchenDefaults();

    expect(screen.kind).toBe("ready");
    expect(forbidden.map((spy) => spy.mock.calls.length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(readsActive).toHaveBeenCalled();
  });

  it("is written in the R-d guard as the file's own anchored path, not as a directory or a prefix", () => {
    const guard = readFileSync(
      join(
        import.meta.dirname,
        "../app/api/staff/qa-m10-r3-versions-and-leaks.adversarial.test.ts",
      ),
      "utf8",
    );

    expect(guard).toContain(
      "/^price-dashboard\\/kitchen-defaults-source\\.ts$/",
    );
  });
});

describe("what a browser loads of the defaults client", () => {
  const CLIENT_ENTRIES = [
    "price-dashboard/fetching-kitchen-defaults-client.ts",
    "price-dashboard/default-kitchen-defaults-client.ts",
    "price-dashboard/kitchen-defaults-page.tsx",
  ];
  const SERVER_ONLY_IMPORT = /^import\s+["']server-only["'];?\s*$/m;

  it.each(CLIENT_ENTRIES)(
    "%s imports, however far, no server-only module, nothing of the server's directory and no source",
    (entry) => {
      const closure = importClosureOf(entry);

      const serverOnly = closure.filter((path) =>
        SERVER_ONLY_IMPORT.test(
          readFileSync(join(import.meta.dirname, "../../src", path), "utf8"),
        ),
      );

      expect(serverOnly).toEqual([]);
      expect(closure.filter((path) => path.startsWith("lib/server/"))).toEqual(
        [],
      );
      expect(closure).not.toContain(SOURCE);
    },
  );

  it("names no database driver in the closure of the fetching client", () => {
    const text = importClosureOf(
      "price-dashboard/fetching-kitchen-defaults-client.ts",
    )
      .map((path) => codeOf(path))
      .join("\n");

    expect(text).not.toMatch(
      /@lemnaria\/persistence|from\s+"pg"|@neondatabase/,
    );
  });
});

describe("the default client keeps the literal the bundler replaces", () => {
  it('decides on `process.env.NODE_ENV === "production"` in its own text and asks no predicate module', () => {
    const code = codeOf("price-dashboard/default-kitchen-defaults-client.ts");

    expect(code).toContain('process.env.NODE_ENV === "production"');
    expect(code).not.toContain("is-production-build");
    expect(code).not.toContain("isProductionBuild");
  });

  it("puts the production branch before the import of the in-memory stand-in", () => {
    const code = codeOf("price-dashboard/default-kitchen-defaults-client.ts");

    expect(code.indexOf("FETCHING_KITCHEN_DEFAULTS_CLIENT")).toBeGreaterThan(
      -1,
    );
    expect(code.indexOf('process.env.NODE_ENV === "production"')).toBeLessThan(
      code.indexOf("inMemoryKitchenDefaultsClient"),
    );
  });
});
