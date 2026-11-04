// The cabinet list's source over the worlds the dashboard's routes are tested in: the seeded fake price stores a
// development server reads, with the app's own sessions. The source is called after the page's staff gate has admitted
// the reader, and a render must not write: it gets the list's page and leaves no audit row, touches no session and
// spends no limiter bucket. Who is admitted is the gate's, held by `read-catalog-page.test.ts` and
// `qa-m10-u1-catalog-gate`. The production variant of the stores is the next file's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import {
  readCabinetDetail,
  readCabinetList,
} from "@/price-dashboard/cabinet-list-source";
import { STAFF_PRICES_READ_PER_ACCOUNT_HOUR_FIGURE } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
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
let accountWorld: AccountWorld;

beforeEach(() => {
  accountWorld = freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("an administrator's page", () => {
  it("is the seeded book's list, which the browser works out too", async () => {
    const read = await readCabinetList();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(deriveCabinetList(read.page).kind).toBe("ready");
    expect(read.page.state.draft.changes).toEqual([]);
  });
});

describe("a page render writes nothing and spends nothing", () => {
  it("leaves no audit row, whatever the audit store would have done with one", async () => {
    staffWorld.auditBehaviour = "reject";

    const read = await readCabinetList();

    expect(read.kind).toBe("ready");
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("touches no session, asks no account store and counts no limiter bucket", async () => {
    await signedInAs({ role: "administrator" });
    const callsBefore = accountWorld.calls.length;
    const bucketsBefore = limiterLedger.counted.length;

    await readCabinetList();

    expect(accountWorld.calls.slice(callsBefore)).toEqual([]);
    expect(limiterLedger.counted.slice(bucketsBefore)).toEqual([]);
  });

  it("stays the list past the account's hourly read limit, which only the route's read spends", async () => {
    const reads = STAFF_PRICES_READ_PER_ACCOUNT_HOUR_FIGURE + 1;

    for (let read = 0; read < reads; read += 1) {
      expect((await readCabinetList()).kind, String(read)).toBe("ready");
    }
  });
});

describe("one cabinet's page over the same worlds", () => {
  const BASE_CABINET_RULE = "cabinet.base-cabinet";

  it("is the seeded book's cabinet, and a rule the book lacks is not-found", async () => {
    const found = await readCabinetDetail(BASE_CABINET_RULE);
    const lacking = await readCabinetDetail("cabinet.stranger");

    expect(found.kind).toBe("ready");
    expect(lacking.kind).toBe("not-found");
  });

  it("leaves no audit row, touches no session and counts no limiter bucket, however often it is read", async () => {
    staffWorld.auditBehaviour = "reject";
    await signedInAs({ role: "administrator" });
    const callsBefore = accountWorld.calls.length;
    const bucketsBefore = limiterLedger.counted.length;

    for (
      let read = 0;
      read <= STAFF_PRICES_READ_PER_ACCOUNT_HOUR_FIGURE;
      read += 1
    ) {
      expect(
        (await readCabinetDetail(BASE_CABINET_RULE)).kind,
        String(read),
      ).toBe("ready");
    }

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(accountWorld.calls.slice(callsBefore)).toEqual([]);
    expect(limiterLedger.counted.slice(bucketsBefore)).toEqual([]);
  });
});
