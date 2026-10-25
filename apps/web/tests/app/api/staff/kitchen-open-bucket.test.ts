import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY,
  STAFF_KITCHEN_OPEN_PER_ACCOUNT_HOUR_FIGURE,
  STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  accountRequest,
  aDesignId,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
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

const { GET } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * The account's opening bucket (ADR 0173): each kitchen opened is one hit for the account, counted after the id's shape
 * and before the reader, and, like the list's page bucket, a bucket that cannot be counted opens nothing.
 */

const OPEN_POLICY_NAME = STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY.name;
const OPENS_ALLOWED_PER_HOUR = STAFF_KITCHEN_OPEN_PER_ACCOUNT_HOUR_FIGURE;

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

function open(id: string, cookie: string | undefined) {
  const request = accountRequest(`/api/staff/kitchens/${id}`, {
    ...(cookie === undefined ? {} : { cookie }),
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
  return GET(request, { params: Promise.resolve({ id }) });
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

async function openMany(id: string, cookie: string, count: number) {
  for (let opened = 1; opened <= count; opened += 1) {
    expect((await open(id, cookie)).status).toBe(200);
  }
}

describe("the figure", () => {
  it("is a positive whole number of openings counted over one UTC hour, so a retune breaks no test", () => {
    expect(Number.isInteger(OPENS_ALLOWED_PER_HOUR)).toBe(true);
    expect(OPENS_ALLOWED_PER_HOUR).toBeGreaterThan(0);
    expect(STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY.window).toEqual({
      kind: "utc-minutes",
      minutes: 60,
    });
  });
});

describe("the opening bucket", () => {
  // The network's read bucket has the same figure and window, so a test that opens a whole hour's worth names no
  // network source, where reads are not counted at all (ADR 0156), and the only bucket that can refuse is the account's.
  beforeEach(() => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  });

  it("serves the figure's openings an hour and refuses the next with a wait inside the hour, reading nothing and writing no row for it", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    await openMany(id, session.cookie, OPENS_ALLOWED_PER_HOUR);
    staffWorld.calls.length = 0;

    const refused = await open(id, session.cookie);

    expect(refused.status).toBe(429);
    expectAWaitWithinTheWindowOf(refused, OPEN_POLICY_NAME);
    expect(await jsonOf(refused)).toEqual({ status: "rate-limited" });
    expect(staffWorld.calls).toEqual([]);
    expect(staffWorld.audit.heldEvents()).toHaveLength(OPENS_ALLOWED_PER_HOUR);
  });

  it("counts each account's openings apart: one account's ceiling does not stop another's first", async () => {
    const first = await signedInOperator("first@example.test");
    const second = await signedInOperator("second@example.test");
    const { id } = plantKitchen();
    await openMany(id, first.session.cookie, OPENS_ALLOWED_PER_HOUR);

    const stopped = await open(id, first.session.cookie);
    const served = await open(id, second.session.cookie);

    expect([stopped.status, served.status]).toEqual([429, 200]);
  });

  it("counts apart from the list's page bucket", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    limiterLedger.refusing.set(STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY.name, 1);

    const answer = await open(id, session.cookie);

    expect(answer.status).toBe(200);
    expect(limiterLedger.counted).not.toContain(
      STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY.name,
    );
  });

  it("counts a well-formed id that names nothing, since it asks the reader, and counts a malformed id never", async () => {
    const { session } = await signedInOperator();

    await open(aDesignId(), session.cookie);
    const countedForAnUnknownId = limiterLedger.counted.filter(
      (name) => name === OPEN_POLICY_NAME,
    ).length;
    for (const malformed of [
      "abc",
      "A".repeat(22),
      "has space",
      "legacy-id01",
    ]) {
      await open(malformed, session.cookie);
    }
    const countedInAll = limiterLedger.counted.filter(
      (name) => name === OPEN_POLICY_NAME,
    ).length;

    expect(countedForAnUnknownId).toBe(1);
    expect(countedInAll).toBe(1);
  });

  it("counts a request refused before admission never", async () => {
    const client = await signedInAs({ role: "client" });
    const { id } = plantKitchen();

    await open(id, undefined);
    await open(id, client.session.cookie);

    expect(limiterLedger.counted).not.toContain(OPEN_POLICY_NAME);
  });

  it("counts the bucket before the reader is asked", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    limiterLedger.refusing.set(OPEN_POLICY_NAME, 1);

    const answer = await open(id, session.cookie);

    expect(answer.status).toBe(429);
    expect(staffWorld.calls).toEqual([]);
  });

  it("refuses the opening, reads nothing and writes no row when the bucket cannot be counted", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const { id } = plantKitchen();
    limiterLedger.unavailable.add(OPEN_POLICY_NAME);

    const answer = await open(id, session.cookie);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(staffWorld.calls).toEqual([]);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("counts the bucket when no network source is named, where the general read is not counted at all", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();

    const served = await open(id, session.cookie);
    limiterLedger.refusing.set(OPEN_POLICY_NAME, 1);
    const refused = await open(id, session.cookie);

    expect([served.status, refused.status]).toEqual([200, 429]);
    expect(limiterLedger.counted).toEqual([OPEN_POLICY_NAME, OPEN_POLICY_NAME]);
  });
});
