import { DashboardStoreError } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import {
  PRICE_STORES_GLOBAL_KEY,
  getPriceStores,
  type PriceStores,
} from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  aDesign,
  aDesignId,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  SENT_AT,
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

const { GET } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * Every open of a kitchen reads the price book for the current estimate. The pricing has its own answer for a book that
 * cannot be had, so a price store that is down never costs staff the kitchen: the page opens, the current estimate is
 * refused with that code, and the total that was sent is untouched. Only a failure that is not the store's own
 * refusal, a defect, is a `503`, and it writes no row.
 */

const STORED_TOTAL = { totalMinor: 1_234_500, currency: "MDL" } as const;

let staffWorld: StaffWorld;
let priceStoreCalls: string[];

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  priceStoreCalls = [];
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function open(id: string, cookie: string) {
  return GET(
    accountRequest(`/api/staff/kitchens/${id}`, {
      cookie,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function signedInOperator(): Promise<string> {
  const staff = await signedInAs({ role: "operator" });
  staffWorld.reader.plantAccount({
    id: staff.account.id,
    email: "operator@example.test",
    name: "Operator Name",
    phone: null,
  });
  return staff.session.cookie;
}

function plantSentKitchen(): string {
  const { id } = plantKitchen({ design: aDesign("current") });
  staffWorld.reader.plantRequest({
    clientRequestId: aDesignId(),
    designId: id,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
    pricedTotal: STORED_TOTAL,
  });
  return id;
}

function heldActions(): string[] {
  return staffWorld.audit.heldEvents().map(({ action }) => action);
}

function pricesStoresThat(failWith: () => Error): PriceStores {
  const failing = <Result>(operation: string): Promise<Result> => {
    priceStoreCalls.push(operation);
    return Promise.reject(failWith());
  };
  const never = (operation: string) => () => failing<never>(operation);
  return {
    priceBook: {
      readActive: never("readActive"),
      readVersion: never("readVersion"),
      listVersions: never("listVersions"),
      readDraft: never("readDraft"),
      writeDraft: never("writeDraft"),
      publish: never("publish"),
    },
    availability: {
      readCurrent: never("readCurrent"),
      readAt: never("readAt"),
      setActive: never("setActive"),
    },
    defaults: { read: never("read"), save: never("save") },
    usage: { countEach: never("countEach") },
  };
}

function holdPriceStores(stores: PriceStores): void {
  Object.defineProperty(globalThis, PRICE_STORES_GLOBAL_KEY, {
    value: Promise.resolve(stores),
    configurable: true,
    writable: true,
  });
}

describe("a price store that cannot answer", () => {
  it.each([
    ["unavailable", "unavailable"],
    ["failed", "database"],
  ] as const)(
    "opens the kitchen when the price book store has %s, with the current estimate refused and the sent total intact",
    async (_label, kind) => {
      const cookie = await signedInOperator();
      const id = plantSentKitchen();
      holdPriceStores(
        pricesStoresThat(
          () => new DashboardStoreError("read the active price version", kind),
        ),
      );

      const answer = await open(id, cookie);

      expect(answer.status).toBe(200);
      expect(await jsonOf(answer)).toMatchObject({
        sentEstimate: STORED_TOTAL,
        currentEstimate: { refused: "INVALID_PRICE_BOOK" },
      });
      expect(heldActions()).toEqual(["kitchen-opened"]);
    },
  );

  it("opens the kitchen when only the availability store cannot answer, and never prices from the book alone", async () => {
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);
    Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
    const seeded = await getPriceStores();
    const unavailable = pricesStoresThat(
      () =>
        new DashboardStoreError(
          "read the catalogue availability",
          "unavailable",
        ),
    );
    holdPriceStores({
      ...unavailable,
      priceBook: seeded.priceBook,
    });
    const cookie = await signedInOperator();
    const id = plantSentKitchen();

    const answer = await open(id, cookie);

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toMatchObject({
      sentEstimate: STORED_TOTAL,
      currentEstimate: { refused: "INVALID_PRICE_BOOK" },
    });
    expect(heldActions()).toEqual(["kitchen-opened"]);
  });

  it("is 503 with no cause and no row when a price store fails with anything but its own refusal", async () => {
    const cookie = await signedInOperator();
    const id = plantSentKitchen();
    holdPriceStores(pricesStoresThat(() => new Error(DRIVER_FAILURE_MARKER)));

    const answer = await open(id, cookie);

    expect(answer.status).toBe(503);
    expect(await answer.text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(heldActions()).toEqual([]);
  });
});

describe("a kitchen staff may not open never reaches the price book", () => {
  it("reads no price store for an unknown id, a malformed id, a kitchen its client deleted or a visitor's draft", async () => {
    const cookie = await signedInOperator();
    holdPriceStores(pricesStoresThat(() => new Error("must not be read")));
    const client = plantClient();
    const deleted = plantKitchen({
      accountId: client.id,
      isDeletedByClient: true,
    });
    const visitorDraft = plantKitchen({ isSent: false });

    const answers = [
      await open(aDesignId(), cookie),
      await open("not-an-id", cookie),
      await open(deleted.id, cookie),
      await open(visitorDraft.id, cookie),
    ];

    expect(answers.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
    expect(priceStoreCalls).toEqual([]);
    expect(heldActions()).toEqual([]);
  });

  it("reads no price store for a caller that is refused before the reader", async () => {
    holdPriceStores(pricesStoresThat(() => new Error("must not be read")));
    const id = plantSentKitchen();
    const client = await signedInAs({ role: "client" });

    const anonymous = await GET(
      accountRequest(`/api/staff/kitchens/${id}`, {
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
      { params: Promise.resolve({ id }) },
    );
    const asClient = await open(id, client.session.cookie);

    expect([anonymous.status, asClient.status]).toEqual([401, 403]);
    expect(priceStoreCalls).toEqual([]);
  });
});
