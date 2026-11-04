import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  judgeBookAgainstCatalog,
  MAX_BULK_PERCENT,
  MAX_CABINET_AMOUNT_MINOR,
  MIN_BULK_PERCENT,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  FakeCatalogueAvailabilityStore,
  FakeDashboardAuditLedger,
  FakePriceBookStore,
  FakeRevisionHead,
} from "@lemnaria/persistence";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { stampedWithItsVersionId } from "@/lib/server/price-book-test-seed";
import type { PriceStores } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
} from "../../../support/price-dashboard-requests";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

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
// The bulk planner is NOT mocked: these tests are the route with the domain's own planner behind it (M10 M2, R2's Q8), which
// no other route test exercises, since each of them hands the route a stand-in whose arithmetic is no authority.
const world = vi.hoisted(() => ({
  stores: undefined as unknown as PriceStores,
}));
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => Promise.resolve(world.stores),
}));

/**
 * `POST /api/staff/prices/bulk` end to end with the real planner, on the shipped sample book (which the domain's judgement
 * accepts, so a refusal below is the percentage's and not the book's). Every refusal is shown to leave the draft and the
 * audit log exactly as they were.
 */

const TEN_LEI_MINOR = 1_000n;

let publishers = 0;
let ledger: FakeDashboardAuditLedger;
let priceBook: FakePriceBookStore;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  await publish(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  void console_;
});

async function publish(book: PriceBook): Promise<void> {
  const { sessions, now } = currentAccountWorld();
  ledger = new FakeDashboardAuditLedger({ sessions, now });
  const availability = new FakeCatalogueAvailabilityStore({
    head: new FakeRevisionHead(),
    ledger,
  });
  priceBook = new FakePriceBookStore({ ledger, availability, now });
  const publisher = await signedInAs(
    { role: "administrator" },
    `price-publisher-${String((publishers += 1))}@example.test`,
  );
  const published = await priceBook.publish({
    expectedDraftRevision: "0",
    expectedActiveSequence: 0,
    expectedAvailabilityRevision: "0",
    createdItems: [],
    label: "Version 1",
    note: "",
    book,
    changeSummary: [],
    audit: {
      session: {
        sessionTokenHash: publisher.session.tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-published",
        detail: { provisional: book.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") throw new Error("seed: publish refused");
  world.stores = {
    priceBook: stampedWithItsVersionId(priceBook),
    availability,
  };
}

async function administrator() {
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  return session.cookie;
}

interface StoredChange {
  address: Record<string, unknown>;
  value: number;
  groupId?: string;
  bulk?: Record<string, unknown>;
}

async function currentDraftRevision(): Promise<string> {
  return (await priceBook.readDraft()).draftRevision;
}

async function storedChanges(): Promise<StoredChange[]> {
  return (await priceBook.readDraft()).changes as StoredChange[];
}

function draftAuditRows() {
  return ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published");
}

async function bulk(cookie: string, target: unknown, percent: unknown) {
  return bulkDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      target,
      percent,
    },
  });
}

async function pend(
  cookie: string,
  ruleId: string,
  field: string,
  value: number,
) {
  const answer = await changeDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      change: { address: { kind: "cabinet", ruleId, field }, value },
    },
  });
  expect(answer.status).toBe(200);
}

async function snapshot() {
  return {
    revision: await currentDraftRevision(),
    changes: structuredClone(await storedChanges()),
    audit: structuredClone(draftAuditRows()),
  };
}

/** r10(x × (100 + p) / 100) from A-14 alone, in BigInt. */
function oracle(amountMinor: number, percent: number): number {
  const numerator = BigInt(amountMinor) * BigInt(100 + percent);
  return Number(((numerator + 50_000n) / 100_000n) * TEN_LEI_MINOR);
}

function currentAmountOf(change: StoredChange): number {
  const ruleId = change.address.ruleId;
  const formula = SAMPLE_PRICE_BOOK.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined) throw new Error("No such rule");
  if (change.address.kind === "cabinet-size") {
    if (formula.shape !== "price-per-size") throw new Error("Not fixed-size");
    const size = formula.sizes.find(
      ({ widthMm }) => widthMm === change.address.widthMm,
    );
    if (size === undefined) throw new Error("No such size");
    return size.amountMinor;
  }
  return Reflect.get(formula, change.address.field as string) as number;
}

const MANUFACTURER_RULE_IDS = SAMPLE_PRICE_BOOK.cabinetRules
  .filter((rule) => rule.suppliedBy !== "customer")
  .map((rule) => rule.ruleId);
const CUSTOMER_RULE_IDS = SAMPLE_PRICE_BOOK.cabinetRules
  .filter((rule) => rule.suppliedBy === "customer")
  .map((rule) => rule.ruleId);

describe("the world these tests stand on", () => {
  it("is a book the domain's judgement accepts, so no refusal below is the book's", () => {
    expect(
      judgeBookAgainstCatalog(
        SAMPLE_PRICE_BOOK,
        buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
      ),
    ).toEqual({ ok: true });
  });
});

