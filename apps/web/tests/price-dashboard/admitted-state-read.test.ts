// A page read of the dashboard writes a line when a store fails, and none when the store only says it is unavailable, which
// is production's state while it has no price stores: every staff page load would otherwise add a line.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "@lemnaria/persistence";

import { readAdmitted } from "@/price-dashboard/admitted-state-read";

const log = vi.hoisted(() => ({ lines: [] as unknown[] }));

vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: (line: unknown) => log.lines.push(line),
}));

beforeEach(() => {
  log.lines = [];
});

describe("a read for an admitted page", () => {
  it("is nothing and writes no line when the store says it is unavailable", async () => {
    const read = await readAdmitted(() =>
      Promise.reject(
        new DashboardStoreError("read the price draft", "unavailable"),
      ),
    );

    expect(read).toEqual({ kind: "unavailable" });
    expect(log.lines).toEqual([]);
  });

  it.each([
    [
      "a store that fails otherwise",
      new DashboardStoreError("read the price draft", "invalid-request"),
    ],
    ["an error nobody expected", new Error("boom")],
  ])("is nothing and writes one line for %s", async (_name, failure) => {
    const read = await readAdmitted(() => Promise.reject(failure));

    expect(read).toEqual({ kind: "unavailable" });
    expect(log.lines).toEqual([
      { event: "staff-prices", outcome: "unavailable" },
    ]);
  });

  it("is the value when the read answers", async () => {
    expect(await readAdmitted(() => Promise.resolve(7))).toEqual({
      kind: "read",
      value: 7,
    });
    expect(log.lines).toEqual([]);
  });
});
