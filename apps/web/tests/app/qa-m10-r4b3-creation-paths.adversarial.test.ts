import {
  freeColourFinish,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
} from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flattenLogArguments } from "../support/console-log-line";
import { freshAccountWorld } from "../support/account-world";
import {
  administrator,
  saveDefaults,
} from "../support/availability-route-world";
import {
  currentPriceDashboardWorld,
  freshPriceDashboardWorld,
} from "../support/price-dashboard-world";
import { freshStaffWorld } from "../support/staff-world";
import { UNUSED_STORE_READS } from "../support/unused-store-reads";

/**
 * QA of M10 R4b3 at the two public creation paths: the seeded mint and the room page. What each does when the dashboard's
 * stores cannot answer or hold a row that is not settings, which store calls each can make (R-d, at run time), and what the
 * page hands the browser. The customer read is the real one, over the persistence package's fakes.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

type StoreMode =
  | "world"
  | "reject-unavailable"
  | "throw-synchronously"
  | "unreadable-row";

const stores = vi.hoisted(() => ({
  mode: "world" as StoreMode,
  asks: 0,
  calls: [] as string[],
}));
const minted = vi.hoisted(() => ({ designs: [] as Design[] }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(() => Promise.resolve()),
}));
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
vi.mock("@/lib/server/price-stores", async () => {
  const { DashboardStoreError: StoreError } = await import(
    "@lemnaria/persistence"
  );
  const { currentPriceDashboardWorld: currentWorld } = await import(
    "../support/price-dashboard-world"
  );
  /** Every method of a store, recorded by name before it runs. */
  const recording = <Store extends object>(name: string, store: Store): Store =>
    new Proxy(store, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          stores.calls.push(`${name}.${String(property)}`);
          return (value as (...given: unknown[]) => unknown).apply(
            target,
            args,
          );
        };
      },
    });
  return {
    getPriceStores: () => {
      stores.asks += 1;
      if (stores.mode === "throw-synchronously") {
        throw new StoreError("read the active price version", "unavailable");
      }
      if (stores.mode === "reject-unavailable") {
        return Promise.reject(
          new StoreError("read the active price version", "unavailable"),
        );
      }
      const world = currentWorld().stores;
      const defaults =
        stores.mode === "unreadable-row"
          ? {
              read: () =>
                Promise.resolve({
                  kind: "saved" as const,
                  saved: {
                    revision: "2",
                    defaults: { handle: "gold" },
                    savedAt: new Date(),
                  },
                }),
              save: world.defaults.save.bind(world.defaults),
            }
          : world.defaults;
      return Promise.resolve({
        priceBook: recording("priceBook", world.priceBook),
        availability: recording("availability", world.availability),
        defaults: recording("defaults", defaults),
        usage: recording("usage", world.usage),
      });
    },
  };
});
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    mint: (request: { design: Design }) => {
      minted.designs.push(request.design);
      return Promise.resolve({ id: "design-0", revision: "1" });
    },
  }),
}));
vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => ({
    recordHits: () => Promise.resolve([1]),
    ...UNUSED_STORE_READS,
  }),
}));

const { POST } = await import("../../src/app/api/designs/route");
const { default: RoomPage } = await import(
  "../../src/app/[locale]/configurator/room/page"
);

const FIXED_FALLBACK_SETTINGS = {
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: "steel",
  topRowHandle: "push",
} as const;

const SIX_KEYS = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
];

