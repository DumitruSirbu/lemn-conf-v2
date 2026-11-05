import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  declaredCabinetDepthsMm,
  freeColourFinish,
  HandleSchema,
  judgeKitchenDefaults,
  MATERIALS,
  MAX_IDENTIFIER_LENGTH,
  paletteEntriesOf,
  paletteFinish,
  type Finish,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { readSavedDefaults } from "@/lib/server/price-dashboard/saved-defaults";
import { readKitchenDefaultsForAdmittedPage } from "@/lib/server/price-dashboard/new-kitchen-defaults";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  modifiedMembers,
  type KitchenDefaultsPageInput,
} from "@/price-dashboard/kitchen-defaults-model";
import { inMemoryKitchenDefaultsClient } from "@/price-dashboard/kitchen-defaults-stand-in-client";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  administrator,
  availabilityHead,
  defaultsRevision,
  disabledNow,
  publishNextVersion,
  trySaveDefaults,
  writeWithoutJudgement,
} from "../../../support/availability-route-world";
import {
  FIXED_DEFAULTS,
  putDefaults,
  saveBody,
  saveWhole,
  savedRows,
  storedDefaults,
} from "../../../support/kitchen-defaults-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

/**
 * `PUT /api/staff/prices/defaults` (A-9, ADR 0178). The route is called with `Request` objects over the persistence
 * package's fakes, which commit a write and its audit row together or neither; the session lookup, the capability check,
 * the limiter and the domain's judgement are the real ones.
 */

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const PAINTED = { kind: "material", tierId: "material.painted-mdf" } as const;
const BLACK_HANDLE = { kind: "handle", handle: "black" } as const;
const THE_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;
const SIX_MEMBERS = [
  "cabinetDepthMm",
  "finish",
  "handle",
  "hardwareTierId",
  "materialTierId",
  "topRowHandle",
];

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

async function freshWorlds(): Promise<void> {
  world = freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
}

