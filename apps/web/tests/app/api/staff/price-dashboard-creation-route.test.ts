import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  hardwareRatesOf,
  readDashboardAuditEntry,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import type * as CreatedIdsModule from "@/lib/server/price-dashboard/created-ids";
import { isMintedId } from "@/lib/server/price-dashboard/identifier-shape";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  createAccessoryInDraft,
  createHardwareClassInDraft,
  currentDraftRevision,
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
vi.mock("@/lib/server/price-dashboard/created-ids", async (original) => {
  const real = await original<typeof CreatedIdsModule>();
  return { ...real, mintCreatedId: vi.fn(real.mintCreatedId) };
});

const created = await import("@/lib/server/price-dashboard/created-ids");
const realMint = (
  await vi.importActual<typeof CreatedIdsModule>(
    "@/lib/server/price-dashboard/created-ids",
  )
).mintCreatedId;

// `POST /api/staff/prices/draft/hardware-class` and `…/accessory`: the order of checks the draft writes keep, the id the
// server mints, the one write that puts a class and its rates in the draft, the link an accessory follows, and the repeat
// of a request whose answer was lost.

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  await startWorld(SAMPLE_PRICE_BOOK);
  vi.mocked(created.mintCreatedId).mockClear();
});

/** A world whose active version is `book`, with an administrator signed in; a test that needs another book starts again. */
async function startWorld(book: PriceBook): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book });
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const THE_DRAFT_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;
const CLASS_WORDS = { name: "GTV Economic", description: "Mecanisme simple" };
const LINKED_BUILD_ID = "base-3drawer";
const ACCESSORY_VALUE = {
  linkedBuildId: LINKED_BUILD_ID,
  perUnitMinor: 1_000,
  name: "Soclu luminos",
};

function ratesOf(amountMinor: number): Record<string, number> {
  return Object.fromEntries(
    HARDWARE_RATE_FIELDS.map((field) => [field, amountMinor]),
  );
}

async function createClass(body: Record<string, unknown> = {}) {
  return createHardwareClassInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
      ...body,
    },
  });
}

async function createAccessory(body: Record<string, unknown> = {}) {
  return createAccessoryInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: ACCESSORY_VALUE,
      ...body,
    },
  });
}

async function storedChanges(): Promise<readonly DraftChange[]> {
  return (await prices.stores.priceBook.readDraft())
    .changes as readonly DraftChange[];
}

function auditRows() {
  return prices.ledger.heldEvents();
}

function budgetOfDraft(): number {
  return limiterLedger.counted.filter((name) => name === THE_DRAFT_BUCKET)
    .length;
}

async function plant(changes: readonly unknown[]): Promise<void> {
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes: changes as readonly DraftChange[],
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
  if (written.kind !== "ok") throw new Error("seed: the draft not written");
}

function aDrawOf(start: number): Uint8Array {
  return Uint8Array.from({ length: 21 }, (_, offset) => start + offset);
}

/** The next mint draws these byte strings in turn, then real ones. */
function drawing(...draws: readonly Uint8Array[]): void {
  let next = 0;
  vi.mocked(created.mintCreatedId).mockImplementationOnce((taken) =>
    realMint(
      taken,
      () => draws[Math.min(next++, draws.length - 1)] ?? aDrawOf(0),
    ),
  );
}

const idDrawnFrom = (draw: Uint8Array): string =>
  realMint(new Set(), () => draw);

