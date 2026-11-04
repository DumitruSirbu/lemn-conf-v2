// A page read of the dashboard writes a line when a store fails and none when production holds the stub stores, which say
// "unavailable" to everything until the database stores exist: every staff page load would otherwise add a line. An error
// that is no store's is a defect and is thrown on.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "@lemnaria/persistence";

import { DashboardStateUnreadableError } from "@/lib/server/price-dashboard/dashboard-state";
import { UNAVAILABLE_PRICE_BOOK_STORE } from "@/lib/server/unavailable-price-stores";
import { readAdmitted } from "@/price-dashboard/admitted-state-read";

const world = vi.hoisted(() => ({
  accountLines: [] as unknown[],
  priceBook: undefined as unknown,
}));

vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: (line: unknown) => world.accountLines.push(line),
}));
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => Promise.resolve({ priceBook: world.priceBook }),
}));

const unavailable = () =>
  new DashboardStoreError("read the price draft", "unavailable");
const consoleLines = () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return spy;
};

beforeEach(() => {
  world.accountLines = [];
  world.priceBook = UNAVAILABLE_PRICE_BOOK_STORE;
  vi.restoreAllMocks();
});

describe("a read for an admitted page", () => {
  it("is the value when the read answers, and writes nothing", async () => {
    const written = consoleLines();

    expect(await readAdmitted(() => Promise.resolve(7))).toEqual({
      kind: "read",
      value: 7,
    });
    expect(written).not.toHaveBeenCalled();
    expect(world.accountLines).toEqual([]);
  });

  it("is nothing and writes no line when production holds the stub stores that say they are unavailable", async () => {
    const written = consoleLines();

    const read = await readAdmitted(() => Promise.reject(unavailable()));

    expect(read).toEqual({ kind: "unavailable" });
    expect(written).not.toHaveBeenCalled();
    expect(world.accountLines).toEqual([]);
  });

  it("is nothing and writes one line when any other store says it is unavailable, and names the operation and the kind", async () => {
    world.priceBook = {};
    const written = consoleLines();

    const read = await readAdmitted(() => Promise.reject(unavailable()));

    expect(read).toEqual({ kind: "unavailable" });
    expect(written).toHaveBeenCalledTimes(1);
    expect(written.mock.calls[0]?.[1]).toEqual({
      event: "no-price-book",
      cause: "store-unavailable",
      operation: "read the price draft",
      kind: "unavailable",
    });
  });

  it("is nothing and writes one line for a store that fails otherwise, as a failure and not as an absence", async () => {
    world.priceBook = {};
    const written = consoleLines();

    await readAdmitted(() =>
      Promise.reject(
        new DashboardStoreError("read the price draft", "invalid-request"),
      ),
    );

    expect(written.mock.calls[0]?.[1]).toMatchObject({
      cause: "store-failed",
      kind: "invalid-request",
    });
  });

  it("is nothing and writes the event line for a stored value that is not what the store declares", async () => {
    await readAdmitted(() =>
      Promise.reject(new DashboardStateUnreadableError("book")),
    );

    expect(world.accountLines).toEqual([
      { event: "staff-prices", outcome: "unavailable" },
    ]);
  });

  it("throws on an error that is no store's, which is a defect and not an absence", async () => {
    await expect(
      readAdmitted(() => Promise.reject(new TypeError("a defect"))),
    ).rejects.toThrow("a defect");
  });
});
