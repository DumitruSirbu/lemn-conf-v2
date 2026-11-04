import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_REFUSAL_CODES,
  judgeAvailabilityChange,
  type ItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICE_DRAFT_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

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
  currentDraftRevision,
  setAvailability,
} from "../../../support/price-dashboard-requests";
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
 * `POST /api/staff/prices/availability` (A-17, ADR 0178). The route is called with `Request` objects over the persistence
 * package's fakes, which commit a write and its audit row together or neither; the session lookup, the capability check,
 * the limiter and the domain's judgement are the real ones.
 */

const PAINTED = { kind: "material", tierId: "material.painted-mdf" } as const;
const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const MELAMINE = { kind: "material", tierId: "material.melamine" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const BLACK_HANDLE = { kind: "handle", handle: "black" } as const;
const DISH_RACK = { kind: "accessory", accessoryId: "dishDryingRack" } as const;
const SINK_COVER = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
} as const;
const NOT_IN_THE_BOOK = {
  kind: "material",
  tierId: "material.unheard-of",
} as const;
const THE_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administrator(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return {
    cookie: session.cookie,
    accountId: account.id,
    tokenHash: session.tokenHash,
  };
}

async function head(): Promise<string> {
  return (await prices.stores.availability.readCurrent()).revision;
}

async function disabledNow(): Promise<readonly ItemRef[]> {
  return (await prices.stores.availability.readCurrent()).disabled;
}

function activationRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action === "catalogue-item-active-changed");
}

function rowsOtherThanTheSeed() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published");
}

async function switchItem(
  cookie: string,
  item: unknown,
  active: boolean,
  expectedRevision?: string,
) {
  return setAvailability({
    cookie,
    json: {
      expectedRevision: expectedRevision ?? (await head()),
      item,
      active,
    },
  });
}

/** Saves defaults through the fake store as a staff member would, so the head and the defaults revision both move. */
async function saveDefaults(
  { tokenHash }: { readonly tokenHash: string },
  defaults: NewKitchenSettings,
): Promise<void> {
  const saved = await prices.defaults.save({
    expectedRevision: await defaultsRevision(),
    expectedAvailabilityRevision: await head(),
    defaults,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: { client: 60, operator: 60, administrator: 60 },
      },
      entry: {
        action: "kitchen-defaults-saved",
        detail: { changedFields: ["material"] },
      },
    },
  });
  if (saved.kind !== "ok") throw new Error("the test's defaults save refused");
}

async function defaultsRevision(): Promise<string> {
  const read = await prices.defaults.read();
  return read.kind === "saved" ? read.saved.revision : "0";
}

async function nothingWasWritten(headBefore: string): Promise<void> {
  expect(await head()).toBe(headBefore);
  expect(await disabledNow()).toEqual([]);
  expect(rowsOtherThanTheSeed()).toEqual([]);
}

describe("a switch that is accepted", () => {
  it("is visible at once, answers the revision it created, and writes one audit row naming the item and no value", async () => {
    const { cookie, accountId } = await administrator();
    const before = await head();

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const after = await head();
    expect(after).not.toBe(before);
    expect(await jsonOf(answer)).toEqual({ revision: after });
    expect(await disabledNow()).toEqual([PAINTED]);
    expect(activationRows()).toHaveLength(1);
    expect(activationRows()[0]).toMatchObject({
      actorAccountId: accountId,
      detail: {
        itemKind: "material",
        itemId: PAINTED.tierId,
        active: false,
        availabilityRevision: after,
      },
    });
  });

  it("leaves the draft and the active version as they were: it is not a draft change and needs no publish", async () => {
    const { cookie } = await administrator();
    const draftBefore = await prices.stores.priceBook.readDraft();
    const activeBefore = await prices.stores.priceBook.readActive();

    await switchItem(cookie, PAINTED, false);

    expect(await prices.stores.priceBook.readDraft()).toEqual(draftBefore);
    expect(await currentDraftRevision()).toBe(draftBefore.draftRevision);
    expect(await prices.stores.priceBook.readActive()).toEqual(activeBefore);
  });

  it("switches an item back on, and that is a second row against the revision the first created", async () => {
    const { cookie } = await administrator();
    await switchItem(cookie, PAINTED, false);

    const answer = await switchItem(cookie, PAINTED, true);

    expect(answer.status).toBe(200);
    expect(await disabledNow()).toEqual([]);
    expect(activationRows().map(({ detail }) => detail.active)).toEqual([
      false,
      true,
    ]);
  });

  it.each([
    ["a hardware class", SOFT_CLOSE, "hardware", "hardware.soft-close"],
    ["a handle", BLACK_HANDLE, "handle", "black"],
    ["a built-in accessory", DISH_RACK, "accessory", "dishDryingRack"],
  ] as const)(
    "records %s by its kind and its one id",
    async (_description, item, itemKind, itemId) => {
      const { cookie } = await administrator();

      const answer = await switchItem(cookie, item, false);

      expect(answer.status).toBe(200);
      expect(activationRows()[0]?.detail).toMatchObject({ itemKind, itemId });
    },
  );

  it("rebuilds the item from the two members it reads, so a stored row holds nothing else", async () => {
    const { cookie } = await administrator();

    await switchItem(cookie, PAINTED, false);

    expect(await disabledNow()).toStrictEqual([PAINTED]);
  });
});