describe("the guards of a creation route", () => {
  const ROUTES = [
    ["hardware-class", createHardwareClassInDraft],
    ["accessory", createAccessoryInDraft],
  ] as const;

  async function expectNothingReachedPastTheGuard(answer: Response) {
    const rowsBefore = auditRows().length;
    expect(priceStoreAsks.count).toBe(0);
    expect(created.mintCreatedId).not.toHaveBeenCalled();
    expect(budgetOfDraft()).toBe(0);
    expect(await storedChanges()).toEqual([]);
    expect(auditRows()).toHaveLength(rowsBefore);
    return answer;
  }

  it.each(ROUTES)(
    "refuses a cross-site request to %s before the session is read",
    async (_, create) => {
      limiterLedger.counted.length = 0;

      const answer = await create({
        cookie,
        secFetchSite: "cross-site",
        json: { expectedDraftRevision: "0", value: {}, rates: {} },
      });

      await expectNothingReachedPastTheGuard(answer);
      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    },
  );

  it.each(ROUTES)(
    "refuses a body that is not JSON to %s with 415",
    async (_, create) => {
      limiterLedger.counted.length = 0;

      const answer = await create({
        cookie,
        contentType: "text/plain",
        json: "{}",
      });

      await expectNothingReachedPastTheGuard(answer);
      expect(answer.status).toBe(415);
    },
  );

  it.each(ROUTES)(
    "refuses a body past its bound to %s with 413",
    async (_, create) => {
      limiterLedger.counted.length = 0;

      const answer = await create({
        cookie,
        json: JSON.stringify({ padding: "x".repeat(20_000) }),
      });

      await expectNothingReachedPastTheGuard(answer);
      expect(answer.status).toBe(413);
    },
  );
});

describe("the check order of a creation", () => {
  it.each([
    ["class", createHardwareClassInDraft],
    ["accessory", createAccessoryInDraft],
  ])(
    "refuses a %s from a request with no session before it reads a store or mints",
    async (_, create) => {
      const answer = await create({
        json: { expectedDraftRevision: "0", value: {}, rates: {} },
      });

      expect(answer.status).toBe(401);
      expect(priceStoreAsks.count).toBe(0);
      expect(created.mintCreatedId).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a body that is not an object", "[]"],
    [
      "a body that names a member the route does not take",
      '{"expectedDraftRevision":"1","value":{},"rates":{},"extra":1}',
    ],
    [
      "a body that names an id",
      '{"expectedDraftRevision":"1","value":{},"rates":{},"tierId":"hardware.mine"}',
    ],
    [
      "an id inside the value",
      '{"expectedDraftRevision":"1","value":{"tierId":"hardware.mine"},"rates":{}}',
    ],
    [
      "an id named `id` inside the value",
      '{"expectedDraftRevision":"1","value":{"id":"mine"},"rates":{}}',
    ],
    [
      "a rate that is no mechanism of a class",
      '{"expectedDraftRevision":"1","value":{},"rates":{"perCoffeeMinor":1}}',
    ],
  ])(
    "answers 400 to %s before the bucket is spent, a store is read or an id is minted",
    async (_, text) => {
      limiterLedger.counted.length = 0;
      const rowsBefore = auditRows().length;

      const answer = await createHardwareClassInDraft({ cookie, json: text });

      expect(answer.status).toBe(400);
      expect(budgetOfDraft()).toBe(0);
      expect(priceStoreAsks.count).toBe(0);
      expect(created.mintCreatedId).not.toHaveBeenCalled();
      expect(auditRows()).toHaveLength(rowsBefore);
    },
  );

  it("spends the draft's shared bucket, once, for a creation that is made", async () => {
    limiterLedger.counted.length = 0;

    const answer = await createClass();

    expect(answer.status).toBe(200);
    expect(budgetOfDraft()).toBe(1);
  });

  it.each([
    ["class", createClass],
    ["accessory", createAccessory],
  ])(
    "refuses a %s with 429 when the bucket is spent, before a store is read or an id is minted",
    async (_, create) => {
      limiterLedger.refusing.set(THE_DRAFT_BUCKET, 5);
      const revision = await currentDraftRevision();
      priceStoreAsks.count = 0;

      const answer = await create({ expectedDraftRevision: revision });

      expect(answer.status).toBe(429);
      expect(priceStoreAsks.count).toBe(0);
      expect(created.mintCreatedId).not.toHaveBeenCalled();
      expect(await storedChanges()).toEqual([]);
    },
  );

  it("refuses a request for a draft that has moved with 409 changed-meanwhile before an id is minted", async () => {
    const answer = await createClass({ expectedDraftRevision: "9999" });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "changed-meanwhile" },
    });
    expect(created.mintCreatedId).not.toHaveBeenCalled();
    expect(await storedChanges()).toEqual([]);
  });
});

