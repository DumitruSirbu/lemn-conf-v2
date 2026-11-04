import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { NeonPriceNoticeStore } from "../src/neon-price-notice-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
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
 * What `NeonPriceNoticeStore` does with replies and failures a database can give that the happy path never shows: a
 * missing grant on each method, a reply with a flag absent or a row too few, and a refused write that must not read as
 * accepted. No database: the driver is the mocked one.
 */
const DESIGN_ID = "D".repeat(21);
const PAIR = { versionId: "V".repeat(21), availabilityRevision: "7" };

function newStore(): NeonPriceNoticeStore {
  return new NeonPriceNoticeStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function aDriverError(code: string) {
  return Object.assign(new Error("driver text"), {
    name: "NeonDbError",
    code,
  });
}

async function failureOf(
  call: () => Promise<unknown>,
  failure: DashboardStoreFailure,
): Promise<void> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("a role without the grants of 0028 or a database without its table", () => {
  const calls = [
    [
      "a read",
      (store: NeonPriceNoticeStore) => store.readAcknowledged(DESIGN_ID),
    ],
    [
      "a first open",
      (store: NeonPriceNoticeStore) => store.recordIfAbsent(DESIGN_ID, PAIR),
    ],
    [
      "an acknowledgement",
      (store: NeonPriceNoticeStore) =>
        store.recordAcknowledged(DESIGN_ID, PAIR),
    ],
  ] as const;

  it.each(
    calls.flatMap(([name, call]) =>
      (["42501", "42P01"] as const).map((code) => [name, code, call] as const),
    ),
  )(
    "reads %s failing with SQLSTATE %s as unavailable, so a route answers 503",
    async (_name, code, call) => {
      failQueryWith(aDriverError(code));

      await failureOf(() => call(newStore()), "unavailable");
    },
  );
});

describe("an acknowledgement's reply", () => {
  it.each([
    ["no row", []],
    [
      "a row without the version flag",
      [{ is_revision_ahead: false, written_rows: 1 }],
    ],
    [
      "a row without the revision flag",
      [{ is_version_known: true, written_rows: 1 }],
    ],
    [
      "a row without the count",
      [{ is_version_known: true, is_revision_ahead: false }],
    ],
    [
      "a negative count",
      [{ is_version_known: true, is_revision_ahead: false, written_rows: -1 }],
    ],
    [
      "a null flag",
      [{ is_version_known: null, is_revision_ahead: false, written_rows: 1 }],
    ],
  ])(
    "with %s is an unexpected answer, never an accepted write",
    async (_name, reply) => {
      answerQueryWith(reply);

      await failureOf(
        () => newStore().recordAcknowledged(DESIGN_ID, PAIR),
        "unexpected-answer",
      );
      expect(queryDriver.statements).toHaveLength(1);
    },
  );

  it("reads a known version at an ahead revision as revision-ahead even if the count claims a write", async () => {
    answerQueryWith([
      { is_version_known: true, is_revision_ahead: true, written_rows: 1 },
    ]);

    expect(await newStore().recordAcknowledged(DESIGN_ID, PAIR)).toEqual({
      kind: "revision-ahead",
    });
  });
});

describe("a first open's reply", () => {
  it("returns undefined whatever rows the driver answers, because nothing it says decides anything", async () => {
    answerQueryWith([{ anything: 1 }]);

    await expect(
      newStore().recordIfAbsent(DESIGN_ID, PAIR),
    ).resolves.toBeUndefined();
  });
});

describe("a marker the database holds", () => {
  it.each([
    ["no version", { availability_revision: "7" }],
    [
      "a null version",
      { acknowledged_version_id: null, availability_revision: "7" },
    ],
    [
      "a null revision",
      { acknowledged_version_id: "V".repeat(21), availability_revision: null },
    ],
    [
      "a revision past a bigint",
      {
        acknowledged_version_id: "V".repeat(21),
        availability_revision: "9223372036854775808",
      },
    ],
    [
      "a negative revision",
      { acknowledged_version_id: "V".repeat(21), availability_revision: "-1" },
    ],
  ])("with %s is an unexpected answer", async (_name, row) => {
    answerQueryWith([row]);

    await failureOf(
      () => newStore().readAcknowledged(DESIGN_ID),
      "unexpected-answer",
    );
  });

  it("reads the widest revision a bigint holds back as the same text", async () => {
    answerQueryWith([
      {
        acknowledged_version_id: "V".repeat(21),
        availability_revision: "9223372036854775807",
      },
    ]);

    expect(await newStore().readAcknowledged(DESIGN_ID)).toEqual({
      kind: "recorded",
      acknowledged: {
        versionId: "V".repeat(21),
        availabilityRevision: "9223372036854775807",
      },
    });
  });
});