describe("a real bulk request returns the domain's plan", () => {
  it.each([5, -10, 33, MAX_BULK_PERCENT, MIN_BULK_PERCENT])(
    "stores every scaled amount at A-14's r10 value for %i %%, as one group, and only those that moved",
    async (percent) => {
      const cookie = await administrator();

      const answer = await bulk(cookie, { scope: "all" }, percent);

      expect(answer.status).toBe(200);
      const changes = await storedChanges();
      expect(changes.length).toBeGreaterThan(0);
      for (const change of changes) {
        expect(change.value).toBe(oracle(currentAmountOf(change), percent));
        expect(change.value).not.toBe(currentAmountOf(change));
        expect(change.value % 1_000).toBe(0);
        expect(CUSTOMER_RULE_IDS).not.toContain(change.address.ruleId);
        expect(["cabinet", "cabinet-size"]).toContain(change.address.kind);
      }
      expect(new Set(changes.map(({ groupId }) => groupId)).size).toBe(1);
      expect(changes.map(({ bulk: stored }) => stored)).toEqual(
        changes.map(() => ({ percent, scope: "all" })),
      );
    },
  );

  it("counts, in the answer and in the one audit row, exactly the amounts that moved and the cabinets they belong to", async () => {
    const cookie = await administrator();

    const answer = await bulk(cookie, { scope: "all" }, 7);

    const changes = await storedChanges();
    const body = (await jsonOf(answer)) as {
      ruleCount: number;
      amountCount: number;
    };
    expect(body.amountCount).toBe(changes.length);
    expect(body.ruleCount).toBe(
      new Set(changes.map(({ address }) => address.ruleId)).size,
    );
    expect(draftAuditRows().map(({ detail }) => detail)).toEqual([
      {
        scope: "all",
        percent: 7,
        ruleCount: body.ruleCount,
        amountCount: body.amountCount,
      },
    ]);
  });

  it("touches nothing but the cabinets: the candidate the draft makes differs from the active book only in cabinet amounts", async () => {
    const cookie = await administrator();

    await bulk(cookie, { scope: "all" }, 12);

    const addressKinds = new Set(
      (await storedChanges()).map(({ address }) => address.kind),
    );
    expect(
      [...addressKinds].every(
        (kind) => kind === "cabinet" || kind === "cabinet-size",
      ),
    ).toBe(true);
  });

  it.each([
    ["base", /^base-(?!corner)/],
    ["wall", /^(wall-(?!corner)|open-shelf|hood)/],
    ["tall", /^(tall-|fridge-free)/],
    ["corner", /corner/],
  ] as const)(
    "a %s group scales the rows of that group and none of another",
    async (groupCode, belongs) => {
      const cookie = await administrator();

      const answer = await bulk(cookie, { scope: "group", groupCode }, 5);

      expect(answer.status).toBe(200);
      const touched = new Set(
        (await storedChanges()).map(({ address }) => address.ruleId as string),
      );
      expect(touched.size).toBeGreaterThan(0);
      for (const ruleId of touched) {
        expect(ruleId.replace(/^cabinet\./, "")).toMatch(belongs);
      }
      const changes = await storedChanges();
      expect(changes.map(({ bulk: stored }) => stored)).toEqual(
        changes.map(() => ({ percent: 5, scope: "group", groupCode })),
      );
    },
  );

  it("the four groups together touch every manufacturer cabinet once, and the customer rows never", async () => {
    const cookie = await administrator();

    for (const groupCode of ["base", "wall", "tall", "corner"]) {
      expect(
        (await bulk(cookie, { scope: "group", groupCode }, 5)).status,
      ).toBe(200);
    }

    const touched = new Set(
      (await storedChanges()).map(({ address }) => address.ruleId as string),
    );
    expect(touched).toEqual(new Set(MANUFACTURER_RULE_IDS));
  });

  it("is scaled from the candidate: a bulk after a pending price scales that price, and replaces it", async () => {
    const cookie = await administrator();
    await pend(cookie, "cabinet.base-3drawer", "anchorMinor", 200_000);

    await bulk(
      cookie,
      { scope: "selection", ruleIds: ["cabinet.base-3drawer"] },
      10,
    );

    const anchors = (await storedChanges()).filter(
      ({ address }) =>
        address.ruleId === "cabinet.base-3drawer" &&
        address.field === "anchorMinor",
    );
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.value).toBe(oracle(200_000, 10));
  });

  it("asked twice for the same percentage scales the already scaled prices again, replacing, never duplicating an address", async () => {
    const cookie = await administrator();
    const target = { scope: "selection", ruleIds: ["cabinet.base-3drawer"] };

    await bulk(cookie, target, 10);
    const once = await storedChanges();
    await bulk(cookie, target, 10);
    const twice = await storedChanges();

    expect(twice).toHaveLength(once.length);
    const addresses = twice.map(({ address }) => JSON.stringify(address));
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const change of twice) {
      const first = once.find(
        ({ address }) =>
          JSON.stringify(address) === JSON.stringify(change.address),
      );
      if (first === undefined) throw new Error("Not in the first group");
      expect(change.value).toBe(oracle(first.value, 10));
    }
  });
});

