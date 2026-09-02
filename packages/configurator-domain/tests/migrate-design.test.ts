import { describe, expect, it } from "vitest";

import { migrateDesign } from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";

const validDesignV1 = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("migrateDesign", () => {
  it("passes a valid version 1 payload through unchanged", () => {
    expect(migrateDesign(1, validDesignV1)).toEqual(validDesignV1);
  });

  it("throws InvalidDesignError, not a raw Zod error, for an invalid payload", () => {
    const invalid = { ...validDesignV1, room: undefined };

    expect(() => migrateDesign(1, invalid)).toThrow(InvalidDesignError);
  });

  it("throws a clear error for an unsupported schema version", () => {
    expect(() => migrateDesign(3, validDesignV1)).toThrow(InvalidDesignError);
    expect(() => migrateDesign(3, validDesignV1)).toThrow(
      /unsupported schema version/,
    );
  });
});
