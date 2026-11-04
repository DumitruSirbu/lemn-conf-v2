// Adversarial QA of M10 wave U3, a cabinet's page render over the seeded stores. The developer's world test reads the base
// cabinet; a render is also made for ids that name nothing, and a render that ends in the framework's not-found must leave
// the stores exactly as one that draws. Whatever the id, nothing is written: no audit row (even where the audit store would
// accept one), no session touched, no limiter bucket counted, and the draft's revision and the active version are the ones
// they were.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCabinetDetail } from "@/price-dashboard/cabinet-list-source";
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

const IDS = [
  "cabinet.base-cabinet",
  "cabinet.stranger",
  "",
  "..",
  "__proto__",
  "a/b",
  "x".repeat(50_000),
  "cabinet.base-cabinet\u0000",
] as const;

describe("a render for any id writes nothing, spends nothing and moves nothing", () => {
  it("leaves the audit empty, the sessions and limiter untouched, and the draft and the active version where they were", async () => {
    staffWorld.auditBehaviour = "reject";
    await signedInAs({ role: "administrator" });
    const first = await readCabinetDetail("cabinet.base-cabinet");
    if (first.kind !== "ready")
      throw new Error("the seeded book has no base cabinet");
    const callsBefore = accountWorld.calls.length;
    const bucketsBefore = limiterLedger.counted.length;

    for (const ruleId of IDS) {
      const read = await readCabinetDetail(ruleId);
      expect(read.kind, ruleId.slice(0, 20)).toBe(
        ruleId === "cabinet.base-cabinet" ? "ready" : "not-found",
      );
    }

    const after = await readCabinetDetail("cabinet.base-cabinet");
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(accountWorld.calls.slice(callsBefore)).toEqual([]);
    expect(limiterLedger.counted.slice(bucketsBefore)).toEqual([]);
    expect(after.kind === "ready" ? after.page.state : undefined).toEqual(
      first.page.state,
    );
  });
});