beforeEach(async () => {
  await freshWorlds();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function nothingWasWritten(
  headBefore: string,
  revisionBefore: string,
): Promise<void> {
  expect(await availabilityHead()).toBe(headBefore);
  expect(await defaultsRevision()).toBe(revisionBefore);
  expect(await storedDefaults()).toBeUndefined();
  expect(savedRows()).toEqual([]);
}

describe("a save that is accepted", () => {
  it("answers both revisions after it, moves the head exactly once, and holds the stamped whole of six", async () => {
    const { cookie } = await administrator();
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();

    const answer = await saveWhole(cookie, {
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const headAfter = await availabilityHead();
    expect(Number(headAfter)).toBe(Number(headBefore) + 1);
    expect(await jsonOf(answer)).toEqual({
      revision: await defaultsRevision(),
      availabilityRevision: headAfter,
    });
    expect(await defaultsRevision()).not.toBe(revisionBefore);
    const stored = await storedDefaults();
    expect(Object.keys(stored ?? {}).sort()).toEqual(SIX_MEMBERS);
    expect(stored).toEqual({
      ...FIXED_DEFAULTS,
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });
  });

  it("reads back through the saved-defaults reader as the whole it saved", async () => {
    const { cookie } = await administrator();
    const sent = {
      ...FIXED_DEFAULTS,
      hardwareTierId: "hardware.soft-close",
      cabinetDepthMm: declaredCabinetDepthsMm()[1],
      handle: "black",
      topRowHandle: "steel",
    };

    await saveWhole(cookie, sent);
    const read = await readSavedDefaults(prices.stores);

    expect(read.defaults).toEqual(sent);
    expect(read.revision).toBe(await defaultsRevision());
  });

  it("writes one audit row in the save's transaction, naming the changed members as codes and never a value", async () => {
    const { cookie, accountId } = await administrator();

    await saveWhole(cookie, { handle: "black", cabinetDepthMm: 700 });

    expect(savedRows()).toHaveLength(1);
    expect(savedRows()[0]).toMatchObject({
      actorAccountId: accountId,
      detail: { changedFields: ["depth", "handle"] },
    });
    expect(JSON.stringify(savedRows())).not.toContain("black");
  });

  it("lists, on a later save, only the members that differ from the saved whole", async () => {
    const { cookie } = await administrator();
    await saveWhole(cookie, { handle: "black" });

    await saveWhole(cookie, { handle: "black", topRowHandle: "steel" });

    expect(savedRows().map(({ detail }) => detail)).toEqual([
      { changedFields: ["handle"] },
      { changedFields: ["topRowHandle"] },
    ]);
  });

  it("completes a partially saved row from the fixed fallbacks, so only what really differs is listed", async () => {
    const admin = await administrator();
    await trySaveDefaults(admin, { handle: "black" });
    const rowsBefore = savedRows().length;

    const answer = await saveWhole(admin.cookie, {
      handle: "black",
      cabinetDepthMm: 700,
    });

    expect(answer.status).toBe(200);
    expect(
      savedRows()
        .slice(rowsBefore)
        .map(({ detail }) => detail),
    ).toEqual([{ changedFields: ["depth"] }]);
  });

  it("leaves the draft and the active version as they were: it is not a draft change and needs no publish", async () => {
    const { cookie } = await administrator();
    const draftBefore = await prices.stores.priceBook.readDraft();
    const activeBefore = await prices.stores.priceBook.readActive();

    await saveWhole(cookie, { handle: "black" });

    expect(await prices.stores.priceBook.readDraft()).toEqual(draftBefore);
    expect(await prices.stores.priceBook.readActive()).toEqual(activeBefore);
  });
});

describe("a save that changes nothing", () => {
  it("is 200 with both revisions as they are, writes nothing and calls no write, whatever revisions it names", async () => {
    const { cookie } = await administrator();
    const stale = await saveBody();
    await saveWhole(cookie, { handle: "black" });
    const head = await availabilityHead();
    const revision = await defaultsRevision();
    const write = vi.spyOn(prices.defaults, "save");
    const rowsBefore = savedRows().length;

    const answer = await putDefaults({
      cookie,
      json: {
        ...(await saveBody({ handle: "black" })),
        expectedRevision: stale.expectedRevision,
        expectedAvailabilityRevision: stale.expectedAvailabilityRevision,
      },
    });

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      revision,
      availabilityRevision: head,
    });
    expect(write).not.toHaveBeenCalled();
    expect(await availabilityHead()).toBe(head);
    expect(savedRows()).toHaveLength(rowsBefore);
  });

  it("is what saving the fixed fallbacks first is: nothing is written and nothing is saved", async () => {
    const { cookie } = await administrator();
    const write = vi.spyOn(prices.defaults, "save");
    const head = await availabilityHead();

    const answer = await saveWhole(cookie);

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      revision: await defaultsRevision(),
      availabilityRevision: head,
    });
    expect(write).not.toHaveBeenCalled();
    expect(await storedDefaults()).toBeUndefined();
    expect(savedRows()).toEqual([]);
  });

  it("spends a bucket token first, like any request that is admitted and valid", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await saveWhole(cookie);

    expect(
      limiterLedger.counted.filter((name) => name === THE_BUCKET),
    ).toHaveLength(1);
  });

  it("is 409 availability-changed-meanwhile when the head moves while the route reads, and writes nothing", async () => {
    const admin = await administrator();
    const realReadActive = prices.stores.priceBook.readActive.bind(
      prices.stores.priceBook,
    );
    let hasPublished = false;
    vi.spyOn(prices.stores.priceBook, "readActive").mockImplementation(
      async () => {
        if (!hasPublished) {
          hasPublished = true;
          await publishNextVersion(admin, ANCHORED_BOOK);
        }
        return realReadActive();
      },
    );

    const answer = await saveWhole(admin.cookie);

    expect(hasPublished).toBe(true);
    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    expect(savedRows()).toEqual([]);
  });
});

