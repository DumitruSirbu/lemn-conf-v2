import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { staffKitchenListFrom } from "@/staff/use-staff-kitchens";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
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

const { GET } = await import("@/app/api/staff/kitchens/route");

/**
 * The staff list screen reads what the route writes: the page the real route answers, over the persistence fakes, is
 * read whole by the screen's own reader, with no row lost to a member the reader does not know and no document left
 * unread. Without it the reader and the route could each agree with a fixture and disagree with one another.
 */

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function pageAnswered(search = ""): Promise<unknown> {
  const { session } = await signedInAs({ role: "operator" });
  const answer = await GET(
    accountRequest("/api/staff/kitchens", {
      cookie: session.cookie,
      search,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
  expect(answer.status).toBe(200);
  return jsonOf(answer);
}

describe("the real list route's page, read by the screen's reader", () => {
  it("keeps every row, with its client, its thumbnail design and its flags", async () => {
    const client = plantClient({ name: "Ana Client", phone: "+37369000111" });
    const owned = plantKitchen({
      accountId: client.id,
      name: "Bucatarie de proba",
      isHidden: true,
    });
    const visitors = plantKitchen({ accountId: null });
    const draft = plantKitchen({ accountId: client.id, isSent: false });

    const list = staffKitchenListFrom(await pageAnswered("?segment=all"));

    expect(list?.total).toBe(3);
    expect(list?.page).toBe(1);
    expect(list?.pageSize).toBe(20);
    const byId = new Map(list?.kitchens.map((row) => [row.id, row]));
    expect(byId.get(owned.id)).toMatchObject({
      name: "Bucatarie de proba",
      isSent: true,
      isHidden: true,
      requestStatus: "new",
      client: {
        email: client.email,
        name: "Ana Client",
        phone: "+37369000111",
      },
    });
    expect(byId.get(owned.id)?.design).not.toBeNull();
    expect(byId.get(visitors.id)?.client).toBeNull();
    expect(byId.get(draft.id)).toMatchObject({
      isSent: false,
      sentAt: null,
      requestStatus: null,
    });
  });

  it("keeps a kitchen whose document the build cannot read, as a row with no design", async () => {
    plantKitchen({ design: null });

    const list = staffKitchenListFrom(await pageAnswered());

    expect(list?.kitchens).toHaveLength(1);
    expect(list?.kitchens[0]?.design).toBeNull();
  });

  it("reads an empty list as a page with no rows", async () => {
    const list = staffKitchenListFrom(await pageAnswered());

    expect(list).toEqual({ total: 0, page: 1, pageSize: 20, kitchens: [] });
  });
});
