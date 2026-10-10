import { beforeEach, describe, expect, it, vi } from "vitest";

const HASH_OF_THE_FIRST = "ab".repeat(32);
const HASH_OF_THE_SECOND = "cd".repeat(32);
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const calls = vi.hoisted(() => ({
  order: [] as string[],
  keys: [] as (readonly string[])[],
  deletedDesigns: [] as (readonly string[])[],
  hashesToFind: [] as string[],
}));

vi.mock("@lemnaria/persistence", () => ({
  findWriteTokenHashesForTests: (ids: readonly string[]) => {
    calls.order.push(`find-hashes:${ids.join(",")}`);
    return Promise.resolve(calls.hashesToFind);
  },
  deleteRateLimitCountersForTests: (keys: readonly string[]) => {
    calls.order.push("delete-counters");
    calls.keys.push(keys);
    return Promise.resolve({
      rowsRemoved: keys.length,
      counts: keys.map(() => 2),
    });
  },
  deleteDesignsForTests: (ids: readonly string[]) => {
    calls.order.push("delete-designs");
    calls.deletedDesigns.push(ids);
    return Promise.resolve();
  },
  findDesignIdsForTests: () => Promise.resolve([]),
}));

const { deleteMintedDesigns, removeSaveCountersOfDesigns } = await import(
  "./minted-designs"
);
const { bucketKeyOfCredential } = await import("./e2e-rate-limit-run");

beforeEach(() => {
  calls.order.length = 0;
  calls.keys.length = 0;
  calls.deletedDesigns.length = 0;
  calls.hashesToFind = [HASH_OF_THE_FIRST, HASH_OF_THE_SECOND];
  vi.stubEnv("TEST_WORKER_INDEX", "1");
  vi.stubEnv("LEMNARIA_E2E_RUN_SECRET", FAKE_SECRET);
});

describe("deleteMintedDesigns", () => {
  it("removes the saves' counters of the designs it is handed before it deletes the designs", async () => {
    await deleteMintedDesigns(["design-one", "design-two"]);

    expect(calls.order).toEqual([
      "find-hashes:design-one,design-two",
      "delete-counters",
      "delete-designs",
    ]);
  });

  it("removes counters by the keys of the hashes the designs' rows hold, and nothing else", async () => {
    await deleteMintedDesigns(["design-one", "design-two"]);

    expect(calls.keys).toEqual([
      [
        bucketKeyOfCredential(FAKE_SECRET, HASH_OF_THE_FIRST),
        bucketKeyOfCredential(FAKE_SECRET, HASH_OF_THE_SECOND),
      ],
    ]);
    expect(calls.deletedDesigns).toEqual([["design-one", "design-two"]]);
  });

  it("does nothing for no design: no read, no counter, no delete", async () => {
    await deleteMintedDesigns([]);

    expect(calls.order).toEqual([]);
  });

  it("still deletes designs that hold no write credential, sending no key for them", async () => {
    calls.hashesToFind = [];

    await deleteMintedDesigns(["seeded"]);

    expect(calls.keys).toEqual([[]]);
    expect(calls.deletedDesigns).toEqual([["seeded"]]);
  });

  it("deletes no design when the counters could not be removed, so no hash is lost with its row", async () => {
    vi.stubEnv("LEMNARIA_E2E_RUN_SECRET", undefined);

    await expect(deleteMintedDesigns(["design-one"])).rejects.toThrow(
      /found no LEMNARIA_E2E_RUN_SECRET/,
    );

    expect(calls.deletedDesigns).toEqual([]);
  });
});

describe("removeSaveCountersOfDesigns", () => {
  it("answers the rows it removed and the hits they counted, so a spec that saved can require one", async () => {
    expect(await removeSaveCountersOfDesigns(["design-one"])).toEqual({
      rowsRemoved: 2,
      hitsCounted: 4,
    });
  });
});