describe("a switch that is refused with the domain's word", () => {
  async function expectRefused(
    item: unknown,
    body: Record<string, unknown>,
    headBefore: string,
  ): Promise<void> {
    const { cookie } = await administrator();

    const answer = await switchItem(cookie, item, false, headBefore);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual(body);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    await nothingWasWritten(headBefore);
  }

  it("refuses a fixed default as item-is-fixed-default", async () => {
    await expectRefused(
      MELAMINE,
      { status: "item-is-fixed-default" },
      await head(),
    );
  });

  it("refuses the always-present accessory as item-always-present", async () => {
    await expectRefused(
      SINK_COVER,
      { status: "item-always-present" },
      await head(),
    );
  });

  it("refuses an item the active book does not state as item-not-in-active-book, switching on as well as off", async () => {
    const { cookie } = await administrator();
    const headBefore = await head();

    const off = await switchItem(cookie, NOT_IN_THE_BOOK, false);
    const on = await switchItem(cookie, NOT_IN_THE_BOOK, true);

    expect(await jsonOf(off)).toEqual({ status: "item-not-in-active-book" });
    expect(await jsonOf(on)).toEqual({ status: "item-not-in-active-book" });
    expect([off.status, on.status]).toEqual([409, 409]);
    await nothingWasWritten(headBefore);
  });

  it("refuses the last active option of a group, ahead of the default it also is", async () => {
    const { cookie } = await administrator();
    await switchItem(cookie, PAINTED, false);
    await switchItem(cookie, VENEER, false);
    const headBefore = await head();

    const answer = await switchItem(cookie, MELAMINE, false);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "last-active-option" });
    expect(await head()).toBe(headBefore);
  });

  it("refuses the saved default as item-is-default, naming the item", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { materialTierId: VENEER.tierId });
    const headBefore = await head();

    const answer = await switchItem(admin.cookie, VENEER, false);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: VENEER,
    });
    expect(await head()).toBe(headBefore);
    expect(activationRows()).toEqual([]);
  });

  it("lets the item go once the saved default has moved to another", async () => {
    const admin = await administrator();
    await saveDefaults(admin, { materialTierId: VENEER.tierId });
    await saveDefaults(admin, { materialTierId: PAINTED.tierId });

    const answer = await switchItem(admin.cookie, VENEER, false);

    expect(answer.status).toBe(200);
  });

  it("says the word a refusal has and no other: every code the domain can answer is on the wire", async () => {
    const { cookie } = await administrator();
    const items: readonly [ItemRef, string][] = [
      [NOT_IN_THE_BOOK, "item-not-in-active-book"],
      [MELAMINE, "item-is-fixed-default"],
      [SINK_COVER, "item-always-present"],
    ];

    for (const [item, word] of items) {
      const answer = await switchItem(cookie, item, false);
      expect(AVAILABILITY_REFUSAL_CODES).toContain(word);
      expect(await jsonOf(answer)).toEqual({ status: word });
    }
  });
});

