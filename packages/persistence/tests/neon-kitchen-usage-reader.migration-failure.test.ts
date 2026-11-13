import type { ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import type { ItemUsageProbe } from "../src/m10-ports.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

const SECRET = "DOCUMENT-TEXT-SECRET-5d2a";

/** A migration that fails the way a defect does (a `TypeError`) for one document, and as the domain refuses for another. */
vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    migrateDesign: (schemaVersion: number, document: unknown) => {
      const { kind } = document as { kind: string };
      if (kind === "defect") throw new TypeError(SECRET);
      if (kind === "refused") throw new actual.InvalidDesignError(SECRET);
      return { kind } as never;
    },
  };
});

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The walk reads a stored design as the product does, and takes a refusal by the domain of a stored document to mean the
 * design cannot be read. Any other failure of the migration is not that: it is a defect, and a defect in the migration
 * would otherwise read every design as one that uses nothing.
 */
const COLOUR: ItemRef = { kind: "finish", finishId: "veneer.nuc" };
const EVERY_DESIGN: ItemUsageProbe = {
  via: "migrated-design",
  item: COLOUR,
  isUsedBy: () => true,
};

function row(kind: string, position: number) {
  return {
    id: `row-${String(position).padStart(16, "0")}`,
    schema_version: 5,
    document: { kind },
  };
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a migration that fails while the walk reads a stored design", () => {
  it("leaves out a design the domain refuses, as the product cannot open it, and counts it as unreadable", async () => {
    answerQueryWith([row("refused", 0), row("fine", 1)]);

    const result = await new NeonKitchenUsageReader(
      WELL_FORMED_UNREACHABLE_VALUE,
    ).countEach([EVERY_DESIGN]);

    expect(result).toEqual({
      counts: [{ item: COLOUR, designCount: 1 }],
      unreadableDesigns: 1,
    });
  });

  it("fails the call for any other failure, and says nothing of the failure or the document", async () => {
    answerQueryWith([row("fine", 0), row("defect", 1)]);

    const rejection = await rejectionOf(
      new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE).countEach([
        EVERY_DESIGN,
      ]),
    );

    expect(rejection).toBeInstanceOf(DashboardStoreError);
    expect((rejection as DashboardStoreError).failure).toBe(
      "unexpected-answer",
    );
    expect((rejection as DashboardStoreError).cause).toBeUndefined();
    expect(JSON.stringify([rejection])).not.toContain(SECRET);
    expect((rejection as DashboardStoreError).message).not.toContain(SECRET);
  });
});
