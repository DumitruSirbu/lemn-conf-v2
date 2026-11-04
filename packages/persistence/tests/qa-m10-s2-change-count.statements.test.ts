import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countPendingPrices } from "@lemnaria/configurator-domain";
import type { DraftChange } from "@lemnaria/configurator-domain";

import { DashboardStoreError } from "../src/m10-ports.js";
import type { PublishPriceBookRequest } from "../src/m10-ports.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import {
  listVersionsStatement,
  readActiveVersionStatement,
  readDraftStatement,
  readVersionStatement,
  seedPriceBookStatement,
} from "../src/price-book-statements.js";
import { changeSummaryArbitrary } from "./support/change-summary-arbitrary.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

const mintedIds = vi.hoisted(() => ({ count: 0 }));

vi.mock("nanoid", () => ({
  nanoid: () => String(++mintedIds.count).padStart(21, "0"),
}));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

// What the Neon publish statement carries as the version's change count, read from the values the driver received: the
// number that lands in `change_count` is the one value after the change summary's JSON, and the only number sent.

const SESSION = {
  sessionTokenHash: "a".repeat(64),
  idleLifetimeSeconds: { client: 1, operator: 1, administrator: 1 },
};
const PUBLISHED_ROW = {
  draft_rows: 1,
  availability_revision: "9",
  version_id: "000000000000000000001",
  sequence_number: "5",
  is_session_live: true,
  is_sequence_current: true,
  publish_complete: 1,
};
const BOOK = { version: "2026-10", material: { tiers: [{ tierId: "pal" }] } };
const FORGED_COUNT = 7;

const DEPTH: DraftChange = { address: { kind: "depth-rule" }, value: 40 };
const CREATED_CLASS: DraftChange = {
  address: { kind: "hardware-tier-created", tierId: "created" },
  value: { name: "Clasa", description: "O clasa." },
};
const HINGE_RATE: DraftChange = {
  address: { kind: "hardware", tierId: "created", field: "perHingeMinor" },
  value: 1_000,
};
const ANCHOR: DraftChange = {
  address: { kind: "cabinet", ruleId: "cabinet.base", field: "anchorMinor" },
  value: 5_000,
};

function aPublishRequest(
  changeSummary: unknown,
  audit: unknown = {
    session: SESSION,
    entry: { action: "price-published", detail: { provisional: true } },
  },
): PublishPriceBookRequest {
  return {
    expectedDraftRevision: "3",
    expectedActiveSequence: 4,
    expectedAvailabilityRevision: "7",
    label: "November",
    note: "",
    book: BOOK,
    changeSummary,
    createdItems: [],
    audit,
  } as PublishPriceBookRequest;
}

async function sentChangeCountOf(request: PublishPriceBookRequest) {
  resetQueryDriver();
  mintedIds.count = 0;
  answerQueryWith([PUBLISHED_ROW]);
  await new NeonPriceBookStore(WELL_FORMED_UNREACHABLE_VALUE).publish(request);
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the publish did not send exactly one statement");
  }
  const summaryAt = statement.values.indexOf(
    JSON.stringify(request.changeSummary),
  );
  return {
    slot: statement.values[summaryAt + 1],
    numbers: statement.values.filter((value) => typeof value === "number"),
  };
}

beforeEach(() => {
  mintedIds.count = 0;
  resetQueryDriver();
});
afterEach(resetQueryDriver);

describe("the change count NeonPriceBookStore sends with a publish", () => {
  it("is the count of the prices, not the summary's length and not a value a cast put in the audit entry", async () => {
    const changeSummary = [DEPTH, ANCHOR, CREATED_CLASS, HINGE_RATE];
    const forged = {
      session: SESSION,
      entry: {
        action: "price-published",
        detail: { provisional: true, changeCount: FORGED_COUNT },
      },
    };

    const sent = await sentChangeCountOf(
      aPublishRequest(changeSummary, forged),
    );

    expect(changeSummary).toHaveLength(4);
    expect(countPendingPrices(changeSummary)).toBe(3);
    expect(sent.slot).toBe(3);
    expect(sent.numbers).toEqual([3]);
  });

  it("is countPendingPrices(summary) for any summary of any address kind, and the only number sent", async () => {
    await fc.assert(
      fc.asyncProperty(changeSummaryArbitrary, async (summary) => {
        const sent = await sentChangeCountOf(aPublishRequest(summary));

        expect(sent.slot).toBe(countPendingPrices(summary));
        expect(sent.numbers).toEqual([countPendingPrices(summary)]);
      }),
      { numRuns: 200 },
    );
  });
});