describe("the route's answer is the domain's verdict", () => {
  const EVERY_ITEM: readonly ItemRef[] = [
    PAINTED,
    VENEER,
    MELAMINE,
    SOFT_CLOSE,
    { kind: "hardware", tierId: "hardware.standard" },
    { kind: "hardware", tierId: "hardware.premium" },
    BLACK_HANDLE,
    { kind: "handle", handle: "steel" },
    { kind: "handle", handle: "push" },
    DISH_RACK,
    SINK_COVER,
    NOT_IN_THE_BOOK,
    { kind: "accessory", accessoryId: "accessory.unheard-of" },
    { kind: "finish", finishId: "unheard-of" },
  ];
  const SAVED: readonly NewKitchenSettings[] = [
    {},
    { materialTierId: VENEER.tierId, hardwareTierId: SOFT_CLOSE.tierId },
    { handle: "black", topRowHandle: "push" },
  ];

  it.each(SAVED.map((defaults) => [JSON.stringify(defaults), defaults]))(
    "holds for every item, whichever state the switches are in, with defaults %s",
    async (_description, defaults) => {
      const admin = await administrator();
      if (Object.keys(defaults).length > 0) await saveDefaults(admin, defaults);

      for (const item of [...EVERY_ITEM, ...EVERY_ITEM]) {
        for (const active of [false, true]) {
          const availability = await prices.stores.availability.readCurrent();
          const verdict = judgeAvailabilityChange(
            { item, active },
            { book: ANCHORED_BOOK, availability, defaults },
          );

          const answer = await switchItem(admin.cookie, item, active);

          const label = JSON.stringify({ item, active, availability });
          if (verdict.kind === "allowed") {
            expect(answer.status, label).toBe(200);
          } else {
            expect(answer.status, label).toBe(409);
            expect(await jsonOf(answer), label).toMatchObject({
              status: verdict.code,
            });
          }
        }
      }
    },
  );
});

describe("a switch that changes nothing", () => {
  it("is 200 with the current head, writes nothing and moves nothing, whatever revision it names", async () => {
    const { cookie } = await administrator();
    const stale = await head();
    await switchItem(cookie, SOFT_CLOSE, false);
    const current = await head();
    const rowsBefore = activationRows().length;
    const write = vi.spyOn(prices.stores.availability, "setActive");

    const alreadyOn = await switchItem(cookie, PAINTED, true, stale);
    const alreadyOff = await switchItem(cookie, SOFT_CLOSE, false, stale);

    expect(alreadyOn.status).toBe(200);
    expect(alreadyOff.status).toBe(200);
    expect(await jsonOf(alreadyOn)).toEqual({ revision: current });
    expect(await jsonOf(alreadyOff)).toEqual({ revision: current });
    expect(write).not.toHaveBeenCalled();
    expect(await head()).toBe(current);
    expect(await disabledNow()).toEqual([SOFT_CLOSE]);
    expect(activationRows()).toHaveLength(rowsBefore);
  });

  it("spends a bucket token, like any request that is admitted and valid", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await switchItem(cookie, PAINTED, true);

    expect(
      limiterLedger.counted.filter((name) => name === THE_BUCKET),
    ).toHaveLength(1);
  });

  it("is not taken for one when the book does not state the item: a stale revision is then changed-meanwhile", async () => {
    const { cookie } = await administrator();
    const stale = await head();
    await switchItem(cookie, PAINTED, false);

    const answer = await switchItem(cookie, NOT_IN_THE_BOOK, true, stale);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });
});

describe("a switch against a head that moved", () => {
  it("is 409 changed-meanwhile, writes nothing, and reads no defaults: the head is read first", async () => {
    const { cookie } = await administrator();
    const stale = await head();
    await switchItem(cookie, PAINTED, false);
    const headBefore = await head();
    const readDefaults = vi.spyOn(prices.defaults, "read");

    const answer = await switchItem(cookie, VENEER, false, stale);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(readDefaults).not.toHaveBeenCalled();
    expect(await head()).toBe(headBefore);
    expect(await disabledNow()).toEqual([PAINTED]);
  });

  it("is 409 changed-meanwhile for the later of two requests made against one head", async () => {
    const { cookie } = await administrator();
    const shared = await head();

    const first = await switchItem(cookie, PAINTED, false, shared);
    const second = await switchItem(cookie, SOFT_CLOSE, false, shared);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await jsonOf(second)).toEqual({ status: "changed-meanwhile" });
    expect(await disabledNow()).toEqual([PAINTED]);
  });

  it("is 409 changed-meanwhile when the head moves between the route's reads and its write", async () => {
    const admin = await administrator();
    const realSetActive = prices.stores.availability.setActive.bind(
      prices.stores.availability,
    );
    vi.spyOn(prices.stores.availability, "setActive").mockImplementation(
      async (request) => {
        await saveDefaults(admin, { materialTierId: PAINTED.tierId });
        return realSetActive(request);
      },
    );

    const answer = await switchItem(admin.cookie, PAINTED, false);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await disabledNow()).toEqual([]);
    expect(activationRows()).toEqual([]);
  });
});

