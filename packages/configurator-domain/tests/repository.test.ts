import { describe, expect, it } from "vitest";

import type { Design } from "../src/design.js";
import type { ConfigurationRepository, DesignId } from "../src/repository.js";
import { DesignNotFoundError } from "../src/repository.js";

const design: Design = {
  room: { shape: "linear", widthMm: 3000, depthMm: 2000, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

/** `failure-text.ts` caps a reason at 300 characters; the sentence around it and the truncation mark fit in 100. */
const LONGEST_NOT_FOUND_MESSAGE = 400;

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

    await expect(repository.load("missing")).rejects.toThrow(
      DesignNotFoundError,
    );
  });

  // The id is a URL segment the caller wrote, and this message is written verbatim into the 404.
  it("names the id it was asked for on one bounded line, whatever the caller wrote", () => {
    const absurdId = `a\u0000\u001b[31m\n${"x".repeat(5_000)}`;

    const { message } = new DesignNotFoundError(absurdId);

    expect(new DesignNotFoundError("missing").message).toBe(
      'No design found for id "missing"',
    );
    expect(message).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
    expect(message.length).toBeLessThan(LONGEST_NOT_FOUND_MESSAGE);
  });
});