/** The two store calls, and the one availability call, a customer read may make. */
const CUSTOMER_READ_CALLS = [
  "availability.readCurrent",
  "defaults.read",
  "priceBook.readActive",
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  stores.mode = "world";
  stores.asks = 0;
  stores.calls.length = 0;
  minted.designs.length = 0;
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mintRequest(): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

async function newKitchenSettingsOfTheLoad(): Promise<unknown> {
  const page = await RoomPage({ params: Promise.resolve({ locale: "ro" }) });
  if (!isValidElement<{ newKitchenSettings: unknown }>(page)) {
    throw new Error("Room route returned no element");
  }
  return page.props.newKitchenSettings;
}

function logLines(): string[] {
  return errorSpy.mock.calls.map((call) => flattenLogArguments(call));
}

describe("a store that cannot answer never blocks a creation (rule 3)", () => {
  it.each(["reject-unavailable", "throw-synchronously"] as const)(
    "mints the fixture stamped with the four fixed settings, and no tier, when the stores %s",
    async (mode) => {
      stores.mode = mode;

      const response = await POST(mintRequest());

      expect(response.status).toBe(201);
      expect(minted.designs).toHaveLength(1);
      expect(minted.designs[0]?.settings).toEqual(FIXED_FALLBACK_SETTINGS);
      expect({ ...minted.designs[0], settings: undefined }).toEqual({
        ...KITCHEN_L_DESIGN,
        settings: undefined,
      });
    },
  );

  it("hands the page the same four settings, and no tier, when the stores cannot answer", async () => {
    stores.mode = "reject-unavailable";

    expect(await newKitchenSettingsOfTheLoad()).toEqual(
      FIXED_FALLBACK_SETTINGS,
    );
  });

  it("writes one line for one failed mint, naming the cause and no value", async () => {
    stores.mode = "reject-unavailable";

    await POST(mintRequest());

    const lines = logLines().filter((line) => line.includes("new-kitchen"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("store-unavailable");
    expect(lines[0]).not.toContain("material.");
    expect(lines[0]).not.toContain("pal.alb");
  });

  it("mints the fixed fallbacks, tiers included, over a saved row that is not settings, and names the cause", async () => {
    stores.mode = "unreadable-row";

    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(minted.designs[0]?.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material.melamine",
      hardwareTierId: "hardware.standard",
      finish: paletteFinish("pal.alb"),
      handle: "steel",
      topRowHandle: "push",
    });
    expect(logLines().join("\n")).toContain("state-unreadable");
    expect(logLines().join("\n")).not.toContain("gold");
  });
});

describe("the page hands the browser the six values and nothing the dashboard holds", () => {
  it("hands exactly the six keys, and no revision, no timestamp and no offer, after a save", async () => {
    const staff = await administrator();
    await saveDefaults(staff, {
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });

    const handed = await newKitchenSettingsOfTheLoad();

    expect(Object.keys(handed as object).sort()).toEqual([...SIX_KEYS].sort());
    const serialized = JSON.stringify(handed);
    expect(serialized).not.toMatch(/revision|savedAt|disabled|offers|version/i);
  });

  it("hands only the six keys though the saved row is a stranger's document", async () => {
    stores.mode = "unreadable-row";

    const handed = await newKitchenSettingsOfTheLoad();

    expect(
      Object.keys(handed as object).every((key) => SIX_KEYS.includes(key)),
    ).toBe(true);
    expect(JSON.stringify(handed)).not.toContain("gold");
  });

  it("reads nothing for an unsupported locale", async () => {
    await expect(
      RoomPage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toBeDefined();

    expect(stores.asks).toBe(0);
  });
});

describe("the customer read touches no draft, archive, publish or write (R-d, at run time)", () => {
  it("makes only the three reads of the active book, the availability head and the saved defaults, for the page", async () => {
    await newKitchenSettingsOfTheLoad();

    expect([...new Set(stores.calls)].sort()).toEqual(CUSTOMER_READ_CALLS);
  });

  it("makes only those three reads for the seeded mint, whatever the defaults say", async () => {
    const staff = await administrator();
    await saveDefaults(staff, { materialTierId: "material.veneer" });
    stores.calls.length = 0;

    await POST(mintRequest());

    expect([...new Set(stores.calls)].sort()).toEqual(CUSTOMER_READ_CALLS);
  });

  it("makes no store read at all for a mint the cross-site guard refuses", async () => {
    const response = await POST(
      new NextRequest("https://lemnaria.test/api/designs", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );

    expect(response.status).toBe(403);
    expect(stores.asks).toBe(0);
    expect(minted.designs).toEqual([]);
  });
});

describe("the page's read is bounded (the R4b2 hand-off to R4b3: 'The customer read has no bound')", () => {
  const RENDERS = 25;

  it("does not write one log line per render while the stores are down", async () => {
    stores.mode = "reject-unavailable";

    for (let render = 0; render < RENDERS; render++) {
      await newKitchenSettingsOfTheLoad();
    }

    expect(logLines().length).toBeLessThan(RENDERS);
  });

  it("does not read the stores afresh for every render while they are up", async () => {
    for (let render = 0; render < RENDERS; render++) {
      await newKitchenSettingsOfTheLoad();
    }

    expect(stores.calls.length).toBeLessThan(RENDERS * 3);
  });
});

describe("a read writes nothing", () => {
  it("leaves the saved defaults row unchanged by any number of page loads and mints", async () => {
    const world = currentPriceDashboardWorld();
    const before = await world.defaults.read();

    await newKitchenSettingsOfTheLoad();
    await POST(mintRequest());

    expect(await world.defaults.read()).toEqual(before);
  });
});