describe("a defaults save landing between the route's two reads", () => {
  it("is judged against the newly saved default, which then cannot be switched off", async () => {
    const admin = await administrator();
    const realRead = prices.defaults.read.bind(prices.defaults);
    const readHead = vi.spyOn(prices.stores.availability, "readCurrent");
    let isSaving = false;
    vi.spyOn(prices.defaults, "read").mockImplementation(async () => {
      if (isSaving) return realRead();
      isSaving = true;
      expect(readHead).toHaveBeenCalled();
      await saveDefaults(admin, { materialTierId: VENEER.tierId });
      return realRead();
    });
    const headBefore = await head();

    const answer = await switchItem(admin.cookie, VENEER, false, headBefore);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-is-default",
      item: VENEER,
    });
    expect(await disabledNow()).toEqual([]);
    expect(activationRows()).toEqual([]);
  });
});

describe("saved defaults that cannot be read", () => {
  it.each([
    ["a handle that is not one", { handle: "gold" }],
    ["a key a new kitchen does not take", { colour: "red" }],
    ["a null where a value is optional", { handle: null }],
    ["a list", []],
    ["text", "not settings"],
    ["null", null],
  ])(
    "answer 503 and write nothing for a row holding %s, never judging against {}",
    async (_description, stored) => {
      const { cookie } = await administrator();
      vi.spyOn(prices.defaults, "read").mockResolvedValue({
        kind: "saved",
        saved: { revision: "1", defaults: stored, savedAt: new Date(0) },
      });
      const headBefore = await head();

      const answer = await switchItem(cookie, VENEER, false);

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      await nothingWasWritten(headBefore);
    },
  );

  it("answer 503 when the defaults store cannot answer", async () => {
    const { cookie } = await administrator();
    vi.spyOn(prices.defaults, "read").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );
    const headBefore = await head();

    const answer = await switchItem(cookie, VENEER, false);

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    await nothingWasWritten(headBefore);
  });

  it("are read as nothing saved when none were, and a row holding {} is a saved row that names no default", async () => {
    const admin = await administrator();
    await saveDefaults(admin, {});

    const answer = await switchItem(admin.cookie, VENEER, false);

    expect(answer.status).toBe(200);
  });
});

describe("no version was ever published", () => {
  it("is 409 no-active-version, and writes nothing", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administrator();

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(activationRows()).toEqual([]);
  });
});

describe("a write and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the change is not visible", async () => {
    const { cookie } = await administrator();
    const headBefore = await head();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    await nothingWasWritten(headBefore);
  });

  it("answers 503 when the availability store fails, with no second attempt", async () => {
    const { cookie } = await administrator();
    const write = vi
      .spyOn(prices.stores.availability, "setActive")
      .mockRejectedValue(new Error(DRIVER_FAILURE_MARKER));

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(503);
    expect(write).toHaveBeenCalledTimes(1);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { cookie, accountId } = await administrator();
    const headBefore = await head();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(401);
    await nothingWasWritten(headBefore);
  });
});

