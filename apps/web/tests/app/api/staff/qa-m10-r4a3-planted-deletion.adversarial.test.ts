import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
  readState,
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

/**
 * A stored draft that holds a deletion, which no route can write, planted in the store. The stored-draft reader is the
 * real one: the draft is read, served and published as the tree does it, so a publish of a planted deletion shows what
 * reading it has opened.
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

let prices: PriceDashboardWorld;
let designCount = 0;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
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

describe("a stored draft that deletes an item", () => {
  it("is read and served by the state route, not answered as unreadable", async () => {
    const cookie = await administratorWhoDeletes(VENEER);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(200);
    const body = (await jsonOf(answer)) as { draft?: { changes?: unknown } };
    expect(body.draft?.changes).toEqual(deleting(VENEER));
  });

  it("is served unchanged, and a change beside it neither drops nor reaches it", async () => {
    const cookie = await administratorWhoDeletes(VENEER);

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: { kind: "depth-rule" }, value: 9 },
      },
    });

    expect(answer.status).toBe(200);
    const stored = (await prices.stores.priceBook.readDraft()).changes;
    expect(stored).toEqual([
      ...deleting(VENEER),
      { address: { kind: "depth-rule" }, value: 9 },
    ]);
  });
});

describe("a publish of a stored draft that deletes an item", () => {
  it("is refused as in use when a saved design names the item, and writes nothing", async () => {
    const cookie = await administratorWhoDeletes(VENEER);
    aDesignNaming(VENEER);
    const before = await stateOfTheWorld();

    const answer = await publish(cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is refused when the item is the book's default material, and writes nothing", async () => {
    const defaultItem: ItemRef = {
      kind: "material",
      tierId: BOOK.material.defaultTierId,
    };
    const cookie = await administratorWhoDeletes(defaultItem);
    const before = await stateOfTheWorld();

    const answer = await publish(cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: {
        status: "candidate-refused",
        refusals: [{ index: 0, source: "changes", code: "ITEM_IS_DEFAULT" }],
      },
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("publishes a version without an unused item the draft deletes", async () => {
    const cookie = await administratorWhoDeletes(VENEER);

    const answer = await publish(cookie);

    expect(answer.status).toBe(200);
    const active = await prices.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    expect(JSON.stringify(active.version)).not.toContain(VENEER.tierId);
  });
});
