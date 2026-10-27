import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PriceBook } from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
  readState,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_BOOK,
  ANCHORED_RULE_ID,
  FIXED_SIZES_RULE_ID,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import {
  plannerCalls,
  resetTestBulkPlanner,
} from "../../../support/test-bulk-planner";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);
vi.mock("@/lib/server/price-dashboard/bulk-planner", () =>
  import("../../../support/test-bulk-planner").then((world) =>
    world.bulkPlannerModule(),
  ),
);

/**
 * Adversarial QA of M10 R2's review round: a draft that holds changes the book now refuses (stale ones) is healed by a revert
 * or a corrective write that adds no refusal, a write that adds one is still the person's to correct (400), and a bulk action
 * over a stale draft stays 409. The stale changes are stored as the fake store holds them, readable and refused by the book.
 */

let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  resetTestBulkPlanner();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administratorSession() {
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  return { cookie: session.cookie, tokenHash: session.tokenHash };
}

function draftRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published");
}

async function stored() {
  return prices.stores.priceBook.readDraft();
}

/** Replaces the stored draft wholesale, as the store would hold it after a book change made its changes stale. */
async function storeDraft(
  tokenHash: string,
  changes: readonly unknown[],
): Promise<string> {
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes: changes as never,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft was not written");
  return written.draftRevision;
}

const GONE_RULE = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 1_000,
};
const GONE_TIER = {
  address: {
    kind: "hardware",
    tierId: "hardware.gone",
    field: "perHingeMinor",
  },
  value: 1_000,
};
const DEPTH_TOO_LARGE = { address: { kind: "depth-rule" }, value: 5_000 };
const ANCHOR = {
  kind: "cabinet",
  ruleId: ANCHORED_RULE_ID,
  field: "anchorMinor",
} as const;
const ANCHOR_TOO_LARGE = { address: ANCHOR, value: 10 ** 13 };
const VALID_PROVISIONAL = { address: { kind: "provisional" }, value: true };
const STALE = [GONE_RULE, GONE_TIER, DEPTH_TOO_LARGE, ANCHOR_TOO_LARGE];

function put(
  cookie: string,
  address: unknown,
  value: unknown,
  revision: string,
) {
  return changeDraft({
    cookie,
    json: {
      expectedDraftRevision: revision,
      change: { address, value },
    },
  });
}

async function revert(cookie: string, address: unknown) {
  return revertDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      target: { kind: "change", address },
    },
  });
}