describe("a created hardware class", () => {
  it("is put in the draft with a rate for each field the active book's classes state, the creation first, in one write", async () => {
    const answer = await createClass({
      rates: Object.fromEntries(
        HARDWARE_RATE_FIELDS.map((field, index) => [field, 1_000 + index]),
      ),
    });

    const changes = await storedChanges();
    const [creation, ...rates] = changes;
    expect(answer.status).toBe(200);
    expect(creation?.address.kind).toBe("hardware-tier-created");
    expect(creation?.value).toEqual(CLASS_WORDS);
    expect(
      rates.map(({ address }) => "field" in address && address.field),
    ).toEqual(hardwareRatesOf(SAMPLE_PRICE_BOOK));
    expect(rates.map(({ value }) => value)).toEqual(
      HARDWARE_RATE_FIELDS.map((_, index) => 1_000 + index),
    );
  });

  it("answers the draft as it is now and the class whose id it minted", async () => {
    const answer = await createClass();

    const body = (await jsonOf(answer)) as {
      draft: { draftRevision: string; changes: DraftChange[] };
      created: { kind: string; tierId: string };
    };
    const [creation] = await storedChanges();
    expect(body.created.kind).toBe("hardware");
    expect(creation?.address).toEqual({
      kind: "hardware-tier-created",
      tierId: body.created.tierId,
    });
    expect(body.draft).toEqual({
      draftRevision: await currentDraftRevision(),
      changes: await storedChanges(),
    });
    expect(Object.keys(body.created).sort()).toEqual(["kind", "tierId"]);
  });

  it("writes every rate and the creation under one id the server minted, of the shape a minted id has", async () => {
    await createClass();

    const changes = await storedChanges();
    const ids = new Set(
      changes.map(({ address }) =>
        "tierId" in address ? address.tierId : undefined,
      ),
    );
    const [id] = [...ids];
    expect(ids.size).toBe(1);
    expect(isMintedId(id)).toBe(true);
    expect(id).not.toBe("new");
  });

  it("writes one price-draft-changed row, named after the creation, which the closed reader accepts and which holds no word or amount", async () => {
    const rowsBefore = auditRows().length;

    await createClass();

    const written = auditRows().slice(rowsBefore);
    const [row] = written;
    expect(written).toHaveLength(1);
    expect(row?.action).toBe("price-draft-changed");
    expect(row?.detail).toMatchObject({ changeKind: "hardware-tier-created" });
    expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
    expect(JSON.stringify(row?.detail)).not.toContain(CLASS_WORDS.name);
    expect(JSON.stringify(row?.detail)).not.toContain("2000");
  });

  it("is refused ZERO for a push-runner rate of nothing, and nothing is written or audited", async () => {
    const rowsBefore = auditRows().length;

    const answer = await createClass({
      rates: { ...ratesOf(2_000), perPushRunnerMinor: 0 },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "ZERO" }],
      },
    });
    expect(await storedChanges()).toEqual([]);
    expect(auditRows()).toHaveLength(rowsBefore);
  });

  it("is refused for a rate the request leaves out, so a class is never priced at a rate nobody set", async () => {
    const { perHingeMinor, ...others } = ratesOf(2_000);
    void perHingeMinor;

    const answer = await createClass({ rates: others });

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual([]);
  });

  it("is refused for words that state an amount, with the domain's code", async () => {
    const answer = await createClass({
      value: { name: "GTV 500 lei", description: "" },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "TEXT_STATES_AN_AMOUNT" }],
      },
    });
    expect(await storedChanges()).toEqual([]);
  });

  it("writes only the rates the active book's classes state, when the request names only those", async () => {
    const stated = hardwareRatesOf(SAMPLE_PRICE_BOOK).filter(
      (field) => field !== "perHingeMinor",
    );
    await startWorld(withoutRate(SAMPLE_PRICE_BOOK, "perHingeMinor"));
    const { perHingeMinor, ...namedStated } = ratesOf(2_000);
    void perHingeMinor;

    const answer = await createClass({ rates: namedStated });

    const rates = (await storedChanges()).slice(1);
    expect(answer.status).toBe(200);
    expect(
      rates.map(({ address }) => "field" in address && address.field),
    ).toEqual(stated);
  });

  it("is refused NOT_EDITABLE for a rate the active book's classes do not state, and nothing is written, audited or minted", async () => {
    await startWorld(withoutRate(SAMPLE_PRICE_BOOK, "perHingeMinor"));
    const rowsBefore = auditRows().length;

    const answer = await createClass();

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "NOT_EDITABLE" }],
      },
    });
    expect(await storedChanges()).toEqual([]);
    expect(auditRows()).toHaveLength(rowsBefore);
    expect(created.mintCreatedId).not.toHaveBeenCalled();
  });

  it("stores the words trimmed, as the book will hold them", async () => {
    await createClass({
      value: { name: "  GTV Economic ", description: " Mecanisme simple\n" },
    });

    const [creation] = await storedChanges();
    expect(creation?.value).toEqual(CLASS_WORDS);
  });

  it.each(["ruleId", "nameKey", "descriptionKey"])(
    "is refused, before the bucket, when the value names a `%s`",
    async (member) => {
      limiterLedger.counted.length = 0;

      const answer = await createClass({
        value: { ...CLASS_WORDS, [member]: "hardware.mine" },
      });

      expect(answer.status).toBe(400);
      expect(budgetOfDraft()).toBe(0);
      expect(created.mintCreatedId).not.toHaveBeenCalled();
    },
  );

  it("replaces nothing of what the draft holds, and goes after it", async () => {
    await plant([{ address: { kind: "provisional" }, value: false }]);

    await createClass();

    const [first, second] = await storedChanges();
    expect(first?.address.kind).toBe("provisional");
    expect(second?.address.kind).toBe("hardware-tier-created");
  });
});

