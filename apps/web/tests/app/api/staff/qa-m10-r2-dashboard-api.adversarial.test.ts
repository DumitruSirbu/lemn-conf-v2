import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRICE_GROUP_CODES,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import * as bulkRoute from "@/app/api/staff/prices/bulk/route";
import * as draftRoute from "@/app/api/staff/prices/draft/route";
import * as readRoute from "@/app/api/staff/prices/route";
import type {
  BulkPlan,
  BulkPlanner,
  PlannedCabinetPrice,
} from "@/lib/server/price-dashboard/bulk-planner";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
  readState,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_RULE_ID,
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  freshStaffWorld,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";
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
const planners = vi.hoisted(() => ({
  override: undefined as
    | import("@/lib/server/price-dashboard/bulk-planner").BulkPlanner
    | undefined,
}));
vi.mock("@/lib/server/price-dashboard/bulk-planner", () =>
  import("../../../support/test-bulk-planner").then((world) => ({
    getBulkPlanner: () => planners.override ?? world.testBulkPlanner,
  })),
);

/**
 * Adversarial QA of M10 wave R2 (the dashboard's read and draft API). It attacks what the developer's suites assume:
 * that ids and fields named like object members are judged and not looked up, that every address the book offers can be
 * written, audited and reverted, that a hostile body is a `4xx` and never a `503`, that nothing a person typed comes back,
 * that the guards and the account's buckets keep their order whatever the bucket holds, and that a race has one winner.
 */

let account: AccountWorld;
let prices: PriceDashboardWorld;
let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  account = freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  resetTestBulkPlanner();
  planners.override = undefined;
  limiterLedger.refusing.clear();
  limiterLedger.unavailable.clear();
  limiterLedger.counted.length = 0;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administrator(email = "administrator@example.test") {
  const { session } = await signedInAs({ role: "administrator" }, email);
  return session.cookie;
}

async function administratorSession(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return {
    cookie: session.cookie,
    tokenHash: session.tokenHash,
    accountId: account.id,
  };
}

/** Puts changes the draft's reader cannot read into the real fake store, as a bad migration or a hand edit would. */
async function storeDraftAsIs(
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

function draftRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published");
}

async function storedChanges() {
  return (await prices.stores.priceBook.readDraft()).changes;
}

async function putRaw(cookie: string, changeText: string, revision?: string) {
  const current = revision ?? (await currentDraftRevision());
  return changeDraft({
    cookie,
    json: `{"expectedDraftRevision":"${current}","change":${changeText}}`,
  });
}

async function revertRaw(cookie: string, targetText: string) {
  const current = await currentDraftRevision();
  return revertDraft({
    cookie,
    json: `{"expectedDraftRevision":"${current}","target":${targetText}}`,
  });
}

async function bulkRaw(
  cookie: string,
  targetText: string,
  percentText: string,
) {
  const current = await currentDraftRevision();
  return bulkDraft({
    cookie,
    json: `{"expectedDraftRevision":"${current}","target":${targetText},"percent":${percentText}}`,
  });
}

const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: ANCHORED_RULE_ID,
  field: "anchorMinor",
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Ids and fields named like members of an object

const MEMBER_LIKE_NAMES = [
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "__defineGetter__",
] as const;