describe("a summary entry that is no object (NeonPriceBookStore)", () => {
  it.each([
    ["null", [null]],
    ["undefined, which JSON stores as null", [undefined]],
    ["null among real changes", [ANCHOR, null, ANCHOR]],
  ])(
    "is refused as invalid-request before anything is sent: %s",
    async (_name, changeSummary) => {
      answerQueryWith([PUBLISHED_ROW]);
      const store = new NeonPriceBookStore(WELL_FORMED_UNREACHABLE_VALUE);

      const rejection = await rejectionOf(
        store.publish(aPublishRequest(changeSummary)),
      );

      expect(rejection).toBeInstanceOf(DashboardStoreError);
      expect((rejection as DashboardStoreError).failure).toBe(
        "invalid-request",
      );
      expect(queryDriver.statements).toHaveLength(0);
      expect(queryDriver.transactions).toHaveLength(0);
    },
  );
});

describe("an object entry whose row is no item (NeonPriceBookStore)", () => {
  const deletionOf = (item: unknown) => ({
    address: { kind: "item-deleted", item },
    value: true,
  });

  it.each([
    ["a deletion naming no row", [deletionOf(null)]],
    ["a deletion whose item is a string", [deletionOf("hardware")]],
    [
      "a deletion whose item has an unknown kind",
      [deletionOf({ kind: "x" }), ANCHOR],
    ],
  ])(
    "is refused, or sent with no more prices than the summary has entries: %s",
    async (_name, changeSummary) => {
      const outcome = await sentChangeCountOf(
        aPublishRequest(changeSummary),
      ).then(
        (sent) => sent,
        (failure: unknown) => failure,
      );

      if (outcome instanceof DashboardStoreError) {
        expect(outcome.failure).toBe("invalid-request");
        expect(queryDriver.statements).toHaveLength(0);
      } else {
        expect(outcome).not.toBeInstanceOf(Error);
        expect((outcome as { slot: number }).slot).toBeLessThanOrEqual(
          changeSummary.length,
        );
      }
    },
  );
});

describe("no statement of the price book derives a count from the stored summary", () => {
  const textOf = (strings: TemplateStringsArray) => strings.join("?");

  it("names jsonb_array_length in none of the seven statements", async () => {
    const direct = [
      readActiveVersionStatement(textOf),
      readVersionStatement(textOf, "v"),
      listVersionsStatement(textOf, { offset: 0, limit: 10 }),
      readDraftStatement(textOf),
      seedPriceBookStatement(textOf, {
        versionId: "v",
        label: "L",
        note: "",
        bookJson: "{}",
        ownerAccountId: "o",
      }),
    ];
    resetQueryDriver();
    answerQueryWith([PUBLISHED_ROW]);
    answerQueryWith([
      { revision: "4", is_session_live: true, audited_rows: 1 },
    ]);
    const store = new NeonPriceBookStore(WELL_FORMED_UNREACHABLE_VALUE);
    await store.publish(aPublishRequest([]));
    await store.writeDraft({
      expectedDraftRevision: "3",
      changes: [],
      audit: {
        session: SESSION,
        entry: {
          action: "price-draft-changed",
          detail: { changeKind: "depth-rule" },
        },
      },
    });

    const sent = queryDriver.statements.map(({ text }) => text);

    expect(sent).toHaveLength(2);
    for (const text of [...direct, ...sent]) {
      expect(text).not.toContain("jsonb_array_length");
    }
  });
});