describe("a created accessory", () => {
  it("is put in the draft under an id the server minted, with its price inside the creation", async () => {
    const answer = await createAccessory();

    const body = (await jsonOf(answer)) as {
      created: { kind: string; accessoryId: string };
    };
    const changes = await storedChanges();
    expect(answer.status).toBe(200);
    expect(body.created.kind).toBe("accessory");
    expect(isMintedId(body.created.accessoryId)).toBe(true);
    expect(changes).toEqual([
      {
        address: {
          kind: "accessory-created",
          accessoryId: body.created.accessoryId,
        },
        value: ACCESSORY_VALUE,
      },
    ]);
  });

  it("writes one price-draft-changed row with the creation's kind, which the closed reader accepts", async () => {
    const rowsBefore = auditRows().length;

    await createAccessory();

    const written = auditRows().slice(rowsBefore);
    const [row] = written;
    expect(written).toHaveLength(1);
    expect(row?.detail).toMatchObject({ changeKind: "accessory-created" });
    expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
  });

  it("is refused LINK_TARGET_UNKNOWN for a cabinet row the book does not price", async () => {
    const answer = await createAccessory({
      value: { ...ACCESSORY_VALUE, linkedBuildId: "no-such-row" },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "LINK_TARGET_UNKNOWN" }],
      },
    });
    expect(await storedChanges()).toEqual([]);
  });

  it("is refused LINK_TARGET_UNKNOWN for a row the book prices and the catalogue does not, which only the catalogue's judgement finds", async () => {
    await startWorld(
      withARuleForAnUnbuiltBody(SAMPLE_PRICE_BOOK, "a-body-nobody-builds"),
    );

    const answer = await createAccessory({
      value: { ...ACCESSORY_VALUE, linkedBuildId: "a-body-nobody-builds" },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "change", code: "LINK_TARGET_UNKNOWN" }],
      },
    });
    expect(await storedChanges()).toEqual([]);
  });

  it("is refused LINK_TARGET_CUSTOMER_SUPPLIED for a row the customer supplies", async () => {
    const customerRow = SAMPLE_PRICE_BOOK.cabinetRules.find(
      ({ suppliedBy }) => suppliedBy === "customer",
    );
    if (customerRow === undefined) throw new Error("the book has no such row");

    const answer = await createAccessory({
      value: { ...ACCESSORY_VALUE, linkedBuildId: customerRow.buildId },
    });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "LINK_TARGET_CUSTOMER_SUPPLIED" }],
    });
  });

  it("is not refused for a fault the catalogue finds elsewhere in the book, which the publish judges", async () => {
    await startWorld(ANCHORED_BOOK);

    const answer = await createAccessory();

    expect(answer.status).toBe(200);
  });

  it("is refused for a negative or fractional price with the domain's code", async () => {
    const answer = await createAccessory({
      value: { ...ACCESSORY_VALUE, perUnitMinor: -1 },
    });

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual([]);
  });

  it("is refused for an id named inside the value, before the bucket is spent", async () => {
    limiterLedger.counted.length = 0;

    const answer = await createAccessory({
      value: { ...ACCESSORY_VALUE, accessoryId: "plinth-mine" },
    });

    expect(answer.status).toBe(400);
    expect(budgetOfDraft()).toBe(0);
    expect(created.mintCreatedId).not.toHaveBeenCalled();
  });
});

