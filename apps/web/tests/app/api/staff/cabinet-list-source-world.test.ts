// The cabinet list's source over the worlds the dashboard's routes are tested in: the seeded fake price stores a
// development server reads, with the app's own sessions. An administrator gets the list's page and leaves the one
// `price-catalogue-viewed` row the route would have; anyone else, and a session that is not live, get `unavailable` and no
// row. The production variant of the stores is the next file's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { readRequest } from "../../../support/price-dashboard-requests";
import {
  freshStaffWorld,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

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
const seeded = vi.hoisted(() => ({
  stores: undefined as Promise<unknown> | undefined,
}));
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => {
    seeded.stores ??= import("@/lib/server/price-book-test-seed").then(
      ({ seedFakePriceStores }) => seedFakePriceStores(),
    );
    return seeded.stores;
  },
}));

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
});

/** The request a page is served for, as the source is handed it: its cookies and its headers. */
function requestOf(cookie: string | undefined) {
  const request = readRequest(cookie === undefined ? {} : { cookie });
  return { cookies: request.cookies, headers: request.headers };
}

describe("an administrator's page", () => {
  it("is the seeded book's list, which the browser works out too, and one price-catalogue-viewed row", async () => {
    const { session, account } = await signedInAs({ role: "administrator" });

    const read = await readCabinetList(requestOf(session.cookie));

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(deriveCabinetList(read.page).kind).toBe("ready");
    expect(read.page.state.draft.changes).toEqual([]);
    expect(
      staffWorld.audit
        .heldEvents()
        .map(({ action, detail, actorAccountId }) => ({
          action,
          detail,
          actorAccountId,
        })),
    ).toEqual([
      {
        action: "price-catalogue-viewed",
        detail: { section: "catalogue" },
        actorAccountId: account.id,
      },
    ]);
  });
});

describe("anyone else", () => {
  it("gets unavailable and leaves no row: an operator holds no price.edit", async () => {
    const { session } = await signedInAs({ role: "operator" });

    expect(await readCabinetList(requestOf(session.cookie))).toEqual({
      kind: "unavailable",
    });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("gets unavailable and leaves no row: a request with no session", async () => {
    expect(await readCabinetList(requestOf(undefined))).toEqual({
      kind: "unavailable",
    });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("gets unavailable, with no price, when the audit row cannot be written", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    staffWorld.auditBehaviour = "reject";

    expect(await readCabinetList(requestOf(session.cookie))).toEqual({
      kind: "unavailable",
    });
  });
});
