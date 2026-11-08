import {
  DEFAULT_HANDLE,
  paletteFinish,
  TOP_ROW_HANDLE,
} from "@lemnaria/configurator-domain";
import { NO_ACTIVE_VERSION } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readNewKitchenDefaults } from "@/lib/server/price-dashboard/new-kitchen-defaults";

import { freshAccountWorld } from "../../../support/account-world";
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

/** What the customer read bounds: what it keeps between renders, and how long it waits on the stores. */
const READ_DEADLINE_MS = 1500;

const WITHOUT_TIERS = {
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: DEFAULT_HANDLE,
  topRowHandle: TOP_ROW_HANDLE,
};

let prices: PriceDashboardWorld;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a reading is reused only while it is the answer for the availability head", () => {
  it("reads the book and the saved defaults once for renders that find the head where it was", async () => {
    const bookReads = vi.spyOn(prices.stores.priceBook, "readActive");
    const savedReads = vi.spyOn(prices.defaults, "read");

    const first = await readNewKitchenDefaults();
    const second = await readNewKitchenDefaults();

    expect(first).toEqual(FIXED_DEFAULTS);
    expect(second).toEqual(first);
    expect(bookReads).toHaveBeenCalledTimes(1);
    expect(savedReads).toHaveBeenCalledTimes(1);
  });

  it("hands each render its own copy of what it reused", async () => {
    await readNewKitchenDefaults();
    const reused = await readNewKitchenDefaults();
    Object.assign(reused.finish, { kind: "free-colour", value: "#000000" });

    expect(await readNewKitchenDefaults()).toEqual(FIXED_DEFAULTS);
  });

  it("never reuses a reading made with no book: a seed that inserts version 1 does not move the head", async () => {
    const noVersionYet = vi
      .spyOn(prices.stores.priceBook, "readActive")
      .mockResolvedValueOnce(NO_ACTIVE_VERSION);

    const before = await readNewKitchenDefaults();
    noVersionYet.mockRestore();
    const after = await readNewKitchenDefaults();

    expect(before).toEqual(WITHOUT_TIERS);
    expect(after).toEqual(FIXED_DEFAULTS);
  });

  it("never reuses a reading that fell back because a store failed", async () => {
    vi.spyOn(prices.defaults, "read").mockRejectedValueOnce(new Error("down"));

    const fellBack = await readNewKitchenDefaults();
    const recovered = await readNewKitchenDefaults();

    expect(fellBack).toEqual(FIXED_DEFAULTS);
    expect(recovered).toEqual(FIXED_DEFAULTS);
  });
});

describe("the read waits on the stores no longer than its deadline", () => {
  /** A read of the saved defaults that answers only when the test lets it. */
  function heldSavedRead() {
    let release: () => void = () => undefined;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = prices.defaults.read.bind(prices.defaults);
    vi.spyOn(prices.defaults, "read").mockImplementationOnce(async () => {
      await answer;
      return real();
    });
    return release;
  }

  it("gives the fixed fallbacks without tiers and writes one line once the deadline passes", async () => {
    vi.useFakeTimers();
    heldSavedRead();

    const pending = readNewKitchenDefaults();
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);

    expect(await pending).toEqual(WITHOUT_TIERS);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(Object.keys(logged.mock.calls[0]?.[1] as object).sort()).toEqual([
      "cause",
      "event",
    ]);
  });

  it("waits for a store that answers inside the deadline", async () => {
    vi.useFakeTimers();
    const release = heldSavedRead();

    const pending = readNewKitchenDefaults();
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS - 1);
    release();
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual(FIXED_DEFAULTS);
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not keep a reading that arrives after the deadline", async () => {
    vi.useFakeTimers();
    const release = heldSavedRead();
    const pending = readNewKitchenDefaults();
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await pending;
    release();
    await vi.advanceTimersByTimeAsync(0);
    const bookReads = vi.spyOn(prices.stores.priceBook, "readActive");

    const next = await readNewKitchenDefaults();

    expect(next).toEqual(FIXED_DEFAULTS);
    expect(bookReads).toHaveBeenCalledTimes(1);
  });
});
