import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  currentDraftRevision,
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
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

vi.mock("@/lib/server/price-dashboard/stored-draft", () => ({
  readStoredDraft: (stored: unknown) =>
    Array.isArray(stored) ? { ok: true, changes: stored } : { ok: false },
}));

/**
 * `POST /api/staff/prices/publish` over a stored draft that deletes items, with the real publish plan and the price-book
 * fake's real guard. The stored-draft reader refuses a deletion today, as the draft route does, so this file reads a stored
 * draft as it is: it asks what the publish does once a draft may hold a deletion. Saved designs are planted in the world
 * the guard reads.
 */

const LINKED_ROW = "base-3drawer";
const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: LINKED_ROW,
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };

let prices: PriceDashboardWorld;
let designCount = 0;
let bookOfTheWorld: PriceBook = BOOK;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: bookOfTheWorld });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administratorWhoDeletes(...items: ItemRef[]) {
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  await plantDraft(session.tokenHash, deleting(...items));
  return session.cookie;
}

function aDesignNaming(item: ItemRef, isDeletedByClient = false): void {
  designCount += 1;
  prices.designs.plant({
    designId: `design-${String(designCount)}`,
    uses: [item],
    isDeletedByClient,
  });
}

async function stateOfTheWorld() {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availability: (await prices.stores.availability.readCurrent()).revision,
  };
}

async function publish(
  cookie: string,
  overrides: Record<string, unknown> = {},
) {
  return publishDraft({ cookie, json: await publishBody(overrides) });
}

describe("a publish whose draft deletes an item a saved design names", () => {
  it.each([
    ["a material", [VENEER]],
    ["a hardware class", [PREMIUM]],
    ["a linked accessory", [PLINTH]],
  ])(
    "answers 409 item-in-use naming exactly %s, and writes nothing",
    async (_what, deleted) => {
      const cookie = await administratorWhoDeletes(...deleted);
      for (const item of deleted) aDesignNaming(item);
      const before = await stateOfTheWorld();

      const answer = await publish(cookie);

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({
        status: "item-in-use",
        items: deleted,
      });
      expect(await stateOfTheWorld()).toEqual(before);
    },
  );

  it("names only the deleted items in use, in the order the draft deletes them", async () => {
    const cookie = await administratorWhoDeletes(
      VENEER,
      PAINTED,
      PREMIUM,
      PLINTH,
    );
    aDesignNaming(PLINTH);
    aDesignNaming(VENEER);
    const before = await stateOfTheWorld();

    const answer = await publish(cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER, PLINTH],
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers item-in-use over a stale availability head, which only the store compares", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);
    const head = (await prices.stores.availability.readCurrent()).revision;
    const before = await stateOfTheWorld();

    const answer = await publish(cookie, {
      expectedAvailabilityRevision: String(Number(head) + 1),
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers a stale active sequence as changed-meanwhile, before any design is read", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);

    const answer = await publish(cookie, { expectedActiveSequence: 7 });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("answers a stale draft revision as changed-meanwhile, before any design is read", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);
    const stale = String(Number(await currentDraftRevision()) + 1);

    const answer = await publish(cookie, { expectedDraftRevision: stale });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("carries nothing of the designs beyond the items: no count, no design id", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);
    aDesignNaming(VENEER);

    const body = (await jsonOf(await publish(cookie))) as Record<
      string,
      unknown
    >;

    expect(Object.keys(body).sort()).toEqual(["items", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/design-|designCount|count/);
  });

  it("tells a caller with no session nothing of the designs", async () => {
    await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);

    const answer = await publishDraft({ json: await publishBody() });

    expect(answer.status).toBe(401);
    expect(JSON.stringify(await jsonOf(answer))).not.toContain("item-in-use");
  });

  it("tells an operator, who may not publish, nothing of the designs", async () => {
    await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);
    const { session } = await signedInAs(
      { role: "operator" },
      "operator@example.test",
    );

    const answer = await publish(session.cookie);

    expect(answer.status).toBe(403);
    expect(JSON.stringify(await jsonOf(answer))).not.toContain("item-in-use");
  });
});

describe("a publish whose draft deletes items no saved design names", () => {
  it("publishes, though a design its client deleted names the item", async () => {
    const cookie = await administratorWhoDeletes(VENEER, PLINTH);
    aDesignNaming(VENEER, true);
    aDesignNaming(PLINTH, true);

    const answer = await publish(cookie);

    expect(answer.status).toBe(200);
    expect(
      (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(2);
  });

  it("publishes, though a design names another item", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(PAINTED);

    const answer = await publish(cookie);

    expect(answer.status).toBe(200);
  });
});

describe("a publish body that tries to say what is deleted or used", () => {
  it.each([
    ["deletedItems", []],
    ["deletedItems", [{ item: VENEER }]],
    ["items", [VENEER]],
    ["usage", { "material.veneer": 0 }],
    ["designCount", 0],
  ])(
    "is refused as a malformed request when it carries %s",
    async (member, value) => {
      const cookie = await administratorWhoDeletes(VENEER);
      aDesignNaming(VENEER);
      const before = await stateOfTheWorld();

      const answer = await publish(cookie, { [member]: value });

      expect(answer.status).toBe(400);
      expect(await stateOfTheWorld()).toEqual(before);
    },
  );
});

const BOOK_LINKED_TO_A_ROW_THAT_IS_GONE: PriceBook = {
  ...BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: "no-such-row",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};

describe("a publish that deletes an accessory linked to a catalogue row that no longer exists", () => {
  beforeAll(() => {
    bookOfTheWorld = BOOK_LINKED_TO_A_ROW_THAT_IS_GONE;
  });

  afterAll(() => {
    bookOfTheWorld = BOOK;
  });

  it("fails closed with 503 and writes nothing: the book is unreadable, so no accessory of it can be deleted until the link is mended", async () => {
    const cookie = await administratorWhoDeletes(PLINTH);
    const before = await stateOfTheWorld();

    const answer = await publish(cookie);

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });
});