describe("the order of checks", () => {
  const VALID_BODY = async () => ({
    expectedRevision: await head(),
    item: PAINTED,
    active: false,
  });

  it("answers a cross-site request before the session is read", async () => {
    const answer = await setAvailability({
      secFetchSite: "cross-site",
      json: await VALID_BODY(),
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers a body that is not JSON with 415 and one past its bound with 413, before the session", async () => {
    const notJson = await setAvailability({
      contentType: "text/plain",
      json: "{}",
    });
    const tooLarge = await setAvailability({
      json: JSON.stringify({ padding: "x".repeat(20_000) }),
    });

    expect(notJson.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers an anonymous request 401 and an operator's 403 before its members are read, and spends nothing", async () => {
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    limiterLedger.counted.length = 0;

    const anonymous = await setAvailability({ json: "{nope" });
    const operatorAnswer = await setAvailability({
      cookie: operator.session.cookie,
      json: "{nope",
    });

    expect(anonymous.status).toBe(401);
    expect(operatorAnswer.status).toBe(403);
    expect(limiterLedger.counted).not.toContain(THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
    expect(activationRows()).toEqual([]);
  });

  it("answers a client's session 403 and reaches no store", async () => {
    const client = await signedInAs({ role: "client" }, "client@example.test");

    const answer = await setAvailability({
      cookie: client.session.cookie,
      json: await VALID_BODY(),
    });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("reads the members before the bucket: a body it cannot read is 400 and spends nothing", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await setAvailability({ cookie, json: "{nope" });

    expect(answer.status).toBe(400);
    expect(limiterLedger.counted).not.toContain(THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("asks the bucket before any store: a refused bucket is 429 and no store is asked", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const answer = await setAvailability({ cookie, json: await VALID_BODY() });

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(answer, THE_BUCKET);
    expect(priceStoreAsks.count).toBe(0);
    expect(activationRows()).toEqual([]);
  });

  it("is still answered by its own guard when the bucket refuses", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(THE_BUCKET, 5);

    const crossSite = await setAvailability({
      cookie,
      secFetchSite: "cross-site",
      json: await VALID_BODY(),
    });
    const notJson = await setAvailability({
      cookie,
      contentType: "text/plain",
      json: "x",
    });
    const malformed = await setAvailability({ cookie, json: "{nope" });
    const anonymous = await setAvailability({ json: await VALID_BODY() });

    expect([
      crossSite.status,
      notJson.status,
      malformed.status,
      anonymous.status,
    ]).toEqual([403, 415, 400, 401]);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("the bucket", () => {
  it("is the draft's own, shared: 600 an hour, failing closed", async () => {
    expect(STAFF_PRICE_DRAFT_PER_ACCOUNT_HOUR_FIGURE).toBe(600);
    const { cookie } = await administrator();
    limiterLedger.unavailable.add(THE_BUCKET);

    const answer = await setAvailability({
      cookie,
      json: { expectedRevision: await head(), item: PAINTED, active: false },
    });

    expect(answer.status).toBe(503);
    expect(priceStoreAsks.count).toBe(0);
    expect(activationRows()).toEqual([]);
  });

  it("counts a request that is admitted and valid, once, and no other", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await setAvailability({ cookie, json: "{nope" });
    const afterRefused = limiterLedger.counted.filter(
      (name) => name === THE_BUCKET,
    ).length;
    await switchItem(cookie, PAINTED, false);
    const afterValid = limiterLedger.counted.filter(
      (name) => name === THE_BUCKET,
    ).length;

    expect(afterRefused).toBe(0);
    expect(afterValid).toBe(1);
  });
});

describe("a body this route does not read", () => {
  const REVISION = "0";

  it.each([
    ["text that is not JSON", "{nope"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["no revision", JSON.stringify({ item: PAINTED, active: false })],
    ["no item", JSON.stringify({ expectedRevision: REVISION, active: false })],
    ["no flag", JSON.stringify({ expectedRevision: REVISION, item: PAINTED })],
    [
      "a member this route does not take",
      JSON.stringify({
        expectedRevision: REVISION,
        item: PAINTED,
        active: false,
        role: "administrator",
      }),
    ],
    [
      "a revision that is not canonical",
      JSON.stringify({ expectedRevision: "01", item: PAINTED, active: false }),
    ],
    [
      "a revision that is a number",
      JSON.stringify({ expectedRevision: 0, item: PAINTED, active: false }),
    ],
    [
      "a flag that is text",
      JSON.stringify({
        expectedRevision: REVISION,
        item: PAINTED,
        active: "false",
      }),
    ],
    [
      "an item of a kind that cannot be switched",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "cabinet", tierId: "x" },
        active: false,
      }),
    ],
    [
      "an item with a member beyond its kind and its id",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { ...PAINTED, extra: 1 },
        active: false,
      }),
    ],
    [
      "an item with the wrong id member for its kind",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "material", accessoryId: "x" },
        active: false,
      }),
    ],
    [
      "an item whose id is empty",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "material", tierId: "" },
        active: false,
      }),
    ],
    [
      "an item whose id is not text",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "material", tierId: 4 },
        active: false,
      }),
    ],
    [
      "an item whose id is past the bound",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "material", tierId: "x".repeat(1_000) },
        active: false,
      }),
    ],
    [
      "a handle that is not one of the declared",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "handle", handle: "gold" },
        active: false,
      }),
    ],
    [
      "an item that is a list",
      JSON.stringify({ expectedRevision: REVISION, item: [], active: false }),
    ],
    [
      "an item named by a kind the object only inherits",
      JSON.stringify({
        expectedRevision: REVISION,
        item: { kind: "__proto__", tierId: "x" },
        active: false,
      }),
    ],
  ])("answers %s with 400, and writes nothing", async (_title, text) => {
    const { cookie } = await administrator();
    const headBefore = await head();

    const answer = await setAvailability({ cookie, json: text });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(priceStoreAsks.count).toBe(0);
    await nothingWasWritten(headBefore);
  });
});