describe("an id or a field that is named like a member of every object", () => {
  const ADDRESS_FACTORIES: readonly [
    string,
    (name: string) => Record<string, unknown>,
  ][] = [
    ["a cabinet rule id", (name) => ({ ...ANCHOR_ADDRESS, ruleId: name })],
    ["a cabinet field", (name) => ({ ...ANCHOR_ADDRESS, field: name })],
    [
      "a cabinet-size rule id",
      (name) => ({ kind: "cabinet-size", ruleId: name, widthMm: 400 }),
    ],
    [
      "a hardware tier id",
      (name) => ({ kind: "hardware", tierId: name, field: "perHingeMinor" }),
    ],
    [
      "a hardware field",
      (name) => ({
        kind: "hardware",
        tierId: "hardware.standard",
        field: name,
      }),
    ],
    [
      "a material tier id",
      (name) => ({
        kind: "material",
        tierId: name,
        field: "percentOfCabinets",
      }),
    ],
    [
      "a material field",
      (name) => ({ kind: "material", tierId: "material.pal", field: name }),
    ],
    [
      "an accessory id",
      (name) => ({
        kind: "accessory",
        accessoryId: name,
        field: "perUnitMinor",
      }),
    ],
    [
      "an accessory field",
      (name) => ({ kind: "accessory", accessoryId: "handle", field: name }),
    ],
  ];

  const CASES = ADDRESS_FACTORIES.flatMap(([title, make]) =>
    MEMBER_LIKE_NAMES.map((name) => [title, name, make(name)] as const),
  );

  it.each(CASES)(
    "as %s (%s) is a 400 on the change, never a 503, and writes nothing",
    async (_title, _name, address) => {
      const cookie = await administrator();
      const before = await currentDraftRevision();

      const answer = await putRaw(
        cookie,
        JSON.stringify({ address, value: 1_000 }),
      );

      expect(answer.status).toBe(400);
      expect(draftRows()).toEqual([]);
      expect((await prices.stores.priceBook.readDraft()).draftRevision).toBe(
        before,
      );
    },
  );

  it.each(CASES)(
    "as %s (%s) is a 400 on a revert, never a 503, and writes no audit row",
    async (_title, _name, address) => {
      const cookie = await administrator();

      const answer = await revertRaw(
        cookie,
        JSON.stringify({ kind: "change", address }),
      );

      expect(answer.status).toBe(400);
      expect(draftRows()).toEqual([]);
    },
  );

  it.each(MEMBER_LIKE_NAMES)(
    "as a group id (%s) is a 400 on a revert, and as a rule id in a selection a 400 on a bulk action",
    async (name) => {
      const cookie = await administrator();

      const reverted = await revertRaw(
        cookie,
        JSON.stringify({ kind: "group", groupId: name }),
      );
      const bulked = await bulkRaw(
        cookie,
        JSON.stringify({ scope: "selection", ruleIds: [name] }),
        "5",
      );

      expect(reverted.status).toBe(400);
      expect(bulked.status).toBe(400);
      expect(await jsonOf(bulked)).toEqual({
        status: "invalid-input",
        issues: [{ field: "ruleIds", code: "UNKNOWN_RULE" }],
      });
      expect(draftRows()).toEqual([]);
    },
  );

  it("as a member of the body itself is a request this route does not read, and pollutes nothing", async () => {
    const cookie = await administrator();
    const revision = await currentDraftRevision();

    const answer = await changeDraft({
      cookie,
      json: `{"__proto__":{"isAdmin":true},"expectedDraftRevision":"${revision}","change":{"address":{"kind":"depth-rule"},"value":20}}`,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(draftRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Every address the book offers

const ACCESSORY_IDS = ["sinkProtectiveCover", "dishDryingRack"] as const;
const CABINET_FIELDS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "perHeightStepMinor",
] as const;
const HARDWARE_FIELDS = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
] as const;
const REFUSAL_CODES_OF_AN_ADDRESS_THAT_IS_NOT_EDITABLE = [
  "FIELD_NOT_ON_RULE",
  "NOT_EDITABLE",
] as const;

function candidateAddressesOf(book: PriceBook) {
  return [
    ...book.cabinetRules.flatMap((rule) => {
      const formula = rule.formula as {
        sizes?: readonly { widthMm: number }[];
      };
      return [
        ...CABINET_FIELDS.map((field) => ({
          kind: "cabinet",
          ruleId: rule.ruleId,
          field,
        })),
        ...(formula.sizes ?? []).map(({ widthMm }) => ({
          kind: "cabinet-size",
          ruleId: rule.ruleId,
          widthMm,
        })),
      ];
    }),
    ...book.hardware.tiers.flatMap((tier) =>
      HARDWARE_FIELDS.map((field) => ({
        kind: "hardware",
        tierId: tier.tierId,
        field,
      })),
    ),
    ...book.material.tiers.map((tier) => ({
      kind: "material",
      tierId: tier.tierId,
      field: "percentOfCabinets",
    })),
    ...ACCESSORY_IDS.map((accessoryId) => ({
      kind: "accessory",
      accessoryId,
      field: "perUnitMinor",
    })),
    { kind: "depth-rule" },
    { kind: "provisional" },
  ] as const;
}

function activeAmountOf(
  book: PriceBook,
  address: Record<string, unknown>,
): number | undefined {
  const rule = book.cabinetRules.find(
    ({ ruleId }) => ruleId === address.ruleId,
  );
  const formula = rule?.formula as
    | { sizes?: { widthMm: number; amountMinor: number }[] }
    | Record<string, number>
    | undefined;
  if (address.kind === "cabinet-size") {
    return (
      formula as { sizes?: { widthMm: number; amountMinor: number }[] }
    ).sizes?.find(({ widthMm }) => widthMm === address.widthMm)?.amountMinor;
  }
  return (formula as Record<string, number> | undefined)?.[
    address.field as string
  ];
}

describe("every address the served book offers", () => {
  it("is written, answered, audited once and reverted once when the book allows it, and refused with a closed 400 when it does not (never a 503)", async () => {
    const cookie = await administrator();
    const served = (await jsonOf(await readState({ cookie }))) as {
      active: { book: PriceBook };
    };
    const addresses = candidateAddressesOf(served.active.book);
    let writtenCount = 0;
    const writtenKinds = new Set<string>();

    for (const address of addresses) {
      const rowsBefore = draftRows().length;
      const value = address.kind === "provisional" ? true : 1;

      const answer = await putRaw(cookie, JSON.stringify({ address, value }));

      if (answer.status === 200) {
        writtenCount += 1;
        writtenKinds.add(address.kind);
        expect(draftRows()).toHaveLength(rowsBefore + 1);
        const reverted = await revertRaw(
          cookie,
          JSON.stringify({ kind: "change", address }),
        );
        expect(reverted.status).toBe(200);
        expect(draftRows()).toHaveLength(rowsBefore + 2);
      } else {
        expect(answer.status, JSON.stringify(address)).toBe(400);
        const body = (await jsonOf(answer)) as {
          issues: { field: string; code: string }[];
        };
        expect(body.issues).toHaveLength(1);
        expect(REFUSAL_CODES_OF_AN_ADDRESS_THAT_IS_NOT_EDITABLE).toContain(
          body.issues[0]?.code,
        );
        expect(draftRows()).toHaveLength(rowsBefore);
      }
    }

    expect(writtenCount).toBeGreaterThan(10);
    expect([...writtenKinds].sort()).toEqual([
      "accessory",
      "cabinet",
      "cabinet-size",
      "depth-rule",
      "hardware",
      "material",
      "provisional",
    ]);
    expect(await storedChanges()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Hostile bodies

describe("a hostile body", () => {
  it("nested twelve hundred levels deep is a 400 and not a 503", async () => {
    const cookie = await administrator();
    const depth = 1_200;
    const nested = `${'{"a":'.repeat(depth)}0${"}".repeat(depth)}`;
    const revision = await currentDraftRevision();

    const answer = await changeDraft({
      cookie,
      json: `{"expectedDraftRevision":"${revision}","change":{"address":{"kind":"depth-rule"},"value":${nested}}}`,
    });

    expect(answer.status).toBe(400);
    expect(draftRows()).toEqual([]);
  });

  it("an array nested past what a stack allows is a 400, not a 503", async () => {
    const cookie = await administrator();
    const body = `${"[".repeat(4_000)}${"]".repeat(4_000)}`;

    const answer = await changeDraft({ cookie, json: body });

    expect(answer.status).toBe(400);
  });

  it("is 413 one byte past 8 KiB and judged at exactly 8 KiB", async () => {
    const cookie = await administrator();
    const prefix = '{"expectedDraftRevision":"0","change":{"pad":"';
    const suffix = '"}}';
    const exact = 8 * 1024 - prefix.length - suffix.length;

    const atBound = await changeDraft({
      cookie,
      json: `${prefix}${"x".repeat(exact)}${suffix}`,
    });
    const pastBound = await changeDraft({
      cookie,
      json: `${prefix}${"x".repeat(exact + 1)}${suffix}`,
    });

    expect(atBound.status).toBe(400);
    expect(pastBound.status).toBe(413);
  });

  it("a multi-byte body that is 8 KiB of characters but more of bytes is counted in bytes", async () => {
    const cookie = await administrator();
    const body = `{"expectedDraftRevision":"0","change":{"pad":"${"é".repeat(4_200)}"}}`;

    const answer = await changeDraft({ cookie, json: body });

    expect(answer.status).toBe(413);
  });

  it("a selection of hundreds of ids is read, deduplicated, and judged unknown without a planner call", async () => {
    const cookie = await administrator();
    const ids = Array.from(
      { length: 300 },
      (_, index) => `rule-${String(index)}`,
    );

    const answer = await bulkRaw(
      cookie,
      JSON.stringify({ scope: "selection", ruleIds: [...ids, ...ids] }),
      "5",
    );

    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(answer.status).toBeLessThan(500);
    expect(plannerCalls).toEqual([]);
    expect(draftRows()).toEqual([]);
  });

  it.each([
    ["a lone surrogate", "\\ud800"],
    ["a NUL", "\\u0000"],
    ["a right-to-left override", "\\u202e"],
    ["an emoji", "😀"],
  ])(
    "%s in an id is a closed 400 that echoes nothing",
    async (_title, escaped) => {
      const cookie = await administrator();

      const answer = await putRaw(
        cookie,
        `{"address":{"kind":"cabinet","ruleId":"SECRET${escaped}","field":"anchorMinor"},"value":1000}`,
      );

      expect(answer.status).toBe(400);
      expect(await answer.clone().text()).not.toContain("SECRET");
      expect(console_.everything()).not.toContain("SECRET");
      expect(draftRows()).toEqual([]);
    },
  );

  it.each([
    ["1e21", "a number written with an exponent"],
    ["1E2", "an exponent that is a whole number"],
    ["100.0", "a whole number written as a decimal"],
    ["-0.0", "negative zero written as a decimal"],
    ["0e5", "zero with an exponent"],
    ["9007199254740993", "an integer no double holds exactly"],
    ["1e400", "a number that overflows to Infinity"],
    ["-1e400", "a number that overflows to -Infinity"],
  ])(
    "%s as the percentage (%s) is never a 5xx and never stores a non-safe or negative-zero number",
    async (percentText) => {
      const cookie = await administrator();

      const answer = await bulkRaw(cookie, '{"scope":"all"}', percentText);

      expect(answer.status).toBeLessThan(500);
      for (const change of await storedChanges()) {
        const bulk = (change as { bulk?: { percent: number } }).bulk;
        if (bulk !== undefined) {
          expect(Number.isSafeInteger(bulk.percent)).toBe(true);
          expect(Object.is(bulk.percent, -0)).toBe(false);
        }
      }
      for (const row of draftRows()) {
        const percent = row.detail.percent;
        if (typeof percent === "number") {
          expect(Number.isSafeInteger(percent)).toBe(true);
          expect(Object.is(percent, -0)).toBe(false);
        }
      }
    },
  );

  it("a value of 1e21 for a price is TOO_LARGE, and of 1e400 (Infinity) is not a 5xx", async () => {
    const cookie = await administrator();
    const address = JSON.stringify(ANCHOR_ADDRESS);

    const huge = await putRaw(cookie, `{"address":${address},"value":1e21}`);
    const infinite = await putRaw(
      cookie,
      `{"address":${address},"value":1e400}`,
    );

    expect(huge.status).toBe(400);
    expect(await jsonOf(huge)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "TOO_LARGE" }],
    });
    expect(infinite.status).toBe(400);
    expect(draftRows()).toEqual([]);
  });

  it("a cabinet size of 1e21, of -0 and of a fraction is a closed 400 on a write and on a revert", async () => {
    const cookie = await administrator();
    for (const widthText of ["1e21", "-0", "400.5", "0", "-400"]) {
      const address = `{"kind":"cabinet-size","ruleId":"${ANCHORED_RULE_ID}","widthMm":${widthText}}`;

      const written = await putRaw(
        cookie,
        `{"address":${address},"value":1000}`,
      );
      const reverted = await revertRaw(
        cookie,
        `{"kind":"change","address":${address}}`,
      );

      expect(written.status, widthText).toBe(400);
      expect(reverted.status, widthText).toBe(400);
    }
    expect(draftRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The revision, as text

describe("the revision's shape", () => {
  it("agrees with a bigint reading of the same text for every digit string and refuses every other character", () => {
    const WIDEST = 2n ** 63n - 1n;
    const nearTheWidest = fc
      .bigInt({ min: WIDEST - 20n, max: WIDEST + 20n })
      .map(String);
    const anyWidth = fc.bigInt({ min: 0n, max: 2n ** 70n }).map(String);
    const withLeadingZeros = fc
      .tuple(fc.integer({ min: 0, max: 3 }), anyWidth)
      .map(([zeros, digits]) => `${"0".repeat(zeros)}${digits}`);
    const digitRun = fc.oneof(nearTheWidest, anyWidth, withLeadingZeros);
    const oracle = (text: string) =>
      /^(0|[1-9][0-9]*)$/.test(text) && BigInt(text) <= WIDEST;

    fc.assert(
      fc.property(digitRun, (text) => {
        expect(isRevisionShape(text)).toBe(oracle(text));
      }),
      { numRuns: 2_000 },
    );
  });

  it.each([
    ["a trailing newline", "5\n"],
    ["a leading newline", "\n5"],
    ["a leading space", " 5"],
    ["a plus sign", "+5"],
    ["an exponent", "1e3"],
    ["a decimal", "5.0"],
    ["full-width digits", "５"],
    ["Arabic-Indic digits", "٥"],
    ["a NUL after digits", "5\u0000"],
    ["a hex prefix", "0x5"],
    ["a thousands separator", "1,000"],
    ["the widest bigint plus one", "9223372036854775808"],
    ["twenty digits", "10000000000000000000"],
  ])("is refused with %s", async (_title, revision) => {
    expect(isRevisionShape(revision)).toBe(false);
    const cookie = await administrator();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: revision,
        change: { address: { kind: "depth-rule" }, value: 20 },
      },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "expectedDraftRevision", code: "NOT_A_WHOLE_NUMBER" }],
    });
    expect(priceStoreAsks.count).toBe(0);
  });

  it.each([
    ["an array", ["0"]],
    ["an object", { value: "0" }],
    ["true", true],
    ["a number", 0],
  ])(
    "as %s is MISSING_VALUE on a revert and a bulk action too",
    async (_title, revision) => {
      const cookie = await administrator();

      const reverted = await revertDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          target: { kind: "change", address: { kind: "provisional" } },
        },
      });
      const bulked = await bulkDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          target: { scope: "all" },
          percent: 5,
        },
      });

      for (const answer of [reverted, bulked]) {
        expect(answer.status).toBe(400);
        expect(await jsonOf(answer)).toEqual({
          status: "invalid-input",
          issues: [{ field: "expectedDraftRevision", code: "MISSING_VALUE" }],
        });
      }
      expect(priceStoreAsks.count).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Whatever arrives, the draft, the answer and the audit rows agree

const ECHO = "ECHO";

const hostileValue = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -5, max: 1_100_000_000_000 }),
  fc.double({ noNaN: true }),
  fc.string().map((text) => `${ECHO}${text}`),
  fc.array(
    fc.string().map((text) => `${ECHO}${text}`),
    { maxLength: 3 },
  ),
  fc.dictionary(
    fc.string().map((text) => `${ECHO}${text}`),
    fc.integer(),
    { maxKeys: 3 },
  ),
);

const hostileAddress = fc.oneof(
  fc.constant(ANCHOR_ADDRESS),
  fc.constant({ kind: "depth-rule" }),
  fc.constant({ kind: "provisional" }),
  fc.record(
    {
      kind: fc.constantFrom(
        "cabinet",
        "cabinet-size",
        "hardware",
        "material",
        "accessory",
        "depth-rule",
        "provisional",
        "hardware-tier-created",
        "item-deleted",
        "nowhere",
      ),
      ruleId: fc.string().map((text) => `${ECHO}${text}`),
      tierId: fc.constantFrom("hardware.standard", `${ECHO}x`, "__proto__"),
      field: fc.constantFrom(
        "anchorMinor",
        "perHingeMinor",
        "x",
        "constructor",
      ),
      widthMm: fc.oneof(fc.integer(), fc.double(), fc.constant("400")),
    },
    { requiredKeys: ["kind"] },
  ),
  fc.jsonValue(),
);

describe("whatever a signed-in administrator sends to the draft", () => {
  it("is answered 200, 400 or 409 and never 5xx; every 200 leaves exactly one audit row and the answer equals the stored draft; a refusal leaves none and echoes none", async () => {
    const cookie = await administrator();
    let accepted = 0;

    await fc.assert(
      fc.asyncProperty(
        hostileAddress,
        hostileValue,
        fc.constantFrom("put", "delete", "bulk"),
        async (address, value, route) => {
          const rowsBefore = draftRows().length;
          const revision = await currentDraftRevision();
          const body =
            route === "put"
              ? { expectedDraftRevision: revision, change: { address, value } }
              : route === "delete"
                ? {
                    expectedDraftRevision: revision,
                    target: { kind: "change", address },
                  }
                : {
                    expectedDraftRevision: revision,
                    target: { scope: "all" },
                    percent: value,
                  };

          const answer =
            route === "put"
              ? await changeDraft({ cookie, json: body })
              : route === "delete"
                ? await revertDraft({ cookie, json: body })
                : await bulkDraft({ cookie, json: body });

          expect([200, 400, 409]).toContain(answer.status);
          expect(answer.headers.get("cache-control")).toBe("private, no-store");
          if (answer.status === 200) {
            accepted += 1;
            expect(draftRows()).toHaveLength(rowsBefore + 1);
            const served = (await jsonOf(answer)) as {
              draft?: { draftRevision: string; changes: unknown };
              draftRevision?: string;
              changes?: unknown;
            };
            const draft = served.draft ?? served;
            expect(draft.draftRevision).toBe(await currentDraftRevision());
            expect(draft.changes).toEqual(await storedChanges());
          } else {
            expect(draftRows()).toHaveLength(rowsBefore);
            expect(await answer.clone().text()).not.toContain(ECHO);
          }
        },
      ),
      { numRuns: 300 },
    );

    expect(accepted).toBeGreaterThan(0);
    expect(console_.everything()).not.toContain(ECHO);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A race has one winner

describe("requests that race for one revision", () => {
  it("let exactly one of eight writes of mixed kinds win, leave one audit row and a draft that is the winner's alone", async () => {
    const cookie = await administrator();
    const revision = await currentDraftRevision();
    const ask = (index: number) => {
      if (index % 3 === 0) {
        return changeDraft({
          cookie,
          json: {
            expectedDraftRevision: revision,
            change: { address: ANCHOR_ADDRESS, value: 100_000 + index },
          },
        });
      }
      if (index % 3 === 1) {
        return bulkDraft({
          cookie,
          json: {
            expectedDraftRevision: revision,
            target: { scope: "all" },
            percent: 5 + index,
          },
        });
      }
      return changeDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          change: { address: { kind: "depth-rule" }, value: 10 + index },
        },
      });
    };

    const answers = await Promise.all(
      Array.from({ length: 8 }, (_, index) => ask(index)),
    );

    const statuses = answers.map(({ status }) => status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409, 409, 409]);
    expect(draftRows()).toHaveLength(1);
    const winner = answers.find(({ status }) => status === 200);
    const served = (await jsonOf(winner as Response)) as Record<
      string,
      unknown
    >;
    const draft = (served.draft ?? served) as { changes: unknown };
    expect(draft.changes).toEqual(await storedChanges());
  });

  it("answer a revert against the draft a racing write has already moved with 409 and leave only the write's row", async () => {
    const cookie = await administrator();
    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR_ADDRESS, value: 125_000 },
      },
    });
    const revision = await currentDraftRevision();
    const rowsBefore = draftRows().length;

    const [revert, write] = await Promise.all([
      revertDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          target: { kind: "change", address: ANCHOR_ADDRESS },
        },
      }),
      changeDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          change: { address: { kind: "depth-rule" }, value: 20 },
        },
      }),
    ]);

    expect([revert.status, write.status].sort()).toEqual([200, 409]);
    expect(draftRows()).toHaveLength(rowsBefore + 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The bulk action's own refusals and audit

describe("a bulk action", () => {
  it("whose selection holds only rows the planner leaves out is refused on the member the person corrects, ruleIds", async () => {
    const cookie = await administrator();
    const served = (await jsonOf(await readState({ cookie }))) as {
      active: { book: PriceBook };
    };
    const customerRule = served.active.book.cabinetRules.find(
      ({ suppliedBy }) => suppliedBy === "customer",
    );
    expect(customerRule).toBeDefined();

    const answer = await bulkRaw(
      cookie,
      JSON.stringify({
        scope: "selection",
        ruleIds: [customerRule?.ruleId],
      }),
      "5",
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "ruleIds", code: "NO_CABINETS_SELECTED" }],
    });
    expect(draftRows()).toEqual([]);
  });

  it.each([["0"], ["-0"], ["0.0"], ["-0.0"], ["0e5"], ["-0e-3"]])(
    "at a percentage written %s is refused 400 PERCENT_OUT_OF_RANGE on percent before the planner is asked, and writes nothing (ruling R2-Q7)",
    async (percentText) => {
      const cookie = await administrator();
      const before = await currentDraftRevision();

      const answer = await bulkRaw(cookie, '{"scope":"all"}', percentText);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "percent", code: "PERCENT_OUT_OF_RANGE" }],
      });
      expect(plannerCalls).toEqual([]);
      expect(draftRows()).toEqual([]);
      expect(await currentDraftRevision()).toBe(before);
    },
  );

  it("over each price group mints the group's code on every change and in its one audit row, and at least one group has cabinets to change", async () => {
    const cookie = await administrator();
    let writtenGroups = 0;

    for (const groupCode of PRICE_GROUP_CODES) {
      const rowsBefore = draftRows().length;
      const answer = await bulkRaw(
        cookie,
        JSON.stringify({ scope: "group", groupCode }),
        "10",
      );

      if (answer.status !== 200) {
        expect(answer.status, groupCode).toBe(400);
        expect(draftRows(), groupCode).toHaveLength(rowsBefore);
        continue;
      }
      writtenGroups += 1;
      const minted = ((await storedChanges()) as { bulk?: unknown }[]).filter(
        ({ bulk }) =>
          (bulk as { groupCode?: string } | undefined)?.groupCode === groupCode,
      );
      expect(minted.length, groupCode).toBeGreaterThan(0);
      for (const { bulk } of minted) {
        expect(bulk).toEqual({ percent: 10, scope: "group", groupCode });
      }
      expect(draftRows(), groupCode).toHaveLength(rowsBefore + 1);
      expect(draftRows().at(-1)?.detail).toMatchObject({
        scope: "group",
        groupCode,
        percent: 10,
      });
    }

    expect(writtenGroups).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The guards, the capability and the buckets keep their order

describe("with the account's bucket refusing", () => {
  const DRAFT_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;

  it("a cross-site, a non-JSON, an over-sized, a malformed and an unreadable-revision request are still answered by their own guard, not 429", async () => {
    const cookie = await administrator();
    limiterLedger.refusing.set(DRAFT_BUCKET, 5);
    const valid = {
      expectedDraftRevision: "0",
      change: { address: { kind: "depth-rule" }, value: 20 },
    };

    const crossSite = await changeDraft({
      cookie,
      json: valid,
      secFetchSite: "cross-site",
    });
    const notJson = await changeDraft({
      cookie,
      json: "x",
      contentType: "text/plain",
    });
    const tooLarge = await changeDraft({ cookie, json: "x".repeat(9_000) });
    const malformed = await changeDraft({ cookie, json: "{nope" });
    const badRevision = await changeDraft({
      cookie,
      json: { ...valid, expectedDraftRevision: "01" },
    });
    const anonymous = await changeDraft({ json: valid });
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    const operatorAnswer = await changeDraft({
      cookie: operator.session.cookie,
      json: valid,
    });

    expect(crossSite.status).toBe(403);
    expect(notJson.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(malformed.status).toBe(400);
    expect(badRevision.status).toBe(400);
    expect(anonymous.status).toBe(401);
    expect(operatorAnswer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
    expect(draftRows()).toEqual([]);
  });

  it("a revert and a bulk action are refused 429 by the same bucket and reach no store", async () => {
    const cookie = await administrator();
    limiterLedger.refusing.set(DRAFT_BUCKET, 5);

    const reverted = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: "0",
        target: { kind: "change", address: { kind: "provisional" } },
      },
    });
    const bulked = await bulkDraft({
      cookie,
      json: {
        expectedDraftRevision: "0",
        target: { scope: "all" },
        percent: 5,
      },
    });

    expect(reverted.status).toBe(429);
    expect(bulked.status).toBe(429);
    expect(priceStoreAsks.count).toBe(0);
    expect(plannerCalls).toEqual([]);
    expect(draftRows()).toEqual([]);
  });

  it("a read that is cross-site, anonymous or an operator's is not spent against the account's read bucket", async () => {
    const cookie = await administrator();
    const operator = await signedInAs({ role: "operator" }, "op2@example.test");
    limiterLedger.refusing.set(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name, 5);

    const crossSite = await readState({ cookie, secFetchSite: "cross-site" });
    const anonymous = await readState({});
    const operatorAnswer = await readState({ cookie: operator.session.cookie });
    const administratorAnswer = await readState({ cookie });

    expect(crossSite.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(operatorAnswer.status).toBe(403);
    expect(administratorAnswer.status).toBe(429);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("the routes' own methods", () => {
  it("declare no handler a framework could turn into a write or a state read where none was meant", () => {
    expect(Object.keys(readRoute).sort()).toEqual([
      "GET",
      "HEAD",
      "dynamic",
      "runtime",
    ]);
    expect(Object.keys(draftRoute).sort()).toEqual([
      "DELETE",
      "PUT",
      "dynamic",
      "runtime",
    ]);
    expect(Object.keys(bulkRoute).sort()).toEqual([
      "POST",
      "dynamic",
      "runtime",
    ]);
  });

  it("a read writes one price-catalogue-viewed row per request and none for a read refused by the bucket", async () => {
    const cookie = await administrator();

    await readState({ cookie });
    await readState({ cookie });
    limiterLedger.refusing.set(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name, 5);
    const refused = await readState({ cookie });

    expect(refused.status).toBe(429);
    const viewed = staffWorld.audit
      .heldEvents()
      .filter(({ action }) => action === "price-catalogue-viewed");
    expect(viewed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A stored draft is untrusted

describe("a stored draft that is not what a draft holds (ruling R2-Q2)", () => {
  const JUNK_CHANGES: readonly [string, unknown][] = [
    ["a change that is a string", "junk"],
    ["a change that is null", null],
    ["a change that is an array", []],
    ["a change with no address", { value: 1 }],
    [
      "a change whose value is text",
      { address: { kind: "provisional" }, value: "SECRET" },
    ],
    [
      "a change whose value is an object",
      { address: { kind: "provisional" }, value: {} },
    ],
    [
      "a groupId with no bulk",
      { address: ANCHOR_ADDRESS, value: 1, groupId: "g" },
    ],
    [
      "a bulk with no groupId",
      { address: ANCHOR_ADDRESS, value: 1, bulk: { percent: 5, scope: "all" } },
    ],
    [
      "a bulk that is negative zero",
      {
        address: ANCHOR_ADDRESS,
        value: 1,
        groupId: "g",
        bulk: { percent: -0, scope: "all" },
      },
    ],
    [
      "a bulk with a group scope and no code",
      {
        address: ANCHOR_ADDRESS,
        value: 1,
        groupId: "g",
        bulk: { percent: 5, scope: "group" },
      },
    ],
    [
      "a bulk with an extra member",
      {
        address: ANCHOR_ADDRESS,
        value: 1,
        groupId: "g",
        bulk: { percent: 5, scope: "all", note: "x" },
      },
    ],
    [
      "a creation kind",
      { address: { kind: "hardware-tier-created", tierId: "h" }, value: true },
    ],
    [
      "an address with an extra member",
      { address: { ...ANCHOR_ADDRESS, extra: 1 }, value: 1 },
    ],
  ];

  it.each(JUNK_CHANGES)(
    "holding %s is a 409 draft-unreadable naming only the revision on the read, the change, the revert and the bulk action, and writes nothing",
    async (_title, junk) => {
      const cookie = await administrator();
      vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
        draftRevision: "1",
        changes: [junk, { address: { kind: "provisional" }, value: true }],
      });
      const writeDraft = vi.spyOn(prices.stores.priceBook, "writeDraft");
      const body = { expectedDraftRevision: "1" };

      const answers = [
        await readState({ cookie }),
        await changeDraft({
          cookie,
          json: {
            ...body,
            change: { address: { kind: "depth-rule" }, value: 20 },
          },
        }),
        await revertDraft({
          cookie,
          json: {
            ...body,
            target: { kind: "change", address: { kind: "provisional" } },
          },
        }),
        await bulkDraft({
          cookie,
          json: { ...body, target: { scope: "all" }, percent: 5 },
        }),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(409);
        expect(await jsonOf(answer)).toEqual({
          status: "draft-unreadable",
          draftRevision: "1",
        });
      }
      expect(writeDraft).not.toHaveBeenCalled();
      expect(draftRows()).toEqual([]);
      expect(console_.everything()).not.toContain("SECRET");
    },
  );

  it("whose revision is not a revision is a 503 on every route", async () => {
    const cookie = await administrator();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "-1",
      changes: [],
    });

    const read = await readState({ cookie });
    const write = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: "0",
        change: { address: { kind: "depth-rule" }, value: 20 },
      },
    });

    expect(read.status).toBe(503);
    expect(write.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The guards, on every route

describe("the guards on every dashboard route", () => {
  const VALID_CHANGE = {
    expectedDraftRevision: "0",
    change: { address: { kind: "depth-rule" }, value: 20 },
  };
  const VALID_REVERT = {
    expectedDraftRevision: "0",
    target: { kind: "change", address: { kind: "provisional" } },
  };
  const VALID_BULK = {
    expectedDraftRevision: "0",
    target: { scope: "all" },
    percent: 5,
  };
  const WRITES = [
    ["PUT", changeDraft, VALID_CHANGE],
    ["DELETE", revertDraft, VALID_REVERT],
    ["POST", bulkDraft, VALID_BULK],
  ] as const;

  it.each(["same-site", "none", "cross-site", ""])(
    "a Sec-Fetch-Site of %j is cross-site on every route and is refused 403 before any session, store or bucket",
    async (secFetchSite) => {
      const cookie = await administrator();
      for (const [, send, json] of WRITES) {
        const answer = await send({ cookie, json, secFetchSite });
        expect(answer.status).toBe(403);
      }
      const read = await readState({ cookie, secFetchSite });
      expect(read.status).toBe(403);
      expect(priceStoreAsks.count).toBe(0);
      expect(limiterLedger.counted).toEqual([]);
      expect(draftRows()).toEqual([]);
    },
  );

  it("a foreign Origin with no Sec-Fetch-Site is cross-site, and the header wins over a same-origin Origin", async () => {
    const cookie = await administrator();
    for (const [, send, json] of WRITES) {
      const answer = await send({
        cookie,
        json,
        secFetchSite: null,
        headers: { origin: "https://evil.example" },
      });
      expect(answer.status).toBe(403);
    }
    const spoofed = await changeDraft({
      cookie,
      json: VALID_CHANGE,
      secFetchSite: "cross-site",
      headers: { origin: "http://localhost:3000" },
    });
    expect(spoofed.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it.each([
    ["application/json-patch+json"],
    ["application/jsonx"],
    ["text/json"],
    ["application/json, text/plain"],
    ["multipart/form-data; boundary=x"],
    ["application/x-www-form-urlencoded"],
    [""],
  ])(
    "a content type of %j is 415 on every write, before the body is read",
    async (contentType) => {
      const cookie = await administrator();
      for (const [, send, json] of WRITES) {
        const answer = await send({ cookie, json, contentType });
        expect(answer.status).toBe(415);
      }
      expect(priceStoreAsks.count).toBe(0);
      expect(limiterLedger.counted).toEqual([]);
    },
  );

  it.each([
    ["APPLICATION/JSON"],
    ["application/json; charset=utf-8"],
    ["  application/json  ;  charset=UTF-8"],
  ])("a content type of %j is accepted on every write", async (contentType) => {
    const cookie = await administrator();
    for (const [, send, json] of WRITES) {
      const answer = await send({ cookie, json, contentType });
      expect([200, 400, 409]).toContain(answer.status);
    }
  });

  it("an empty body, a JSON array and a JSON scalar are each a 400 invalid-request that reads no store", async () => {
    const cookie = await administrator();
    for (const [, send] of WRITES) {
      for (const json of ["", "[]", "null", "5", '"x"', "true"]) {
        const answer = await send({ cookie, json });
        expect(answer.status, json).toBe(400);
        expect(await jsonOf(answer), json).toEqual({
          status: "invalid-request",
        });
      }
    }
    expect(priceStoreAsks.count).toBe(0);
    expect(draftRows()).toEqual([]);
  });

  it("an operator, a client and an anonymous caller are refused on every write whatever the body holds, and nothing is spent", async () => {
    const operator = await signedInAs({ role: "operator" }, "o@example.test");
    const client = await signedInAs({ role: "client" }, "c@example.test");
    const hostile = {
      ...VALID_CHANGE,
      accountId: "x",
      role: "administrator",
      capability: "price.edit",
    };
    for (const cookie of [
      operator.session.cookie,
      client.session.cookie,
      undefined,
    ]) {
      for (const [, send, json] of WRITES) {
        const answer = await send({
          ...(cookie === undefined ? {} : { cookie }),
          json: { ...json, ...hostile },
          headers: { "x-role": "administrator", "x-account-id": "1" },
        });
        expect([401, 403]).toContain(answer.status);
      }
    }
    expect(priceStoreAsks.count).toBe(0);
    expect(limiterLedger.counted).toEqual([]);
    expect(draftRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A role that changes while a request is in flight

describe("an administrator demoted after the route admitted the request and before the store acted", () => {
  async function demotedDuringTheRead() {
    const { account: held, session } = await signedInAs(
      { role: "administrator" },
      "demoted@example.test",
    );
    const readActive = prices.stores.priceBook.readActive.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementation(
      async () => {
        account.accounts.setRoleOf(held.id, "operator");
        return readActive();
      },
    );
    return session.cookie;
  }

  // The store's admin-only actor arrives with S2 (unmerged until the Z gate).
  it.skip("has a draft write that is refused and leaves no row: a person who no longer holds price.edit changes no price", async () => {
    const cookie = await demotedDuringTheRead();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR_ADDRESS, value: 125_000 },
      },
    });

    expect(answer.status).toBeGreaterThanOrEqual(401);
    expect(await storedChanges()).toEqual([]);
    expect(draftRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A bulk action that scales the candidate and leaves unchanged rows out (rulings R2-Q7)

interface PlannableRow {
  readonly address: PlannedCabinetPrice["address"];
  readonly current: number;
}

/** Every price a manufacturer cabinet row of the candidate holds, in book order: what a planner reports as scaled. */
function plannableRowsOf(book: PriceBook): readonly PlannableRow[] {
  return book.cabinetRules.flatMap((rule) => {
    if (rule.suppliedBy === "customer") return [];
    const formula = rule.formula as {
      sizes?: readonly { widthMm: number }[];
    };
    const addresses: PlannedCabinetPrice["address"][] =
      formula.sizes === undefined
        ? [{ kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" }]
        : formula.sizes.map(({ widthMm }) => ({
            kind: "cabinet-size",
            ruleId: rule.ruleId,
            widthMm,
          }));
    return addresses.map((address) => ({
      address,
      current: activeAmountOf(book, address) ?? Number.NaN,
    }));
  });
}

/** A planner that reports every row, each at `valueOf(row, index)`, and remembers the book it was handed. */
function reportingPlanner(
  valueOf: (row: PlannableRow, index: number) => number,
): BulkPlanner & { readonly booksSeen: PriceBook[] } {
  const booksSeen: PriceBook[] = [];
  return {
    booksSeen,
    plan: ({ book }): BulkPlan => {
      booksSeen.push(book);
      return {
        kind: "planned",
        changes: plannableRowsOf(book).map((row, index) => ({
          address: row.address,
          value: valueOf(row, index),
        })),
      };
    },
  };
}

describe("a bulk action whose planner reports every row it scaled", () => {
  async function bookOf(cookie: string): Promise<PriceBook> {
    const served = (await jsonOf(await readState({ cookie }))) as {
      active: { book: PriceBook };
    };
    return served.active.book;
  }

  it("that left every row as the candidate has it is refused 400 PERCENT_OUT_OF_RANGE on percent, with no row and no new revision", async () => {
    const cookie = await administrator();
    const before = await currentDraftRevision();
    planners.override = reportingPlanner((row) => row.current);

    const answer = await bulkRaw(cookie, '{"scope":"all"}', "7");

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "percent", code: "PERCENT_OUT_OF_RANGE" }],
    });
    expect(draftRows()).toEqual([]);
    expect(await currentDraftRevision()).toBe(before);
  });

  it("writes only the rows that moved, and the answer and the audit row count only those", async () => {
    const cookie = await administrator();
    const book = await bookOf(cookie);
    const rows = plannableRowsOf(book);
    const fixedSizeRuleId = rows.find(
      ({ address }) => address.kind === "cabinet-size",
    )?.address.ruleId;
    const movedRows = rows.filter(
      ({ address }) =>
        address.ruleId === fixedSizeRuleId ||
        (address.kind === "cabinet" && address.ruleId === ANCHORED_RULE_ID),
    );
    const movedKeys = new Set(
      movedRows.map(({ address }) => JSON.stringify(address)),
    );
    planners.override = reportingPlanner((row) =>
      movedKeys.has(JSON.stringify(row.address))
        ? row.current + 2_000
        : row.current,
    );

    const answer = await bulkRaw(cookie, '{"scope":"all"}', "7");

    expect(answer.status).toBe(200);
    const served = (await jsonOf(answer)) as {
      ruleCount: number;
      amountCount: number;
    };
    const stored = (await storedChanges()) as {
      address: Record<string, unknown>;
    }[];
    expect(stored).toHaveLength(movedRows.length);
    expect(served.amountCount).toBe(movedRows.length);
    expect(served.ruleCount).toBe(2);
    expect(draftRows()).toHaveLength(1);
    expect(draftRows()[0]?.detail).toMatchObject({
      percent: 7,
      ruleCount: 2,
      amountCount: movedRows.length,
    });
    for (const { address } of stored) {
      expect([ANCHORED_RULE_ID, fixedSizeRuleId]).toContain(address.ruleId);
    }
  });

  it("is handed the candidate: the draft's pending price is in the book the planner scales", async () => {
    const cookie = await administrator();
    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR_ADDRESS, value: 125_000 },
      },
    });
    const planner = reportingPlanner((row) => row.current + 1_000);
    planners.override = planner;

    await bulkRaw(cookie, '{"scope":"all"}', "7");

    const [seen] = planner.booksSeen;
    if (seen === undefined) throw new Error("the planner was not asked");
    expect(activeAmountOf(seen, { ...ANCHOR_ADDRESS })).toBe(125_000);
  });

  it("leaves a pending change alone when the scaled price equals it, and replaces it when the scaled price equals only the active one", async () => {
    const cookie = await administrator();
    const book = await bookOf(cookie);
    const active = activeAmountOf(book, ANCHOR_ADDRESS) ?? Number.NaN;
    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR_ADDRESS, value: 125_000 },
      },
    });
    const isAnchor = (row: PlannableRow) =>
      row.address.kind === "cabinet" && row.address.ruleId === ANCHORED_RULE_ID;

    planners.override = reportingPlanner((row) =>
      isAnchor(row) ? 125_000 : row.current + 1_000,
    );
    const sameAsCandidate = await bulkRaw(cookie, '{"scope":"all"}', "7");
    const afterFirst = (await storedChanges()) as {
      address: Record<string, unknown>;
      value: number;
      groupId?: string;
    }[];

    expect(sameAsCandidate.status).toBe(200);
    const pending = afterFirst.filter(
      ({ address }) => address.ruleId === ANCHORED_RULE_ID,
    );
    expect(pending).toEqual([{ address: ANCHOR_ADDRESS, value: 125_000 }]);

    planners.override = reportingPlanner((row) =>
      isAnchor(row) ? active : row.current + 2_000,
    );
    const backToActive = await bulkRaw(cookie, '{"scope":"all"}', "7");
    const afterSecond = (await storedChanges()) as typeof afterFirst;

    expect(backToActive.status).toBe(200);
    const anchorChanges = afterSecond.filter(
      ({ address }) => address.ruleId === ANCHORED_RULE_ID,
    );
    expect(anchorChanges).toHaveLength(1);
    expect(anchorChanges[0]?.value).toBe(active);
    expect(anchorChanges[0]?.groupId).toBeDefined();
  });

  it("whose target holds no cabinet the manufacturer prices is refused on the member the person corrects: ruleIds for a selection, scope otherwise", async () => {
    const cookie = await administrator();
    planners.override = { plan: () => ({ kind: "planned", changes: [] }) };

    const selection = await bulkRaw(
      cookie,
      JSON.stringify({ scope: "selection", ruleIds: [ANCHORED_RULE_ID] }),
      "7",
    );
    const everything = await bulkRaw(cookie, '{"scope":"all"}', "7");

    expect(await jsonOf(selection)).toEqual({
      status: "invalid-input",
      issues: [{ field: "ruleIds", code: "NO_CABINETS_SELECTED" }],
    });
    expect(await jsonOf(everything)).toEqual({
      status: "invalid-input",
      issues: [{ field: "scope", code: "NO_CABINETS_SELECTED" }],
    });
    expect(draftRows()).toEqual([]);
  });

  it("is taken out whole by its group, and a second bulk action on top of the first is scaled from it, not from the active book", async () => {
    const cookie = await administrator();
    const book = await bookOf(cookie);
    const active = activeAmountOf(book, ANCHOR_ADDRESS) ?? Number.NaN;
    planners.override = reportingPlanner((row) => row.current + 1_000);

    const first = await bulkRaw(cookie, '{"scope":"all"}', "7");
    const second = await bulkRaw(cookie, '{"scope":"all"}', "7");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const stored = (await storedChanges()) as {
      address: Record<string, unknown>;
      value: number;
      groupId: string;
    }[];
    const anchor = stored.filter(
      ({ address }) => address.ruleId === ANCHORED_RULE_ID,
    );
    expect(anchor).toHaveLength(1);
    expect(anchor[0]?.value).toBe(active + 2_000);
    const groupId = anchor[0]?.groupId ?? "";
    expect(groupId).not.toBe("");

    const reverted = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { kind: "group", groupId },
      },
    });

    expect(reverted.status).toBe(200);
    expect(await storedChanges()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A draft that cannot be read, and the discard that recovers it (ruling R2-Q2)

const DISCARD_ALL = { scope: "all" } as const;

async function discardRaw(cookie: string, bodyTail: string, revision?: string) {
  const current = revision ?? (await currentDraftRevision());
  return revertDraft({
    cookie,
    json: `{"expectedDraftRevision":"${current}"${bodyTail}}`,
  });
}

describe("DELETE with scope all", () => {
  it("with a stale revision is 409 changed-meanwhile, writes no row and leaves the draft as it was", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const seen = await currentDraftRevision();
    await storeDraftAsIs(tokenHash, [
      { address: { kind: "provisional" }, value: true },
    ]);
    const rowsBefore = draftRows().length;

    const answer = await discardRaw(cookie, ',"scope":"all"', seen);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(draftRows()).toHaveLength(rowsBefore);
    expect(await storedChanges()).toHaveLength(1);
  });

  it.each([
    ["a different word", '"everything"'],
    ["the word in capitals", '"ALL"'],
    ["an empty word", '""'],
    ["null", "null"],
    ["a number", "1"],
    ["true", "true"],
    ["an array holding the word", '["all"]'],
    ["an object", '{"all":true}'],
  ])(
    "with a scope of %s is 400 invalid-input on scope and discards nothing",
    async (_title, scopeText) => {
      const { cookie, tokenHash } = await administratorSession();
      await storeDraftAsIs(tokenHash, [
        { address: { kind: "provisional" }, value: true },
      ]);
      const rowsBefore = draftRows().length;

      const answer = await discardRaw(cookie, `,"scope":${scopeText}`);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "scope", code: "MISSING_VALUE" }],
      });
      expect(draftRows()).toHaveLength(rowsBefore);
      expect(await storedChanges()).toHaveLength(1);
    },
  );

  it.each([
    [
      "a target beside the scope",
      ',"scope":"all","target":{"kind":"group","groupId":"g"}',
    ],
    ["a null target beside the scope", ',"scope":"all","target":null'],
    ["a member neither request takes", ',"scope":"all","percent":5'],
    ["a groupId at the top level", ',"scope":"all","groupId":"g"'],
    ["a __proto__ member", ',"scope":"all","__proto__":{"scope":"all"}'],
  ])(
    "with %s is a request this route does not read, and discards nothing",
    async (_title, bodyTail) => {
      const { cookie, tokenHash } = await administratorSession();
      await storeDraftAsIs(tokenHash, [
        { address: { kind: "provisional" }, value: true },
      ]);
      const rowsBefore = draftRows().length;

      const answer = await discardRaw(cookie, bodyTail);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(draftRows()).toHaveLength(rowsBefore);
      expect(await storedChanges()).toHaveLength(1);
    },
  );

  it("over a draft that can be read removes every change, records one discard-all row counting what it held, and moves the revision", async () => {
    const { cookie, accountId } = await administratorSession();
    for (const [index, address] of [
      ANCHOR_ADDRESS,
      { kind: "depth-rule" },
      { kind: "provisional" },
    ].entries()) {
      const value = address.kind === "provisional" ? true : 20 + index;
      await putRaw(
        cookie,
        JSON.stringify({
          address,
          value: address.kind === "cabinet" ? 125_000 : value,
        }),
      );
    }
    await bulkRaw(cookie, '{"scope":"all"}', "7");
    const held = (await storedChanges()).length;
    const seen = await currentDraftRevision();
    const rowsBefore = draftRows().length;

    const answer = await discardRaw(cookie, ',"scope":"all"');

    expect(answer.status).toBe(200);
    const stored = await prices.stores.priceBook.readDraft();
    expect(stored.changes).toEqual([]);
    expect(stored.draftRevision).not.toBe(seen);
    expect(await jsonOf(answer)).toEqual({
      draftRevision: stored.draftRevision,
      changes: [],
    });
    const rows = draftRows();
    expect(rows).toHaveLength(rowsBefore + 1);
    expect(rows.at(-1)).toMatchObject({
      action: "price-draft-reverted",
      actorAccountId: accountId,
      detail: { changeKind: "discard-all", revertedCount: held },
    });
    expect(held).toBeGreaterThan(3);

    const replay = await discardRaw(cookie, ',"scope":"all"', seen);
    expect(replay.status).toBe(409);
    expect(draftRows()).toHaveLength(rowsBefore + 1);
  });

  it("over a draft that holds nothing is answered 200 with a row counting 0, or refused without a row: never a 5xx", async () => {
    const { cookie } = await administratorSession();

    const answer = await discardRaw(cookie, ',"scope":"all"');

    expect([200, 400, 409]).toContain(answer.status);
    if (answer.status === 200) {
      expect(draftRows().at(-1)?.detail).toEqual({
        changeKind: "discard-all",
        revertedCount: 0,
      });
    }
  });

  it("over a draft the reader cannot read is recorded with 0, echoes nothing it held, and the dashboard then reads and writes again", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraftAsIs(tokenHash, [
      { address: { kind: "provisional" }, value: "SECRET-VALUE-9917" },
      { SECRET_MEMBER_9917: 1 },
    ]);
    const stuck = await readState({ cookie });
    expect(await jsonOf(stuck)).toEqual({
      status: "draft-unreadable",
      draftRevision: revision,
    });

    const discarded = await discardRaw(cookie, ',"scope":"all"', revision);

    expect(discarded.status).toBe(200);
    expect(await discarded.clone().text()).not.toContain("SECRET");
    expect(draftRows().at(-1)?.detail).toEqual({
      changeKind: "discard-all",
      revertedCount: 0,
    });
    const reads = await readState({ cookie });
    expect(reads.status).toBe(200);
    const written = await putRaw(
      cookie,
      JSON.stringify({ address: ANCHOR_ADDRESS, value: 125_000 }),
    );
    expect(written.status).toBe(200);
    expect(console_.everything()).not.toContain("SECRET");
  });

  it("fails closed: an audit row that cannot be staged is 503 and the unreadable draft is still the stored one", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraftAsIs(tokenHash, ["junk"]);
    const rowsBefore = draftRows().length;
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(new Error("down"));

    const answer = await discardRaw(cookie, ',"scope":"all"', revision);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    vi.restoreAllMocks();
    expect(await currentDraftRevision()).toBe(revision);
    expect(await storedChanges()).toEqual(["junk"]);
    expect(draftRows()).toHaveLength(rowsBefore);
  });

  it("is refused to an operator, a client and an anonymous caller before any store is read, and leaves the draft alone", async () => {
    const { tokenHash } = await administratorSession();
    await storeDraftAsIs(tokenHash, ["junk"]);
    const operator = await signedInAs({ role: "operator" }, "o3@example.test");
    const client = await signedInAs({ role: "client" }, "c3@example.test");
    priceStoreAsks.count = 0;

    const answers = [
      await discardRaw(operator.session.cookie, ',"scope":"all"'),
      await discardRaw(client.session.cookie, ',"scope":"all"'),
      await revertDraft({
        json: { expectedDraftRevision: "0", ...DISCARD_ALL },
      }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([403, 403, 401]);
    expect(priceStoreAsks.count).toBe(0);
    expect(await storedChanges()).toEqual(["junk"]);
  });

  it("is judged by the account's draft bucket like every write: 429 when it refuses, a body that is refused is not counted", async () => {
    const { cookie } = await administratorSession();
    limiterLedger.counted.length = 0;

    await discardRaw(cookie, ',"scope":"nope"');
    expect(
      limiterLedger.counted.filter((name) =>
        name.startsWith(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name),
      ),
    ).toEqual([]);

    await discardRaw(cookie, ',"scope":"all"');
    expect(
      limiterLedger.counted.filter((name) =>
        name.startsWith(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name),
      ),
    ).toHaveLength(1);

    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);
    const refused = await discardRaw(cookie, ',"scope":"all"');
    expect(refused.status).toBe(429);
  });

  it("racing a second discard and a write on one revision has exactly one winner and one row", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraftAsIs(tokenHash, [
      { address: { kind: "provisional" }, value: true },
    ]);
    const rowsBefore = draftRows().length;

    const answers = await Promise.all([
      discardRaw(cookie, ',"scope":"all"', revision),
      discardRaw(cookie, ',"scope":"all"', revision),
      putRaw(
        cookie,
        JSON.stringify({ address: { kind: "depth-rule" }, value: 20 }),
        revision,
      ),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409, 409]);
    expect(draftRows()).toHaveLength(rowsBefore + 1);
  });

  it("over a stored revision that is not a revision is not answered 200, and not as a draft that merely moved", async () => {
    const { cookie } = await administratorSession();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "-1",
      changes: [],
    });

    const answer = await discardRaw(cookie, ',"scope":"all"', "0");

    expect(answer.status).toBe(503);
  });
});

describe("a draft-unreadable answer", () => {
  it("is 409 with exactly a status and a revision whatever junk is stored, on every route, and never a 5xx", async () => {
    const { cookie } = await administratorSession();
    const revision = await currentDraftRevision();
    const readDraft = vi.spyOn(prices.stores.priceBook, "readDraft");
    const goodChange = { address: { kind: "provisional" }, value: true };

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof(fc.jsonValue(), fc.constant(goodChange)), {
          maxLength: 4,
        }),
        async (stored) => {
          readDraft.mockResolvedValue({
            draftRevision: revision,
            changes: stored,
          });

          const read = await readState({ cookie });

          expect([200, 409]).toContain(read.status);
          if (read.status === 409) {
            expect(Object.keys((await jsonOf(read)) as object).sort()).toEqual([
              "draftRevision",
              "status",
            ]);
            expect(read.headers.get("cache-control")).toBe("private, no-store");
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("carries a revision of the shape a discard takes and none of the stored text, keys or values", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraftAsIs(tokenHash, [
      {
        SECRET_KEY_5521: "SECRET_VALUE_5521",
        address: { kind: "SECRET_KIND_5521" },
      },
    ]);

    const answers = [
      await readState({ cookie }),
      await putRaw(
        cookie,
        JSON.stringify({ address: { kind: "depth-rule" }, value: 20 }),
        revision,
      ),
      await bulkRaw(cookie, '{"scope":"all"}', "5"),
    ];

    for (const answer of answers) {
      expect(await jsonOf(answer)).toEqual({
        status: "draft-unreadable",
        draftRevision: revision,
      });
      expect(await answer.clone().text()).not.toContain("SECRET");
    }
    expect(console_.everything()).not.toContain("SECRET");
  });

  it("is given for a stale expected revision too, naming the stored one, so a person can discard without reading again", async () => {
    const { cookie, tokenHash } = await administratorSession();
    const revision = await storeDraftAsIs(tokenHash, ["junk"]);

    const answer = await putRaw(
      cookie,
      JSON.stringify({ address: { kind: "depth-rule" }, value: 20 }),
      "0",
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "draft-unreadable",
      draftRevision: revision,
    });
  });
});