describe("a refusal of the real planner answers 400 on the member, and writes nothing", () => {
  async function expectRefusedAndUntouched(
    answer: Response,
    issue: { field: string; code: string },
    before: Awaited<ReturnType<typeof snapshot>>,
  ) {
    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [issue],
    });
    expect(await snapshot()).toEqual(before);
  }

  it("refuses a percentage that leaves a cabinet at zero with PRICE_WOULD_BE_NEGATIVE on percent (D3C)", async () => {
    const cookie = await administrator();
    // 175 000 - 6 x 25 000 = 25 000 at the narrowest width today; at -90 % the anchor rounds to 18 000 and the six steps to
    // 6 x 3 000, which is 0.
    await pend(cookie, "cabinet.base-3drawer", "anchorMinor", 175_000);
    const before = await snapshot();

    const answer = await bulk(
      cookie,
      { scope: "selection", ruleIds: ["cabinet.base-3drawer"] },
      -90,
    );

    await expectRefusedAndUntouched(
      answer,
      { field: "percent", code: "PRICE_WOULD_BE_NEGATIVE" },
      before,
    );
  });

  it("refuses a percentage that takes a price past what a cabinet may cost, with PERCENT_OUT_OF_RANGE on percent", async () => {
    const cookie = await administrator();
    const nearTheBound = Math.floor(MAX_CABINET_AMOUNT_MINOR / 1_000) * 1_000;
    await pend(cookie, "cabinet.base-3drawer", "anchorMinor", nearTheBound);
    const before = await snapshot();

    const answer = await bulk(
      cookie,
      { scope: "selection", ruleIds: ["cabinet.base-3drawer"] },
      5,
    );

    await expectRefusedAndUntouched(
      answer,
      { field: "percent", code: "PERCENT_OUT_OF_RANGE" },
      before,
    );
  });

  it.each([MAX_BULK_PERCENT + 1, MIN_BULK_PERCENT - 1, 1_000, -100])(
    "refuses %i %%, past the bulk bound, with PERCENT_OUT_OF_RANGE on percent",
    async (percent) => {
      const cookie = await administrator();
      const before = await snapshot();

      const answer = await bulk(cookie, { scope: "all" }, percent);

      await expectRefusedAndUntouched(
        answer,
        { field: "percent", code: "PERCENT_OUT_OF_RANGE" },
        before,
      );
    },
  );

  it("refuses a bulk action every scaled amount of which rounds back to its current value, so no empty group is written", async () => {
    const cookie = await administrator();
    await pend(cookie, "cabinet.base-3drawer", "anchorMinor", 1_000);
    await pend(cookie, "cabinet.base-3drawer", "perStepWiderMinor", 1_000);
    await pend(cookie, "cabinet.base-3drawer", "perStepNarrowerMinor", 0);
    const before = await snapshot();

    const answer = await bulk(
      cookie,
      { scope: "selection", ruleIds: ["cabinet.base-3drawer"] },
      1,
    );

    await expectRefusedAndUntouched(
      answer,
      { field: "percent", code: "PERCENT_OUT_OF_RANGE" },
      before,
    );
  });

  it("refuses a selection of customer-supplied rows only, naming ruleIds", async () => {
    const cookie = await administrator();
    const before = await snapshot();

    const answer = await bulk(
      cookie,
      { scope: "selection", ruleIds: CUSTOMER_RULE_IDS },
      5,
    );

    await expectRefusedAndUntouched(
      answer,
      { field: "ruleIds", code: "NO_CABINETS_SELECTED" },
      before,
    );
  });

  it("refuses a fraction and a percentage of -0 before the planner is asked", async () => {
    const cookie = await administrator();
    const before = await snapshot();

    const fraction = await bulk(cookie, { scope: "all" }, 1.5);
    const negativeZero = await bulkDraft({
      cookie,
      json: `{"expectedDraftRevision":"${before.revision}","target":{"scope":"all"},"percent":-0}`,
    });

    await expectRefusedAndUntouched(
      fraction,
      { field: "percent", code: "NOT_A_WHOLE_NUMBER" },
      before,
    );
    await expectRefusedAndUntouched(
      negativeZero,
      { field: "percent", code: "PERCENT_OUT_OF_RANGE" },
      before,
    );
  });

  // FAILING ON PURPOSE: the route names `scope` for a group or an "all" that holds no cabinet (`fieldOfEmptyTarget`), and
  // `ruleIds` only for a selection, but when the domain planner itself answers NO_CABINETS_SELECTED the route's
  // `fieldOfBulkRefusal` names `ruleIds` whatever the scope, a member a group request does not carry.
  it("names scope, as an empty group is named everywhere else, when the book holds no cabinet of the group the real planner is asked for", async () => {
    const withoutCorners: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.filter(
        ({ buildId }) => !buildId.includes("corner"),
      ),
    };
    await publish(withoutCorners);
    const cookie = await administrator();
    const before = await snapshot();

    const answer = await bulk(
      cookie,
      { scope: "group", groupCode: "corner" },
      5,
    );

    await expectRefusedAndUntouched(
      answer,
      { field: "scope", code: "NO_CABINETS_SELECTED" },
      before,
    );
  });
});
