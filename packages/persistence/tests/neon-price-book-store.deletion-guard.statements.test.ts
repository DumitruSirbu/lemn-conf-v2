import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
} from "../src/m10-ports.js";
import type {
  DashboardStoreFailure,
  DeletedItem,
  PublishPriceBookRequest,
} from "../src/m10-ports.js";
import {
  countDesignsChoosingTierStatement,
  countDesignsPlacingBodiesStatement,
} from "../src/kitchen-usage-statements.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import { deletedItemsJsonOf } from "../src/price-book-statements.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
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

/**
 * The publish statement's guard on the deleted items, read as the driver receives it, with no database: that it splices
 * the very predicate text the usage reader's counts send, that the store reads its reply in the order the plan gives, and what it sends
 * to the guard. What the guard finds in real rows is the live file's (`neon-price-book-store.live.test.ts`).
 */
const SESSION = {
  sessionTokenHash: "a".repeat(64),
  idleLifetimeSeconds: { client: 1, operator: 1, administrator: 1 },
};
const MATERIAL = { kind: "material", tierId: "material.veneer" } as const;
const HARDWARE = { kind: "hardware", tierId: "hardware.premium" } as const;
const ACCESSORY = { kind: "accessory", accessoryId: "plinth-light" } as const;
const DELETED: readonly DeletedItem[] = [
  { item: MATERIAL },
  { item: ACCESSORY, buildIds: ["base-3drawer", "base-3drawer-seeded"] },
  { item: HARDWARE },
];

function itemDeleted(item: object) {
  return { address: { kind: "item-deleted", item }, value: true };
}

function aPublishRequest(
  overrides: Partial<PublishPriceBookRequest> = {},
): PublishPriceBookRequest {
  return {
    expectedDraftRevision: "3",
    expectedActiveSequence: 4,
    expectedAvailabilityRevision: "7",
    label: "November",
    note: "",
    book: { version: "2026-10" },
    changeSummary: DELETED.map(({ item }) => itemDeleted(item)),
    createdItems: [],
    deletedItems: DELETED,
    audit: {
      session: SESSION,
      entry: { action: "price-published", detail: { provisional: true } },
    },
    ...overrides,
  };
}

const REFUSED_ROW = {
  draft_rows: 1,
  availability_revision: null,
  version_id: null,
  sequence_number: null,
  is_session_live: true,
  is_sequence_current: true,
  in_use_positions: [],
  unlinked_accessories: 0,
  publish_complete: 1,
};

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonPriceBookStore {
  return new NeonPriceBookStore(WELL_FORMED_UNREACHABLE_VALUE);
}

async function publishAnswered(
  row: object,
  request = aPublishRequest(),
): Promise<unknown> {
  resetQueryDriver();
  answerQueryWith([{ ...REFUSED_ROW, ...row }]);
  return newStore().publish(request);
}

async function failureOf(
  pending: PromiseLike<unknown>,
  failure: DashboardStoreFailure,
): Promise<void> {
  const rejection = await rejectionOf(pending);
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
}

function sentStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one statement");
  }
  return statement;
}

/** What a count statement sends, as the text of its `where` clause with each slot as `?`. */
function predicateOf(statement: SentQuery): string {
  return normalised(statement).split(" where ")[1] ?? "";
}

function recordedStatement(
  strings: TemplateStringsArray,
  ...values: unknown[]
) {
  return { text: strings.join("?"), values };
}

/** Puts each operand where the count statement sent a slot, in order, as the publish's guard gives them. */
function withOperands(predicate: string, operands: readonly string[]): string {
  const remaining = [...operands];
  return predicate.replace(/\?/g, () => {
    const operand = remaining.shift();
    if (operand === undefined) throw new Error("the predicate has more slots");
    return operand;
  });
}

beforeEach(() => {
  mintedIds.count = 0;
  resetQueryDriver();
});
afterEach(resetQueryDriver);

