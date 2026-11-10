// The lifecycle clients: the stand-in judges a write the way a server would and counts only what it was seeded with, the
// default one asks the server in a production build, and the unavailable client claims no figure and writes nothing.
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import { defaultItemLifecycleClient } from "@/price-dashboard/default-item-lifecycle-client";
import { FETCHING_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/fetching-item-lifecycle-client";
import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import { deleteStandOf } from "@/price-dashboard/item-lifecycle-model";
import { inMemoryItemLifecycleClient } from "@/price-dashboard/item-lifecycle-stand-in-client";

const STANDARD: ItemRef = { kind: "hardware", tierId: "hardware.standard" };
const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };

const SEED = {
  book: SAMPLE_PRICE_BOOK,
  availability: { revision: "1", disabled: [] },
  defaults: {},
  usage: [{ item: HETTICH, designCount: 14 }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the stand-in", () => {
  it("writes a switch, moves the revision and reads the result back", async () => {
    const client = inMemoryItemLifecycleClient(SEED);

    const outcome = await client.setActive({
      expectedRevision: "1",
      item: HETTICH,
      active: false,
    });

    expect(outcome).toEqual({ kind: "set", revision: "2" });
    expect(await client.readAvailability()).toEqual({
      revision: "2",
      disabled: [HETTICH],
    });
  });

  it("refuses a stale revision as a conflict and writes nothing", async () => {
    const client = inMemoryItemLifecycleClient(SEED);

    const outcome = await client.setActive({
      expectedRevision: "0",
      item: HETTICH,
      active: false,
    });

    expect(outcome).toEqual({ kind: "conflict" });
    expect(await client.readAvailability()).toEqual(SEED.availability);
  });

  it("refuses with the domain's own word, the fixed default and the last option included, and writes nothing", async () => {
    const client = inMemoryItemLifecycleClient(SEED);

    expect(
      await client.setActive({
        expectedRevision: "1",
        item: STANDARD,
        active: false,
      }),
    ).toEqual({ kind: "refused", code: "item-is-fixed-default" });
    await client.setActive({
      expectedRevision: "1",
      item: HETTICH,
      active: false,
    });
    await client.setActive({
      expectedRevision: "2",
      item: BLUM,
      active: false,
    });
    expect(
      await client.setActive({
        expectedRevision: "3",
        item: STANDARD,
        active: false,
      }),
    ).toEqual({ kind: "refused", code: "last-active-option" });
  });

  it("counts an item its seed counts and says unavailable for any it does not, never a zero", async () => {
    const client = inMemoryItemLifecycleClient(SEED);

    expect(await client.readUsage([HETTICH])).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 14 }],
    });
    expect(await client.readUsage([HETTICH, BLUM])).toEqual({
      kind: "unavailable",
    });
  });
});

describe("the client a screen is given when none is handed in", () => {
  it("is the one that asks the server in a production build, whatever the page was seeded with", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(defaultItemLifecycleClient(SEED)).toBe(
      FETCHING_ITEM_LIFECYCLE_CLIENT,
    );
  });

  it("is the stand-in over what the page showed in any other build, loaded when first used", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const client = defaultItemLifecycleClient(SEED);

    expect(await client.readUsage([HETTICH])).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 14 }],
    });
  });
});

describe("the unavailable client", () => {
  it("writes nothing and counts nothing, and can delete nothing", async () => {
    const client = UNAVAILABLE_ITEM_LIFECYCLE_CLIENT;

    expect(client.canWrite).toBe(false);
    expect(
      deleteStandOf(BLUM as Parameters<typeof deleteStandOf>[0], {
        book: SAMPLE_PRICE_BOOK,
        availability: SEED.availability,
        defaults: {},
        canWrite: client.canWrite,
        isCreatedInDraft: () => true,
      }),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
    expect(
      await client.setActive({
        expectedRevision: "1",
        item: HETTICH,
        active: false,
      }),
    ).toEqual({ kind: "failed" });
    expect(await client.readUsage([HETTICH])).toEqual({ kind: "unavailable" });
    expect(await client.readAvailability()).toBeUndefined();
  });
});
