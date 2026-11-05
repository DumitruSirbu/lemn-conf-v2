import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemUsageProbe } from "../src/m10-ports.js";
import {
  NeonKitchenUsageReader,
  USAGE_DESIGN_PAGE_SIZE,
} from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * A call given up on stops. The abort is checked before the walk's first page, between its pages and before each count in
 * SQL, so a late walk issues at most the statement already in flight and never fires its counts.
 */
const COLOUR: ItemRef = { kind: "finish", finishId: "veneer.nuc" };
const MATERIAL = { kind: "material", tierId: "material.veneer" } as const;
const EVERY_DESIGN: ItemUsageProbe = {
  via: "migrated-design",
  item: COLOUR,
  isUsedBy: () => true,
};
const A_TIER: ItemUsageProbe = {
  via: "settings-tier",
  item: MATERIAL,
  isFallback: false,
};

const READABLE_DOCUMENT = JSON.parse(
  JSON.stringify({ ...KITCHEN_L_DESIGN, placements: [] }),
) as unknown;

function fullPage(pageNumber: number) {
  return Array.from({ length: USAGE_DESIGN_PAGE_SIZE }, (_, offset) => ({
    id: `d${String(pageNumber * USAGE_DESIGN_PAGE_SIZE + offset).padStart(6, "0")}`,
    schema_version: 5,
    document: READABLE_DOCUMENT,
  }));
}

/** Queues full pages for the walk, and aborts once the page numbered `abortAfter` has been served. */
function servePagesAbortingAfter(
  abortAfter: number,
  controller: AbortController,
): void {
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    queryDriver.replies.push(() => {
      if (pageNumber + 1 === abortAfter) controller.abort();
      return Promise.resolve(fullPage(pageNumber));
    });
  }
}

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a count whose signal is aborted", () => {
  it("issues no statement when it was aborted before it began", async () => {
    const controller = new AbortController();
    controller.abort();

    const failure = await rejectionOf(
      newReader().countEach([EVERY_DESIGN, A_TIER], controller.signal),
    );

    expect(failure).toBeDefined();
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("asks for no page after the one in flight when the signal aborts during the walk", async () => {
    const controller = new AbortController();
    servePagesAbortingAfter(1, controller);

    const failure = await rejectionOf(
      newReader().countEach([EVERY_DESIGN], controller.signal),
    );

    expect(failure).toBeDefined();
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("fires none of its counts in SQL when the walk is aborted, though the probes asked for them", async () => {
    const controller = new AbortController();
    servePagesAbortingAfter(2, controller);

    const failure = await rejectionOf(
      newReader().countEach([A_TIER, EVERY_DESIGN], controller.signal),
    );

    expect(failure).toBeDefined();
    expect(queryDriver.statements).toHaveLength(2);
  });

  it("fires none of its counts in SQL when the signal aborts as the walk's last page is served", async () => {
    const controller = new AbortController();
    queryDriver.replies.push(() => {
      controller.abort();
      return Promise.resolve([]);
    });
    queryDriver.replies.push(() => Promise.resolve([{ designs: 4 }]));

    const failure = await rejectionOf(
      newReader().countEach([A_TIER, EVERY_DESIGN], controller.signal),
    );

    expect(failure).toBeDefined();
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("fires no count in SQL for a set of SQL probes aborted before the fan-out", async () => {
    const controller = new AbortController();
    controller.abort();

    const failure = await rejectionOf(
      newReader().countEach([A_TIER, A_TIER], controller.signal),
    );

    expect(failure).toBeDefined();
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("walks every page and counts when the signal is never aborted, so it is the abort that stopped the others", async () => {
    const controller = new AbortController();
    queryDriver.replies.push(() => Promise.resolve(fullPage(0)));
    queryDriver.replies.push(() => Promise.resolve([]));
    queryDriver.replies.push(() => Promise.resolve([{ designs: 4 }]));

    const result = await newReader().countEach(
      [A_TIER, EVERY_DESIGN],
      controller.signal,
    );

    expect(result.counts.map(({ designCount }) => designCount)).toEqual([
      4,
      USAGE_DESIGN_PAGE_SIZE,
    ]);
    expect(queryDriver.statements).toHaveLength(3);
  });
});
