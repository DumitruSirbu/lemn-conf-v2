import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  linkTargetBuildIdsOf,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { GET } from "@/app/api/staff/prices/route";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftChangeOutcome,
} from "@/price-dashboard/price-draft-client";

import {
  accountRequest,
  freshAccountWorld,
} from "../../../support/account-world";
import { currentDraftRevision } from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
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

// The accessory screens' writes against the routes as they are in the tree. The screens' DOM tests write through
// `inMemoryPriceDraftClient`, which calls `applyChanges` itself, so none of them reaches the boundary reader that turns a
// request into a change. Here the fetching client (the one a browser has) is run over a `fetch` that is the real `PUT` and
// `DELETE` of `/api/staff/prices/draft`, over the persistence package's price-book fake, and the bodies are the ones the
// accessory screens send. The creation has a route of its own (`price-dashboard-creation-route.test.ts` runs it); the draft
// route does not take one.

let prices: PriceDashboardWorld;
let cookie: string;
let sessionTokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  sessionTokenHash = session.tokenHash;
  vi.stubGlobal("fetch", answerFromTheRoutes);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NETWORK = { "x-forwarded-for": "192.0.2.10" };

/** The browser's `fetch`, answered by the route handlers of the tree. */
async function answerFromTheRoutes(
  address: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = init.method ?? "GET";
  const request = accountRequest(address, {
    method,
    cookie,
    headers: NETWORK,
    ...(typeof init.body === "string" ? { json: init.body } : {}),
  });
  if (address === "/api/staff/prices/draft") {
    return method === "PUT" ? PUT(request) : DELETE(request);
  }
  if (address === "/api/staff/prices") return GET(request);
  return new Response(null, { status: 404 });
}

const LINKED_BUILD_ID = linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK)[0] ?? "";
const CREATED_ID = "organiser-created";
const CREATION: DraftChange = {
  address: { kind: "accessory-created", accessoryId: CREATED_ID },
  value: {
    linkedBuildId: LINKED_BUILD_ID,
    perUnitMinor: 8_000,
    name: "Organizator",
  },
};
const RENAME: DraftChange = {
  address: {
    kind: "created-row-text",
    item: { kind: "accessory", accessoryId: CREATED_ID },
    field: "name",
  },
  value: "Alt organizator",
};

async function storeDraft(changes: readonly DraftChange[]): Promise<void> {
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes,
    audit: {
      session: {
        sessionTokenHash,
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

async function revertTarget(
  address: DraftChange["address"],
): Promise<Response> {
  return DELETE(
    accountRequest("/api/staff/prices/draft", {
      method: "DELETE",
      cookie,
      headers: NETWORK,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { kind: "change", address },
      },
    }),
  );
}

describe("the write that creates an accessory (the creation form's `createAccessory`)", () => {
  it("has a client method in the browser's client, so the form can create anything at all", () => {
    expect(FETCHING_PRICE_DRAFT_CLIENT.createAccessory).toBeTypeOf("function");
  });

  it("is not smuggled through the change route: a creation as a change is refused, so the screens' optional method stays honest", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: CREATION,
    } as never);

    expect(outcome.kind).toBe("refused");
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
  });
});

describe("the revert that takes an accessory only the draft holds back out (`deleteFromDraft` for a created accessory)", () => {
  it("is read by the draft route's revert reader: the creation is taken out of the draft", async () => {
    await storeDraft([CREATION]);

    const answer = await revertTarget(CREATION.address);

    expect(answer.status).toBe(200);
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
  });

  it("takes the creation's words with it, since none can stand without the row", async () => {
    await storeDraft([CREATION, RENAME]);

    const answer = await revertTarget(CREATION.address);

    expect(answer.status).toBe(200);
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
  });
});

describe("the write that renames an accessory the draft created (the accessory page's rename)", () => {
  async function renameTheAccessory(): Promise<DraftChangeOutcome> {
    return FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: { address: RENAME.address, value: RENAME.value } as never,
    });
  }

  it("is taken by the draft route, so the rename on a created accessory's page can succeed", async () => {
    await storeDraft([CREATION]);

    const outcome = await renameTheAccessory();

    expect(outcome.kind).toBe("changed");
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([
      CREATION,
      RENAME,
    ]);
  });

  // Naming the published name again sends a revert, not a change.
  it("a revert of a created-row-text change is taken by the route, so a name typed back leaves nothing in the draft", async () => {
    await storeDraft([CREATION, RENAME]);

    const answer = await revertTarget(RENAME.address);

    expect(answer.status).toBe(200);
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([
      CREATION,
    ]);
  });

  it("is declared by the browser's client, so the page offers the rename at all", () => {
    expect(FETCHING_PRICE_DRAFT_CLIENT.acceptsCreatedRowText).toBe(true);
  });

  it("is refused for an accessory the draft did not create", async () => {
    await storeDraft([]);

    expect(await renameTheAccessory()).toEqual<DraftChangeOutcome>({
      kind: "refused",
      code: "UNKNOWN_ITEM",
    });
  });
});

describe("the price of an accessory the book holds (the accessory page's Save) — the route the screens need already exists", () => {
  it("is taken by the draft route for a built-in accessory, so a Save of its price lands in the draft", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: {
        address: {
          kind: "accessory",
          accessoryId: "dishDryingRack",
          field: "perUnitMinor",
        },
        value: 70_000,
      },
    });

    expect(outcome.kind).toBe("changed");
    expect((await prices.stores.priceBook.readDraft()).changes).toHaveLength(1);
  });
});