describe("the id the server mints", () => {
  it("is drawn again when the first draw names a row the active book states", async () => {
    const stated = idDrawnFrom(aDrawOf(0));
    await startWorld(withATierNamed(SAMPLE_PRICE_BOOK, stated));
    drawing(aDrawOf(0), aDrawOf(5));

    const answer = await createClass();

    const body = (await jsonOf(answer)) as { created: { tierId: string } };
    expect(body.created.tierId).toBe(idDrawnFrom(aDrawOf(5)));
  });

  it("is drawn again when the first draw names a row the draft has created, whatever kind it is", async () => {
    drawing(aDrawOf(0));
    await createClass();
    drawing(aDrawOf(0), aDrawOf(7));

    const answer = await createAccessory();

    const body = (await jsonOf(answer)) as { created: { accessoryId: string } };
    expect(answer.status).toBe(200);
    expect(body.created.accessoryId).toBe(idDrawnFrom(aDrawOf(7)));
  });

  it("is never the id of a creation the draft has since deleted, which the domain would refuse as a restated creation", async () => {
    const removed = idDrawnFrom(aDrawOf(0));
    await plant([
      {
        address: { kind: "hardware-tier-created", tierId: removed },
        value: CLASS_WORDS,
      },
      ...HARDWARE_RATE_FIELDS.map((field) => ({
        address: { kind: "hardware", tierId: removed, field },
        value: 2_000,
      })),
      {
        address: {
          kind: "item-deleted",
          item: { kind: "hardware", tierId: removed },
        },
        value: true,
      },
    ]);
    drawing(aDrawOf(0), aDrawOf(40));

    const answer = await createClass();

    const body = (await jsonOf(answer)) as { created: { tierId: string } };
    expect(answer.status).toBe(200);
    expect(body.created.tierId).toBe(idDrawnFrom(aDrawOf(40)));
  });

  it("is a 503 with nothing written when the source can only draw taken ids", async () => {
    const removed = idDrawnFrom(aDrawOf(0));
    await plant([
      {
        address: { kind: "accessory-created", accessoryId: removed },
        value: ACCESSORY_VALUE,
      },
    ]);
    drawing(aDrawOf(0));
    const before = await storedChanges();

    const answer = await createClass();

    expect(answer.status).toBe(503);
    expect(await storedChanges()).toEqual(before);
  });

  it("is a different id for every creation, across both kinds", async () => {
    const ids: string[] = [];
    for (let made = 0; made < 12; made += 1) {
      const answer =
        made % 2 === 0 ? await createClass() : await createAccessory();
      const body = (await jsonOf(answer)) as {
        created: { tierId?: string; accessoryId?: string };
      };
      expect(answer.status).toBe(200);
      ids.push(body.created.tierId ?? body.created.accessoryId ?? "");
    }

    expect(new Set(ids).size).toBe(12);
  });
});