describe("a save against revisions that moved", () => {
  it("is 409 availability-changed-meanwhile for a stale head, and writes nothing", async () => {
    const { cookie } = await administrator();
    const body = await saveBody({ handle: "black" });
    const admin = await administrator("other@example.test");
    await writeWithoutJudgement(admin, PAINTED, false);
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();

    const answer = await putDefaults({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    expect(await availabilityHead()).toBe(headBefore);
    expect(await defaultsRevision()).toBe(revisionBefore);
    expect(savedRows()).toEqual([]);
  });

  it("is 409 changed-meanwhile for a stale defaults revision against the head as it is", async () => {
    const { cookie } = await administrator();
    const body = await saveBody({ handle: "black" });
    const head = await availabilityHead();

    const answer = await putDefaults({
      cookie,
      json: {
        ...body,
        expectedRevision: "7",
        expectedAvailabilityRevision: head,
      },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(savedRows()).toEqual([]);
  });

  it("names the head first when both are stale", async () => {
    const { cookie } = await administrator();

    const answer = await putDefaults({
      cookie,
      json: await saveBody(
        { handle: "black" },
        { expectedRevision: "7", expectedAvailabilityRevision: "9" },
      ),
    });

    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
  });

  it("is 409 changed-meanwhile for the later of two saves made against one pair of revisions", async () => {
    const { cookie } = await administrator();
    const shared = await saveBody({ handle: "black" });

    const first = await putDefaults({ cookie, json: shared });
    const second = await putDefaults({
      cookie,
      json: { ...shared, defaults: { ...FIXED_DEFAULTS, handle: "push" } },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await storedDefaults()).toMatchObject({ handle: "black" });
    expect(savedRows()).toHaveLength(1);
  });

  it("refuses an item switched off between the route's reads and its save, and saves no default of it", async () => {
    const admin = await administrator();
    const realSave = prices.defaults.save.bind(prices.defaults);
    vi.spyOn(prices.defaults, "save").mockImplementation(async (request) => {
      await writeWithoutJudgement(admin, VENEER, false);
      return realSave(request);
    });
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();

    const answer = await saveWhole(admin.cookie, {
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    expect(await defaultsRevision()).toBe(revisionBefore);
    expect(await storedDefaults()).toBeUndefined();
    expect(savedRows()).toEqual([]);
    expect(Number(await availabilityHead())).toBe(Number(headBefore) + 1);
  });

  it("refuses when a version is published between the route's reads and its save", async () => {
    const admin = await administrator();
    const realSave = prices.defaults.save.bind(prices.defaults);
    vi.spyOn(prices.defaults, "save").mockImplementation(async (request) => {
      const published = await publishNextVersion(admin, ANCHORED_BOOK);
      expect(published.kind).toBe("ok");
      return realSave(request);
    });

    const answer = await saveWhole(admin.cookie, { handle: "black" });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    expect(await storedDefaults()).toBeUndefined();
    expect(savedRows()).toEqual([]);
  });

  it("refuses when another save lands between the route's reads and its own", async () => {
    const admin = await administrator();
    const realSave = prices.defaults.save.bind(prices.defaults);
    vi.spyOn(prices.defaults, "save").mockImplementationOnce(
      async (request) => {
        const other = await trySaveDefaults(admin, { handle: "push" });
        expect(other.kind).toBe("ok");
        return realSave(request);
      },
    );

    const answer = await saveWhole(admin.cookie, { handle: "black" });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await storedDefaults()).toEqual({ handle: "push" });
  });
});

describe("a save judged by the book and the head", () => {
  it("is 409 item-unavailable naming the item for a tier the book does not state", async () => {
    const { cookie } = await administrator();
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();

    const answer = await saveWhole(cookie, {
      materialTierId: "material.unheard-of",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-unavailable",
      item: { kind: "material", tierId: "material.unheard-of" },
    });
    await nothingWasWritten(headBefore, revisionBefore);
  });

  it("is 409 item-unavailable for an item the head has switched off, whichever setting holds it", async () => {
    const admin = await administrator();
    await writeWithoutJudgement(admin, BLACK_HANDLE, false);
    await writeWithoutJudgement(admin, PAINTED, false);

    const material = await saveWhole(admin.cookie, {
      materialTierId: PAINTED.tierId,
    });
    const handle = await saveWhole(admin.cookie, { topRowHandle: "black" });

    expect(await jsonOf(material)).toEqual({
      status: "item-unavailable",
      item: PAINTED,
    });
    expect(await jsonOf(handle)).toEqual({
      status: "item-unavailable",
      item: BLACK_HANDLE,
    });
    expect(savedRows()).toEqual([]);
  });

  it("is 400 FINISH_NOT_IN_PALETTE, naming the finish, for a colour the material does not offer", async () => {
    const { cookie } = await administrator();
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();

    const answer = await saveWhole(cookie, {
      finish: paletteFinish("veneer.stejar"),
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
    });
    await nothingWasWritten(headBefore, revisionBefore);
  });

  it("is 409 item-unavailable for a palette colour that is switched off", async () => {
    const admin = await administrator();
    await writeWithoutJudgement(
      admin,
      { kind: "finish", finishId: "pal.alb" },
      false,
    );

    const answer = await saveWhole(admin.cookie, {
      finish: paletteFinish("pal.alb"),
      handle: "black",
    });

    expect(await jsonOf(answer)).toEqual({
      status: "item-unavailable",
      item: { kind: "finish", finishId: "pal.alb" },
    });
  });
});

describe("the route's answer is the domain's verdict, and the stand-in client's", () => {
  const MATERIAL_IDS = [
    "material.melamine",
    "material.painted-mdf",
    "material.veneer",
    "material.unheard-of",
  ];
  const HARDWARE_IDS = [
    "hardware.standard",
    "hardware.soft-close",
    "hardware.premium",
    "hardware.unheard-of",
  ];
  const FINISHES: readonly Finish[] = [
    ...MATERIALS.flatMap((material) => paletteEntriesOf(material)).map(
      ({ entryId }) => paletteFinish(entryId),
    ),
    freeColourFinish("#eceeeb"),
    freeColourFinish("#112233"),
  ];
  const SWITCHABLE: readonly ItemRef[] = [
    ...MATERIAL_IDS.slice(0, 3).map((tierId) => ({
      kind: "material" as const,
      tierId,
    })),
    ...HARDWARE_IDS.slice(0, 3).map((tierId) => ({
      kind: "hardware" as const,
      tierId,
    })),
    ...HandleSchema.options.map((handle) => ({
      kind: "handle" as const,
      handle,
    })),
    ...FINISHES.flatMap((finish) =>
      finish.kind === "palette-entry"
        ? [{ kind: "finish" as const, finishId: finish.entryId }]
        : [],
    ),
  ];
  const wholeDefaults = fc.record({
    materialTierId: fc.constantFrom(...MATERIAL_IDS),
    hardwareTierId: fc.constantFrom(...HARDWARE_IDS),
    cabinetDepthMm: fc.constantFrom(...declaredCabinetDepthsMm()),
    finish: fc.constantFrom(...FINISHES),
    handle: fc.constantFrom(...HandleSchema.options),
    topRowHandle: fc.constantFrom(...HandleSchema.options),
  });
  const switchedOff = fc.subarray([...SWITCHABLE], { maxLength: 6 });

  it("holds for any availability state and any whole defaults over the book's tiers", async () => {
    const admin = await administrator();
    await fc.assert(
      fc.asyncProperty(wholeDefaults, switchedOff, async (defaults, off) => {
        await setSwitchedOff(admin, off);
        const availability = await prices.stores.availability.readCurrent();
        const verdict = judgeKitchenDefaults(defaults, {
          book: ANCHORED_BOOK,
          availability,
        });
        const page = await readThePage();
        const standIn = await inMemoryKitchenDefaultsClient(page).save({
          expectedRevision: page.state.revision,
          expectedAvailabilityRevision: page.state.availabilityRevision,
          defaults,
        });
        const isNothingToSave =
          modifiedMembers(page.state.defaults, defaults).size === 0;
        const rowsBefore = savedRows().length;

        const answer = await saveWhole(admin.cookie, defaults);

        const label = JSON.stringify({ defaults, availability, verdict });
        if (isNothingToSave) {
          expect(answer.status, label).toBe(200);
          expect(savedRows(), label).toHaveLength(rowsBefore);
        } else if (verdict.kind === "acceptable") {
          expect(answer.status, label).toBe(200);
          expect(standIn.kind, label).toBe("saved");
        } else if (verdict.kind === "unavailable") {
          expect(answer.status, label).toBe(409);
          expect(await jsonOf(answer), label).toEqual({
            status: "item-unavailable",
            item: verdict.item,
          });
          expect(standIn, label).toEqual({
            kind: "item-unavailable",
            item: verdict.item,
          });
        } else {
          expect(answer.status, label).toBe(400);
          expect(await jsonOf(answer), label).toEqual({
            status: "invalid-input",
            issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
          });
          expect(standIn.kind, label).toBe("invalid");
        }
      }),
      { numRuns: 60 },
    );
  });

  async function readThePage(): Promise<KitchenDefaultsPageInput> {
    const page = await readKitchenDefaultsForAdmittedPage();
    if (page === undefined) throw new Error("the world has a book to read");
    return page;
  }

  async function setSwitchedOff(
    admin: Awaited<ReturnType<typeof administrator>>,
    off: readonly ItemRef[],
  ): Promise<void> {
    for (const item of await disabledNow()) {
      await writeWithoutJudgement(admin, item, true);
    }
    for (const item of off) await writeWithoutJudgement(admin, item, false);
  }
});

describe("a body this route does not read", () => {
  let staff: Awaited<ReturnType<typeof administrator>>;

  beforeEach(async () => {
    staff = await administrator();
  });

  async function expectRead(
    json: unknown,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { cookie } = staff;
    limiterLedger.counted.length = 0;
    const asks = priceStoreAsks.count;

    const answer = await putDefaults({ cookie, json });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual(body);
    expect(limiterLedger.counted).not.toContain(THE_BUCKET);
    expect(priceStoreAsks.count).toBe(asks);
    expect(savedRows()).toEqual([]);
    expect(await storedDefaults()).toBeUndefined();
  }

  const INVALID_REQUEST = { status: "invalid-request" };
  const issue = (field: string, code: string) => ({
    status: "invalid-input",
    issues: [{ field, code }],
  });

  it.each([
    ["text that is not JSON", "{nope"],
    ["a list", "[]"],
    ["null", "null"],
    ["a number", "7"],
  ])("answers %s as a request it does not read", async (_name, json) => {
    await expectRead(json, INVALID_REQUEST);
  });

  it.each([
    ["a seventh member of the body", { extra: 1 }],
    [
      "a member named __proto__",
      JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown>,
    ],
  ])("answers %s as a request it does not read", async (_name, extra) => {
    await expectRead(await saveBody({}, extra), INVALID_REQUEST);
  });

  it.each([
    ["defaults that are missing", undefined],
    ["defaults that are null", null],
    ["defaults that are a list", []],
    ["defaults that are text", "six"],
  ])("answers %s as a request it does not read", async (_name, defaults) => {
    const body = await saveBody();
    await expectRead({ ...body, defaults }, INVALID_REQUEST);
  });

  it.each([
    ["a seventh member", { colour: "red" }],
    ["a member named like a seventh design setting", { depthOfWorktop: 600 }],
  ])(
    "answers defaults holding %s as a request it does not read",
    async (_name, extra) => {
      await expectRead(await saveBody(extra), INVALID_REQUEST);
    },
  );

  it.each(["expectedRevision", "expectedAvailabilityRevision"])(
    "names %s when it is missing, null or not text, as MISSING_VALUE",
    async (member) => {
      for (const value of [undefined, null, 4, ["1"], { a: 1 }]) {
        await expectRead(
          await saveBody({}, { [member]: value }),
          issue(member, "MISSING_VALUE"),
        );
      }
    },
  );

  it.each(["expectedRevision", "expectedAvailabilityRevision"])(
    "names %s when it is text no store could have made, as UNKNOWN_VALUE",
    async (member) => {
      for (const value of ["", "-1", "1.5", "abc", "1 ", "0".repeat(400)]) {
        await expectRead(
          await saveBody({}, { [member]: value }),
          issue(member, "UNKNOWN_VALUE"),
        );
      }
    },
  );

  it.each(SIX_MEMBERS)(
    "names %s when it is missing or null, as MISSING_VALUE",
    async (member) => {
      for (const value of [undefined, null]) {
        await expectRead(
          await saveBody({ [member]: value }),
          issue(member, "MISSING_VALUE"),
        );
      }
    },
  );

  it.each([
    [
      "materialTierId",
      [7, "", "x".repeat(MAX_IDENTIFIER_LENGTH + 1), {}, ["a"], true],
    ],
    [
      "hardwareTierId",
      [7, "", "x".repeat(MAX_IDENTIFIER_LENGTH + 1), {}, ["a"], false],
    ],
    ["cabinetDepthMm", ["600", 601, 0, -600, 1e9, 600.5, {}, true]],
    ["handle", ["gold", "STEEL", 1, {}, [], true]],
    ["topRowHandle", ["gold", "", 1, {}, [], true]],
  ])(
    "names %s when it holds a value its setting does not take, as UNKNOWN_VALUE",
    async (member, values) => {
      for (const value of values as unknown[]) {
        await expectRead(
          await saveBody({ [member]: value }),
          issue(member, "UNKNOWN_VALUE"),
        );
      }
    },
  );

  it("names finish, as FINISH_NOT_IN_PALETTE, for a value that is not a colour at all", async () => {
    const notColours: unknown[] = [
      "pal.alb",
      7,
      true,
      [],
      {},
      { kind: "palette-entry" },
      { kind: "palette-entry", entryId: 4 },
      { kind: "free-colour", value: "red" },
      { kind: "palette-entry", entryId: "pal.alb", extra: true },
      { kind: "unknown", value: "#112233" },
    ];
    for (const value of notColours) {
      await expectRead(
        await saveBody({ finish: value }),
        issue("finish", "FINISH_NOT_IN_PALETTE"),
      );
    }
  });

  it("reads the first of two faults only, in the order revision, availability head, then the rows", async () => {
    await expectRead(
      await saveBody(
        { handle: "gold", materialTierId: null },
        { expectedAvailabilityRevision: "x" },
      ),
      issue("expectedAvailabilityRevision", "UNKNOWN_VALUE"),
    );
    await expectRead(
      await saveBody({ handle: "gold", materialTierId: null }),
      issue("materialTierId", "MISSING_VALUE"),
    );
  });

  it("never answers 503 for any value in any of the six members", async () => {
    const { cookie } = staff;
    const members = Object.keys(FIXED_DEFAULTS);

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...members),
        fc.anything(),
        async (member, value) => {
          const answer = await putDefaults({
            cookie,
            json: await saveBody({ [member]: value }),
          });

          expect([200, 400, 409]).toContain(answer.status);
        },
      ),
      { numRuns: 100 },
    );
    expect(console_.everything()).not.toMatch(/NEW_KITCHEN_SETTINGS/);
  });
});

describe("the order of checks", () => {
  it("answers a cross-site request before the session is read", async () => {
    const answer = await putDefaults({
      secFetchSite: "cross-site",
      json: await saveBody(),
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers a body that is not JSON with 415 and one past its bound with 413, before the session", async () => {
    const notJson = await putDefaults({
      contentType: "text/plain",
      json: "{}",
    });
    const tooLarge = await putDefaults({
      json: JSON.stringify({ padding: "x".repeat(20_000) }),
    });

    expect(notJson.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers an anonymous request 401 and an operator's 403 before its members are read, and spends nothing", async () => {
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    limiterLedger.counted.length = 0;

    const anonymous = await putDefaults({ json: "{nope" });
    const operatorAnswer = await putDefaults({
      cookie: operator.session.cookie,
      json: await saveBody(),
    });

    expect(anonymous.status).toBe(401);
    expect(operatorAnswer.status).toBe(403);
    expect(limiterLedger.counted).not.toContain(THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
    expect(savedRows()).toEqual([]);
  });

  it("answers a client's session 403 and reaches no store", async () => {
    const client = await signedInAs({ role: "client" }, "client@example.test");

    const answer = await putDefaults({
      cookie: client.session.cookie,
      json: await saveBody(),
    });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("reads the members before the bucket: a body it cannot read is 400 and spends nothing", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await putDefaults({ cookie, json: "{nope" });

    expect(answer.status).toBe(400);
    expect(limiterLedger.counted).not.toContain(THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("asks the bucket before any store: a refused bucket is 429 and no store is asked", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await putDefaults({ cookie, json: await saveBody() });

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(answer, THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
    expect(savedRows()).toEqual([]);
  });

  it("is the draft's own bucket, failing closed: a limiter that cannot answer is 503 and no store is asked", async () => {
    const { cookie } = await administrator();
    limiterLedger.unavailable.add(THE_BUCKET);

    const answer = await putDefaults({
      cookie,
      json: await saveBody({ handle: "black" }),
    });

    expect(answer.status).toBe(503);
    expect(priceStoreAsks.count).toBe(0);
    expect(savedRows()).toEqual([]);
  });

  it("reads the head, then the book, then the saved defaults", async () => {
    const { cookie } = await administrator();
    const json = await saveBody({ handle: "black" });
    const readHead = vi.spyOn(prices.stores.availability, "readCurrent");
    const readBook = vi.spyOn(prices.stores.priceBook, "readActive");
    const readSaved = vi.spyOn(prices.defaults, "read");

    await putDefaults({ cookie, json });

    const first = (spy: { mock: { invocationCallOrder: number[] } }) =>
      spy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    expect(first(readHead)).toBeLessThan(first(readBook));
    expect(first(readBook)).toBeLessThan(first(readSaved));
  });
});

describe("no version was ever published", () => {
  it("is 409 no-active-version, reads no defaults, and writes nothing", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administrator();
    const json = await saveBody({ handle: "black" });
    const readSaved = vi.spyOn(prices.defaults, "read");

    const answer = await putDefaults({ cookie, json });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(readSaved).not.toHaveBeenCalled();
    expect(savedRows()).toEqual([]);
  });
});

describe("saved defaults that cannot be read", () => {
  it.each([
    ["a handle that is not one", { handle: "gold" }],
    ["a key a new kitchen does not take", { colour: "red" }],
    ["a null where a value is optional", { handle: null }],
    ["a list", []],
    ["text", "not settings"],
  ])(
    "answer 503 and write nothing for a row holding %s",
    async (_name, stored) => {
      const { cookie } = await administrator();
      vi.spyOn(prices.defaults, "read").mockResolvedValue({
        kind: "saved",
        saved: { revision: "1", defaults: stored, savedAt: new Date(0) },
      });
      const write = vi.spyOn(prices.defaults, "save");

      const answer = await saveWhole(cookie, { handle: "black" });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(write).not.toHaveBeenCalled();
      expect(savedRows()).toEqual([]);
    },
  );
});

describe("a write and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and nothing is saved", async () => {
    const { cookie } = await administrator();
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await saveWhole(cookie, { handle: "black" });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    await nothingWasWritten(headBefore, revisionBefore);
  });

  it("answers 503 when the defaults store fails, with no second attempt", async () => {
    const { cookie } = await administrator();
    const write = vi
      .spyOn(prices.defaults, "save")
      .mockRejectedValue(new Error(DRIVER_FAILURE_MARKER));

    const answer = await saveWhole(cookie, { handle: "black" });

    expect(answer.status).toBe(503);
    expect(write).toHaveBeenCalledTimes(1);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { cookie, accountId } = await administrator();
    const headBefore = await availabilityHead();
    const revisionBefore = await defaultsRevision();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await saveWhole(cookie, { handle: "black" });

    expect(answer.status).toBe(401);
    await nothingWasWritten(headBefore, revisionBefore);
  });
});
