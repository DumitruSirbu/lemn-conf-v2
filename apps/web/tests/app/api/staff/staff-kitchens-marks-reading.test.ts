import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  withMarksOfKitchen,
  withMarksOfList,
} from "@/staff/staff-kitchens-marks-reading";
import { staffKitchenListFrom } from "@/staff/staff-kitchens-wire-reading";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import {
  accountRequest,
  aDesignId,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  SENT_AT,
  freshStaffWorld,
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

const { GET: LIST } = await import("@/app/api/staff/kitchens/route");
const { GET: ONE } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * What the real routes answer with the changed-after-seen mark, its revision and its estimates, read by the screens' own
 * readers: the routes and the readers could each agree with a fixture and still disagree with one another.
 */

const STORED_TOTAL = { totalMinor: 1_234_500, currency: "MDL" } as const;

let staffWorld: StaffWorld;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
});

/** A kitchen sent at revision 1 and saved since, so the store judges it changed. */
function plantChanged(): string {
  const { id } = plantKitchen({ revision: "2" });
  staffWorld.reader.plantRequest({
    clientRequestId: aDesignId(),
    designId: id,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
    designRevision: "1",
    pricedTotal: STORED_TOTAL,
  });
  return id;
}

async function signedInCookie(): Promise<string> {
  const { session } = await signedInAs({ role: "operator" });
  return session.cookie;
}

async function listBody(cookie: string): Promise<unknown> {
  const answer = await LIST(
    accountRequest("/api/staff/kitchens", {
      cookie,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
  expect(answer.status).toBe(200);
  return jsonOf(answer);
}

async function kitchenBody(id: string, cookie: string): Promise<unknown> {
  const answer = await ONE(
    accountRequest(`/api/staff/kitchens/${id}`, {
      cookie,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(answer.status).toBe(200);
  return jsonOf(answer);
}

describe("the real list route's marks and count, read by the list's reader", () => {
  it("marks the changed kitchen and counts it, and marks the other as not changed", async () => {
    const cookie = await signedInCookie();
    const unchanged = plantKitchen().id;
    const changed = plantChanged();

    const body = await listBody(cookie);
    const base = staffKitchenListFrom(body);
    const list = base === undefined ? undefined : withMarksOfList(base, body);

    expect(list?.changedCount).toBe(1);
    expect(list?.kitchens.map((row) => [row.id, row.changedAfterSeen])).toEqual(
      [
        [changed, true],
        [unchanged, false],
      ],
    );
  });
});

describe("the real kitchen route's mark, revision and estimates, read by the page's reader", () => {
  async function openedBy(id: string, cookie: string) {
    const body = await kitchenBody(id, cookie);
    const base = staffKitchenFrom(body);
    return base === undefined ? undefined : withMarksOfKitchen(base, body);
  }

  it("reads the mark, the revision the page displays and the stored total, with the current estimate refused while no book is active", async () => {
    const cookie = await signedInCookie();
    const id = plantChanged();

    const opened = await openedBy(id, cookie);

    expect(opened).toMatchObject({
      changedAfterSeen: true,
      displayedRevision: "2",
      sentEstimate: STORED_TOTAL,
      currentEstimate: { refused: "INVALID_PRICE_BOOK" },
    });
  });

  it("reads the current estimate as a priced total under an active book", async () => {
    vi.stubEnv(FAKE_PRICE_BOOK_FLAG, FAKE_PRICE_BOOK_FLAG_ENABLED);
    const cookie = await signedInCookie();
    const id = plantChanged();

    const opened = await openedBy(id, cookie);

    expect(opened?.currentEstimate).toMatchObject({ currency: "MDL" });
    expect(opened?.currentEstimate).not.toHaveProperty("refused");
    expect(opened?.sentEstimate).toEqual(STORED_TOTAL);
  });

  it("reads a kitchen with no request as having no sent estimate", async () => {
    const cookie = await signedInCookie();
    const { id } = plantKitchen();

    const opened = await openedBy(id, cookie);

    expect(opened?.sentEstimate).toBeNull();
    expect(opened?.changedAfterSeen).toBe(false);
  });
});