describe("a creation whose answer was lost", () => {
  it("is answered 409 changed-meanwhile when it is sent again, and the draft holds one class", async () => {
    const revision = await currentDraftRevision();
    const body = {
      expectedDraftRevision: revision,
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
    };
    const first = await createHardwareClassInDraft({ cookie, json: body });
    const afterFirst = await storedChanges();
    const rowsAfterFirst = auditRows().length;

    const replay = await createHardwareClassInDraft({ cookie, json: body });

    expect(first.status).toBe(200);
    expect({ status: replay.status, body: await jsonOf(replay) }).toEqual({
      status: 409,
      body: { status: "changed-meanwhile" },
    });
    expect(await storedChanges()).toEqual(afterFirst);
    expect(
      afterFirst.filter(
        ({ address }) => address.kind === "hardware-tier-created",
      ),
    ).toHaveLength(1);
    expect(auditRows()).toHaveLength(rowsAfterFirst);
  });

  it("is answered 409 changed-meanwhile for an accessory too, and the draft holds one accessory", async () => {
    const body = {
      expectedDraftRevision: await currentDraftRevision(),
      value: ACCESSORY_VALUE,
    };
    await createAccessoryInDraft({ cookie, json: body });

    const replay = await createAccessoryInDraft({ cookie, json: body });

    expect(replay.status).toBe(409);
    expect(
      (await storedChanges()).filter(
        ({ address }) => address.kind === "accessory-created",
      ),
    ).toHaveLength(1);
  });

  it("is answered 409 when two requests that read the same revision race, and one row results", async () => {
    const revision = await currentDraftRevision();
    const json = {
      expectedDraftRevision: revision,
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
    };

    const answers = await Promise.all([
      createHardwareClassInDraft({ cookie, json }),
      createHardwareClassInDraft({ cookie, json }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      (await storedChanges()).filter(
        ({ address }) => address.kind === "hardware-tier-created",
      ),
    ).toHaveLength(1);
  });
});

describe("a draft that already holds a creation", () => {
  it("takes a second class beside it, each with its own rates", async () => {
    await createClass();

    const answer = await createClass();

    const creations = (await storedChanges()).filter(
      ({ address }) => address.kind === "hardware-tier-created",
    );
    expect(answer.status).toBe(200);
    expect(creations).toHaveLength(2);
  });
});

function withoutRate(book: PriceBook, field: string): PriceBook {
  const strip = <Tier extends object>(tier: Tier): Tier => {
    const kept = Object.entries(tier).filter(([member]) => member !== field);
    return Object.fromEntries(kept) as Tier;
  };
  return {
    ...book,
    hardware: { ...book.hardware, tiers: book.hardware.tiers.map(strip) },
  };
}

function withATierNamed(book: PriceBook, tierId: string): PriceBook {
  const [first, ...others] = book.hardware.tiers;
  if (first === undefined) throw new Error("the book has no class");
  return {
    ...book,
    hardware: {
      ...book.hardware,
      tiers: [...others, { ...first, tierId, ruleId: tierId }],
    },
  };
}

function withARuleForAnUnbuiltBody(
  book: PriceBook,
  buildId: string,
): PriceBook {
  const [first] = book.cabinetRules;
  if (first === undefined) throw new Error("the book has no rule");
  return {
    ...book,
    cabinetRules: [
      ...book.cabinetRules,
      { ...first, ruleId: `cabinet.${buildId}`, buildId },
    ],
  };
}
