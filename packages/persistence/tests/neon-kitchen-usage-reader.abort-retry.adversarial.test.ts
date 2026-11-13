import type { ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemUsageProbe } from "../src/m10-ports.js";
import { NeonKitchenUsageReader } from "../src/neon-kitchen-usage-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * A count given up on issues at most the statement already in flight (the port's own words). A read that fails transiently
 * is repeated by the store's retry, which is a new statement: it must not be sent once the signal has aborted.
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
const EMPTY_REPLY = "Unexpected end of JSON input";

/** A reply that aborts the call as it fails in the way the store repeats. */
function failTransientlyAfterAborting(controller: AbortController): void {
  queryDriver.replies.push(() => {
    controller.abort();
    return Promise.reject(new SyntaxError(EMPTY_REPLY));
  });
}

function newReader(): NeonKitchenUsageReader {
  return new NeonKitchenUsageReader(WELL_FORMED_UNREACHABLE_VALUE);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a count aborted while a statement of it fails transiently", () => {
  it("does not repeat the page it was reading", async () => {
    const controller = new AbortController();
    failTransientlyAfterAborting(controller);
    queryDriver.replies.push(() => Promise.resolve([]));

    await newReader()
      .countEach([EVERY_DESIGN], controller.signal)
      .catch(() => undefined);

    expect(queryDriver.statements).toHaveLength(1);
  });

  it("does not repeat its count in SQL", async () => {
    const controller = new AbortController();
    failTransientlyAfterAborting(controller);
    queryDriver.replies.push(() => Promise.resolve([{ designs: 4 }]));

    await newReader()
      .countEach([A_TIER], controller.signal)
      .catch(() => undefined);

    expect(queryDriver.statements).toHaveLength(1);
  });

  it("is rejected, and never resolves with a count", async () => {
    const controller = new AbortController();
    failTransientlyAfterAborting(controller);
    queryDriver.replies.push(() => Promise.resolve([{ designs: 4 }]));

    const outcome = await newReader()
      .countEach([A_TIER], controller.signal)
      .then(
        () => "counted",
        () => "rejected",
      );

    expect(outcome).toBe("rejected");
  });
});

describe("a count whose signal carries a reason", () => {
  it("is rejected with that reason, so the caller can tell a deadline from a failure", async () => {
    const controller = new AbortController();
    const reason = new Error("the deadline");
    controller.abort(reason);

    const failure = await newReader()
      .countEach([A_TIER], controller.signal)
      .catch((caught: unknown) => caught);

    expect(failure).toBe(reason);
  });
});
