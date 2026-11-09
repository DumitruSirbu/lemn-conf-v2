import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
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

// A deleting publish whose availability revision is stale answers `item-in-use` once a design names the item. The
// stored draft is planted, since no route writes a deletion yet.

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const STALE_AVAILABILITY_REVISION = "41";

let prices: PriceDashboardWorld;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administratorWhoDeletesVeneer(): Promise<string> {
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  await plantDraft(session.tokenHash, deleting(VENEER));
  return session.cookie;
}

async function publishWithStaleAvailability(cookie: string) {
  return publishDraft({
    cookie,
    json: await publishBody({
      expectedAvailabilityRevision: STALE_AVAILABILITY_REVISION,
    }),
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

describe("a publish of a deleting draft whose availability revision is stale", () => {
  it("answers item-in-use when a saved design names the deleted item, and writes nothing", async () => {
    const cookie = await administratorWhoDeletesVeneer();
    prices.designs.plant({
      designId: "design-1",
      uses: [VENEER],
      isDeletedByClient: false,
    });
    const before = await stateOfTheWorld();

    const answer = await publishWithStaleAvailability(cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "item-in-use", items: [VENEER] },
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is the control: with no design naming the item, the same stale revision answers availability-changed-meanwhile", async () => {
    const cookie = await administratorWhoDeletesVeneer();
    const before = await stateOfTheWorld();

    const answer = await publishWithStaleAvailability(cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "availability-changed-meanwhile" },
    });
    expect(await stateOfTheWorld()).toEqual(before);
  });
});
