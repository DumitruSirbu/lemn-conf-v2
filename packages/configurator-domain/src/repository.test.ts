import { describe, expect, it } from "vitest";

import type { Design } from "./design.js";
import type { ConfigurationRepository, DesignId } from "./repository.js";
import { DesignNotFoundError, InvalidDesignError } from "./repository.js";

const design: Design = {
  room: { shape: "linear", widthMm: 3000, depthMm: 2000, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

class InMemoryConfigurationRepository implements ConfigurationRepository {
  private readonly rows = new Map<DesignId, Design>();
  private nextId = 1;

  save(id: DesignId | null, value: Design): Promise<DesignId> {
    const rowId = id ?? `design-${String(this.nextId++)}`;
    this.rows.set(rowId, value);
    return Promise.resolve(rowId);
  }

  load(id: DesignId): Promise<Design> {
    const row = this.rows.get(id);
    if (!row) return Promise.reject(new DesignNotFoundError(id));
    return Promise.resolve(row);
  }
}

describe("ConfigurationRepository", () => {
  it("mints a new id on save with id: null, then loads the same design back", async () => {
    const repository = new InMemoryConfigurationRepository();

    const id = await repository.save(null, design);
    const loaded = await repository.load(id);

    expect(loaded).toEqual(design);
  });

  it("updates the existing row when save is called with an existing id", async () => {
    const repository = new InMemoryConfigurationRepository();
    const id = await repository.save(null, design);

    const updated: Design = { ...design, presetId: "preset-a" };
    await repository.save(id, updated);
    const loaded = await repository.load(id);

    expect(loaded.presetId).toBe("preset-a");
  });

  it("rejects load with DesignNotFoundError for an unknown id", async () => {
    const repository = new InMemoryConfigurationRepository();

    await expect(repository.load("missing")).rejects.toThrow(DesignNotFoundError);
  });
});

describe("InvalidDesignError", () => {
  it("can be thrown and caught as a distinct error type", () => {
    expect(() => {
      throw new InvalidDesignError("placements[0].alongMm is not an integer");
    }).toThrow(InvalidDesignError);
  });
});
