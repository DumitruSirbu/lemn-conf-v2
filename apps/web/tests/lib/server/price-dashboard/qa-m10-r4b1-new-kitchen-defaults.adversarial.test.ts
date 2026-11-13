import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import {
  DEFAULT_HANDLE,
  lookUpMaterial,
  paletteFinish,
  TOP_ROW_HANDLE,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";

import { readNewKitchenDefaults } from "@/lib/server/price-dashboard/new-kitchen-defaults";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  saveDefaults,
} from "../../../support/availability-route-world";
import { FIXED_DEFAULTS } from "../../../support/kitchen-defaults-route-world";
import {
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
 * The customer's read of the new-kitchen defaults under every kind of failure of every store it reads, and the things a
 * read must not do: write, spend a bucket, leave a line that carries a value, or hand out a shared object.
 */

const SAVED: NewKitchenSettings = {
  ...FIXED_DEFAULTS,
  handle: "black",
  cabinetDepthMm: 700,
};
const TIERS_ABSENT = {
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: DEFAULT_HANDLE,
  topRowHandle: TOP_ROW_HANDLE,
};
const CAUSES = [
  "store-unavailable",
  "store-failed",
  "state-unreadable",
  "unexpected",
];

const FAILURES: readonly [string, () => unknown][] = [
  [
    "a store that is unavailable",
    () => new DashboardStoreError("read the kitchen defaults", "unavailable"),
  ],
  [
    "a store that fails",
    () => new DashboardStoreError("read the kitchen defaults", "database"),
  ],
  ["an error carrying a secret", () => new Error(DRIVER_FAILURE_MARKER)],
  ["text carrying a secret", () => DRIVER_FAILURE_MARKER],
  ["undefined", () => undefined],
  ["null", () => null],
  ["a number", () => 42],
  [
    "an object carrying a secret",
    () => ({ message: DRIVER_FAILURE_MARKER, failure: DRIVER_FAILURE_MARKER }),
  ],
];

type Target = "defaults" | "availability" | "book";
const TARGETS: readonly [Target, string][] = [
  ["defaults", "the saved defaults"],
  ["availability", "the availability head"],
  ["book", "the active book"],
];

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

function breakRead(
  target: Target,
  failure: () => unknown,
  how: "rejects" | "throws",
): MockInstance {
  const read = readOf(target) as MockInstance<() => Promise<unknown>>;
  if (how === "rejects") {
    read.mockRejectedValue(failure());
  } else {
    read.mockImplementation(() => {
      throw failure();
    });
  }
  return read;
}

function readOf(target: Target) {
  switch (target) {
    case "defaults":
      return vi.spyOn(prices.defaults, "read");
    case "availability":
      return vi.spyOn(prices.stores.availability, "readCurrent");
    case "book":
      return vi.spyOn(prices.stores.priceBook, "readActive");
  }
}

describe("a failure of any store the customer's read asks", () => {
  describe.each(TARGETS)("of %s", (target) => {
    it.each(FAILURES)(
      "gives the fixed fallbacks and one closed line for %s, whether it rejects or throws at once",
      async (_name, failure) => {
        await saveDefaults(await administrator(), SAVED);
        const written = vi.spyOn(prices.defaults, "save");
        const switched = vi.spyOn(prices.stores.availability, "setActive");
        const rowsBefore = prices.ledger.heldEvents().length;
        limiterLedger.counted.length = 0;

        for (const how of ["rejects", "throws"] as const) {
          logged.mockClear();
          const broken = breakRead(target, failure, how);

          const read = await readNewKitchenDefaults();

          expect(read, `${target} ${how}`).toEqual(
            target === "book" ? TIERS_ABSENT : FIXED_DEFAULTS,
          );
          expect(logged).toHaveBeenCalledTimes(1);
          const [tag, line] = logged.mock.calls[0] ?? [];
          expect(tag).toBe("[new-kitchen-defaults]");
          expect(Object.keys(line as object).sort()).toEqual([
            "cause",
            "event",
          ]);
          expect(CAUSES).toContain((line as { cause: string }).cause);
          expect(JSON.stringify(logged.mock.calls)).not.toContain(
            DRIVER_FAILURE_MARKER,
          );
          expect(JSON.stringify(logged.mock.calls)).not.toContain("black");
          broken.mockRestore();
        }

        expect(written).not.toHaveBeenCalled();
        expect(switched).not.toHaveBeenCalled();
        expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore);
        expect(limiterLedger.counted).toEqual([]);
      },
    );
  });
});

describe("what the customer's read hands out", () => {
  it("is never an object a later read shares, nor the declaration of a material's colour", async () => {
    const first = await readNewKitchenDefaults();
    Object.assign(first.finish, { kind: "free-colour", value: "#000000" });
    (first as { handle: string }).handle = "black";

    const second = await readNewKitchenDefaults();

    expect(second).toEqual(FIXED_DEFAULTS);
    const lookup = lookUpMaterial("material.melamine");
    expect(lookup.kind === "declared" && lookup.material.defaultFinish).toEqual(
      paletteFinish("pal.alb"),
    );
  });

  it("is the same answer for every one of many reads made at once", async () => {
    await saveDefaults(await administrator(), SAVED);

    const reads = await Promise.all(
      Array.from({ length: 25 }, () => readNewKitchenDefaults()),
    );

    for (const read of reads) expect(read).toEqual(SAVED);
    expect(logged).not.toHaveBeenCalled();
  });

  it("holds exactly the six members and no other key", async () => {
    await saveDefaults(await administrator(), SAVED);

    const read = await readNewKitchenDefaults();

    expect(Object.keys(read).sort()).toEqual(Object.keys(SAVED).sort());
  });
});