describe("the predicate the publish's guard shares with the usage counts", () => {
  it("is the tier count's text, with the guard's columns where the count binds its values", async () => {
    const count = countDesignsChoosingTierStatement(recordedStatement, {
      settingKey: "materialTierId",
      tierId: "material.veneer",
      isFallback: false,
    });
    await publishAnswered({});

    const guarded = withOperands(predicateOf(count), [
      "deleted.setting_key",
      "( deleted.item_id = (select b.book #>> array[deleted.kind, 'defaulttierid'] from active_book b) )",
      "deleted.item_id",
      "deleted.item_id",
    ]);

    expect(normalised(sentStatement())).toContain(guarded);
  });

  it("is the body count's text, with the guard's build ids where the count binds its set", async () => {
    const count = countDesignsPlacingBodiesStatement(recordedStatement, ["x"]);
    await publishAnswered({});

    const guarded = withOperands(predicateOf(count), [
      "array(select jsonb_array_elements_text(deleted.build_ids))",
    ]);

    expect(normalised(sentStatement())).toContain(guarded);
  });

  it("is written once: the publish's own source holds no copy of a design's document path or its deletion mark", () => {
    const source = readFileSync(
      new URL("../src/price-book-statements.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("deleted_by_client_at");
    expect(source).not.toContain("'placements'");
    expect(source).not.toContain("materialTierId");
    expect(source).not.toContain("buildId'");
  });
});

describe("what the publish sends the guard", () => {
  it("is the deleted items as one JSON text, one object each, numbered from 1 in the request's order", async () => {
    await publishAnswered({});

    expect(JSON.parse(deletedItemsJsonOf(DELETED)) as unknown).toEqual([
      {
        position: 1,
        kind: "material",
        item_id: "material.veneer",
        setting_key: "materialTierId",
        build_ids: [],
      },
      {
        position: 2,
        kind: "accessory",
        item_id: "plinth-light",
        setting_key: null,
        build_ids: ["base-3drawer", "base-3drawer-seeded"],
      },
      {
        position: 3,
        kind: "hardware",
        item_id: "hardware.premium",
        setting_key: "hardwareTierId",
        build_ids: [],
      },
    ]);
    expect(sentStatement().values).toContain(deletedItemsJsonOf(DELETED));
  });

  it("holds the head's move back while any deleted item is in use or any linked accessory is not placed by its row", async () => {
    await publishAnswered({});

    const text = normalised(sentStatement());
    expect(text).toContain(
      "and not exists (select 1 from in_use) and not exists (select 1 from unlinked_deletions)",
    );
    expect(text).toContain("where exists (select 1 from actor) and (");
  });
});

describe("what the store makes of the guard's reply", () => {
  it("answers item-in-use, naming the request's items at the positions found, in their order", async () => {
    const result = await publishAnswered({ in_use_positions: [1, 3] });

    expect(result).toEqual({
      kind: "item-in-use",
      items: [MATERIAL, HARDWARE],
    });
  });

  it("answers item-in-use over a head or a draft that moved", async () => {
    const overHead = await publishAnswered({ in_use_positions: [2] });
    const overDraft = await publishAnswered({
      in_use_positions: [2],
      draft_rows: 0,
    });
    const overSequence = await publishAnswered({
      in_use_positions: [2],
      is_sequence_current: false,
    });

    for (const result of [overHead, overDraft, overSequence]) {
      expect(result).toEqual({ kind: "item-in-use", items: [ACCESSORY] });
      expect(result).not.toBe(AVAILABILITY_CHANGED_MEANWHILE);
      expect(result).not.toBe(CHANGED_MEANWHILE);
    }
  });

  it("reads a call with no live session as not-recorded before it reads a use", async () => {
    await failureOf(
      publishAnswered({ is_session_live: false, in_use_positions: [1] }),
      "not-recorded",
    );
  });

  it("refuses as an invalid request a linked accessory the book does not place by its row, over a use", async () => {
    await failureOf(
      publishAnswered({ unlinked_accessories: 1, in_use_positions: [1] }),
      "invalid-request",
    );
  });

  it("reads a reply with no deleted item in use as the compare-and-set refusals it was", async () => {
    expect(await publishAnswered({})).toBe(AVAILABILITY_CHANGED_MEANWHILE);
    expect(await publishAnswered({ draft_rows: 0 })).toBe(CHANGED_MEANWHILE);
  });

  it.each([
    ["a position the request has no item at", { in_use_positions: [4] }],
    ["a position of zero", { in_use_positions: [0] }],
    ["a position that is not a whole number", { in_use_positions: [1.5] }],
    ["a position that is text", { in_use_positions: ["1"] }],
    ["positions that are no list", { in_use_positions: "1" }],
    ["no positions", { in_use_positions: undefined }],
    [
      "a count of unlinked accessories that is no count",
      {
        unlinked_accessories: "none",
      },
    ],
  ])("refuses %s as an unexpected answer", async (_name, row) => {
    await failureOf(publishAnswered(row), "unexpected-answer");
  });
});