function permutations<Item>(items: readonly Item[]): Item[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe("a draft holding stale changes", () => {
  it("is read as it is: a 200 that lists every change, stale or not", async () => {
    const { cookie, tokenHash } = await administratorSession();
    await storeDraft(tokenHash, [...STALE, VALID_PROVISIONAL]);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(200);
    const served = (await jsonOf(answer)) as {
      draft: { changes: unknown[] };
    };
    expect(served.draft.changes).toHaveLength(STALE.length + 1);
  });

  it.each(
    permutations([GONE_RULE, GONE_TIER, DEPTH_TOO_LARGE]).map((order) => [
      order,
    ]),
  )(
    "has each stale change taken out one by one in any order (%#), every revert a 200 with one row, the valid change kept",
    async (order) => {
      const { cookie, tokenHash } = await administratorSession();
      await storeDraft(tokenHash, [
        GONE_RULE,
        VALID_PROVISIONAL,
        GONE_TIER,
        DEPTH_TOO_LARGE,
      ]);
      let rows = draftRows().length;

      for (const change of order) {
        const answer = await revert(cookie, change.address);
        expect(answer.status, JSON.stringify(change.address)).toBe(200);
        rows += 1;
        expect(draftRows()).toHaveLength(rows);
      }

      expect((await stored()).changes).toEqual([VALID_PROVISIONAL]);
    },
  );

  it("takes the valid change out first while the stale ones stay, and they can then be removed", async () => {
    const { cookie, tokenHash } = await administratorSession();
    await storeDraft(tokenHash, [GONE_RULE, VALID_PROVISIONAL, GONE_TIER]);

    const valid = await revert(cookie, VALID_PROVISIONAL.address);
    const first = await revert(cookie, GONE_RULE.address);
    const second = await revert(cookie, GONE_TIER.address);

    expect([valid.status, first.status, second.status]).toEqual([
      200, 200, 200,
    ]);
    expect((await stored()).changes).toEqual([]);
  });

  it("has a corrective write replace a stale change with a valid one, the other stale changes staying", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraft(tokenHash, [
      GONE_RULE,
      DEPTH_TOO_LARGE,
      ANCHOR_TOO_LARGE,
    ]);

    const answer = await put(cookie, { kind: "depth-rule" }, 20, revision);

    expect(answer.status).toBe(200);
    const { changes } = await stored();
    expect(changes).toContainEqual({
      address: { kind: "depth-rule" },
      value: 20,
    });
    expect(changes).toContainEqual(GONE_RULE);
    expect(changes).toContainEqual(ANCHOR_TOO_LARGE);
    expect(changes).not.toContainEqual(DEPTH_TOO_LARGE);
    expect(changes).toHaveLength(3);
  });

  it("refuses a write that replaces a stale change with another refused value: 400 on the change, nothing written", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraft(tokenHash, [
      DEPTH_TOO_LARGE,
      VALID_PROVISIONAL,
    ]);
    const rowsBefore = draftRows().length;

    const answer = await put(cookie, { kind: "depth-rule" }, 9_999, revision);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "TOO_LARGE" }],
    });
    expect((await stored()).changes).toEqual([
      DEPTH_TOO_LARGE,
      VALID_PROVISIONAL,
    ]);
    expect(draftRows()).toHaveLength(rowsBefore);
  });

  it.each([
    ["a rule the book does not have", GONE_RULE.address, 1_000, "UNKNOWN_RULE"],
    [
      "a hardware class the book does not have",
      GONE_TIER.address,
      1_000,
      "UNKNOWN_ITEM",
    ],
    [
      "a price past the bound on a row with no stale change",
      { kind: "hardware", tierId: "hardware.standard", field: "perHingeMinor" },
      10 ** 13,
      "TOO_LARGE",
    ],
  ])(
    "refuses a write that adds %s, 400 with M1's code, while the stale changes stay unwritten-over",
    async (_title, address, value, code) => {
      const { cookie, tokenHash } = await administratorSession();
      const revision = await storeDraft(tokenHash, [
        address === GONE_RULE.address ? DEPTH_TOO_LARGE : GONE_RULE,
        VALID_PROVISIONAL,
      ]);
      const before = (await stored()).changes;
      const rowsBefore = draftRows().length;

      const answer = await put(cookie, address, value, revision);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code }],
      });
      expect((await stored()).changes).toEqual(before);
      expect(draftRows()).toHaveLength(rowsBefore);
    },
  );

  it("lets a valid change elsewhere through, and keeps every stale change as it was", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraft(tokenHash, [...STALE]);

    const answer = await put(cookie, { kind: "provisional" }, true, revision);

    expect(answer.status).toBe(200);
    const { changes } = await stored();
    expect(changes).toHaveLength(STALE.length + 1);
    for (const change of STALE) expect(changes).toContainEqual(change);
  });

  it("is still 409 candidate-refused for a bulk action, which plans nothing and writes nothing", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraft(tokenHash, [
      GONE_RULE,
      VALID_PROVISIONAL,
    ]);
    const rowsBefore = draftRows().length;

    const answer = await bulkDraft({
      cookie,
      json: {
        expectedDraftRevision: revision,
        target: { scope: "all" },
        percent: 5,
      },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "candidate-refused" });
    expect(plannerCalls).toEqual([]);
    expect(draftRows()).toHaveLength(rowsBefore);
    expect((await stored()).changes).toHaveLength(2);
  });

  it("has a group taken out whole while a stale change stays", async () => {
    const { cookie, tokenHash } = await administratorSession();
    await storeDraft(tokenHash, []);
    const bulk = await bulkDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { scope: "all" },
        percent: 5,
      },
    });
    expect(bulk.status).toBe(200);
    const grouped = (await stored()).changes as { groupId?: string }[];
    const groupId = grouped[0]?.groupId ?? "";
    await storeDraft(tokenHash, [GONE_RULE, ...grouped]);

    const answer = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { kind: "group", groupId },
      },
    });

    expect(answer.status).toBe(200);
    expect((await stored()).changes).toEqual([GONE_RULE]);
  });

  it("reverts both of two stored changes at one address with one request, even when one of them is stale", async () => {
    const { cookie, tokenHash } = await administratorSession();
    await storeDraft(tokenHash, [
      { address: ANCHOR, value: 125_000 },
      ANCHOR_TOO_LARGE,
      GONE_RULE,
    ]);

    const answer = await revert(cookie, ANCHOR);

    expect(answer.status).toBe(200);
    expect((await stored()).changes).toEqual([GONE_RULE]);
  });

  it("is not healed by a revert that touches a stale change's address with a changed refusal: a revert of an address the draft lacks is 400, whatever else is stale", async () => {
    const { cookie, tokenHash } = await administratorSession();
    await storeDraft(tokenHash, [GONE_RULE]);
    const rowsBefore = draftRows().length;

    const answer = await revert(cookie, { kind: "provisional" });

    expect(answer.status).toBe(400);
    expect(draftRows()).toHaveLength(rowsBefore);
    expect((await stored()).changes).toEqual([GONE_RULE]);
  });

  it("is emptied by a discard-all too, and a stale draft never makes that a 409 candidate-refused", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraft(tokenHash, [...STALE]);

    const answer = await revertDraft({
      cookie,
      json: { expectedDraftRevision: revision, scope: "all" },
    });

    expect(answer.status).toBe(200);
    expect((await stored()).changes).toEqual([]);
    expect(draftRows().at(-1)?.detail).toEqual({
      changeKind: "discard-all",
      revertedCount: STALE.length,
    });
    expect(console_.everything()).not.toContain("cabinet.gone");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Can a revert newly break another change?

const EDITABLE_ADDRESSES = (() => {
  const book: PriceBook = ANCHORED_BOOK;
  const hardware = book.hardware.tiers.flatMap((tier) =>
    (
      [
        "perHingeMinor",
        "perDrawerMinor",
        "perPushToOpenMinor",
        "perLiftMinor",
      ] as const
    ).map((field) => ({ kind: "hardware", tierId: tier.tierId, field })),
  );
  const material = book.material.tiers
    .filter((tier) => tier.tierId !== book.material.defaultTierId)
    .map((tier) => ({
      kind: "material",
      tierId: tier.tierId,
      field: "percentOfCabinets",
    }));
  const cabinets = [ANCHOR].concat(
    (["perStepWiderMinor", "perStepNarrowerMinor"] as const).map((field) => ({
      ...ANCHOR,
      field,
    })) as never,
  );
  const sizes = [400, 600].map((widthMm) => ({
    kind: "cabinet-size",
    ruleId: FIXED_SIZES_RULE_ID,
    widthMm,
  }));
  return [
    ...hardware,
    ...material,
    ...cabinets,
    ...sizes,
    { kind: "depth-rule" },
    { kind: "provisional" },
  ];
})();

const POOL = [0, 1, 7, 5_000, 100_000, 140_000, 999_999_999_999] as const;

describe("a draft the routes accepted", () => {
  it.each([11, 22, 33, 44, 55, 66, 77, 88])(
    "(seed %i) can always be taken apart one change at a time, in any order: no accepted draft has a revert that newly breaks another change",
    async (seed) => {
      const { cookie } = await administratorSession();

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.integer({ min: 0, max: EDITABLE_ADDRESSES.length - 1 }),
              fc.constantFrom(...POOL),
            ),
            { minLength: 1, maxLength: 6 },
          ),
          fc.infiniteStream(fc.nat()),
          async (steps, randomness) => {
            const emptied = await revertDraft({
              cookie,
              json: {
                expectedDraftRevision: await currentDraftRevision(),
                scope: "all",
              },
            });
            expect(emptied.status).toBe(200);
            for (const [index, value] of steps) {
              const address = EDITABLE_ADDRESSES[index];
              const written = await put(
                cookie,
                address,
                address?.kind === "provisional" ? true : value,
                await currentDraftRevision(),
              );
              expect(
                [200, 400, 409],
                JSON.stringify([address, value]),
              ).toContain(written.status);
            }
            const held = (await stored()).changes as { address: unknown }[];
            const remaining = [...held];
            const draw = randomness[Symbol.iterator]();
            while (remaining.length > 0) {
              const pick = (draw.next().value as number) % remaining.length;
              const [next] = remaining.splice(pick, 1);
              const answer = await revert(cookie, next?.address);
              expect(
                answer.status,
                `reverting ${JSON.stringify(next?.address)} of ${JSON.stringify(held)}`,
              ).toBe(200);
            }
            expect((await stored()).changes).toEqual([]);
          },
        ),
        { numRuns: 40, seed },
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// The draft is read before the active version

describe("a publish that lands between the two reads of a request", () => {
  async function publishAnotherVersion(tokenHash: string): Promise<void> {
    const published = await prices.priceBook.publish({
      expectedDraftRevision: await currentDraftRevision(),
      expectedActiveSequence: 1,
      expectedAvailabilityRevision: "1",
      createdItems: [],
      label: "Version 2",
      note: "",
      book: ANCHORED_BOOK,
      changeSummary: [],
      audit: {
        session: {
          sessionTokenHash: tokenHash,
          idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
        },
        entry: {
          action: "price-published",
          detail: { provisional: ANCHORED_BOOK.amountsProvisional },
        },
      },
    });
    if (published.kind !== "ok") throw new Error("seed: publish refused");
  }

  it("advances the draft revision, so the revision a page read before it is no longer the draft's", async () => {
    const { tokenHash } = await administratorSession();
    const before = await currentDraftRevision();

    await publishAnotherVersion(tokenHash);

    expect(await currentDraftRevision()).not.toBe(before);
  });

  it("cannot make a write judged against the newer book land on the older draft: the write is 409 and nothing is stored", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await currentDraftRevision();
    const readDraft = prices.stores.priceBook.readDraft.bind(
      prices.stores.priceBook,
    );
    let isFirstRead = true;
    vi.spyOn(prices.stores.priceBook, "readDraft").mockImplementation(
      async () => {
        const draft = await readDraft();
        if (isFirstRead) {
          isFirstRead = false;
          await publishAnotherVersion(tokenHash);
        }
        return draft;
      },
    );
    const rowsBefore = draftRows().length;

    const answer = await put(cookie, { kind: "depth-rule" }, 20, revision);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    vi.restoreAllMocks();
    expect((await stored()).changes).toEqual([]);
    expect(draftRows()).toHaveLength(rowsBefore);
  });
});
