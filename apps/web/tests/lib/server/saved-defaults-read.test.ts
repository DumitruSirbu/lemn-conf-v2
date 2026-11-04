import { NONE_SAVED, type KitchenDefaultsStore } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import {
  SavedDefaultsUnreadableError,
  readSavedDefaults,
} from "@/lib/server/catalogue-availability";

// The defaults the dashboard has saved, as a judgement reads them: `{}` when none were saved, the parsed settings when a
// row is, and a thrown defect when a row is not settings. A row that does not parse is never `{}`.

function storeHolding(stored: unknown): { defaults: KitchenDefaultsStore } {
  return {
    defaults: {
      read: () =>
        Promise.resolve({
          kind: "saved",
          saved: { revision: "1", defaults: stored, savedAt: new Date(0) },
        }),
      save: () => Promise.reject(new Error("a read saves nothing")),
    },
  };
}

describe("reading the saved defaults", () => {
  it("is {} when none were ever saved", async () => {
    const stores = {
      defaults: {
        read: () => Promise.resolve(NONE_SAVED),
        save: () => Promise.reject(new Error("a read saves nothing")),
      },
    };

    expect(await readSavedDefaults(stores)).toEqual({});
  });

  it("is {} for a saved row that holds {}", async () => {
    expect(await readSavedDefaults(storeHolding({}))).toEqual({});
  });

  it("is the settings a saved row holds", async () => {
    const stored = {
      materialTierId: "material.veneer",
      cabinetDepthMm: 600,
      handle: "black",
    };

    expect(await readSavedDefaults(storeHolding(stored))).toEqual(stored);
  });

  it.each([
    ["null", null],
    ["a list", []],
    ["text", "{}"],
    ["a handle that is not one", { handle: "gold" }],
    ["a key a new kitchen does not take", { colour: "red" }],
  ])(
    "throws for a saved row holding %s, and never answers {}",
    async (_description, stored) => {
      await expect(
        readSavedDefaults(storeHolding(stored)),
      ).rejects.toBeInstanceOf(SavedDefaultsUnreadableError);
    },
  );

  it("hands on a store that cannot answer, unchanged", async () => {
    const failure = new Error("the store is down");
    const stores = {
      defaults: {
        read: () => Promise.reject(failure),
        save: () => Promise.reject(failure),
      },
    };

    await expect(readSavedDefaults(stores)).rejects.toBe(failure);
  });
});
