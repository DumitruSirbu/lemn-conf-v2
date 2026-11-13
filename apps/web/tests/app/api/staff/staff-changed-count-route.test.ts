import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF_CHANGED_COUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "@/staff/changed-count-poll-interval";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
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

const { GET: COUNT, HEAD } = await import(
  "@/app/api/staff/kitchens/changed-count/route"
);
const { GET: LIST } = await import("@/app/api/staff/kitchens/route");

/**
 * `GET /api/staff/kitchens/changed-count` (ADR 0178 A-12). The number behind the menu badge: global, the same for every
 * staff member, answered from a count shared for one poll interval, and the one staff read that writes no audit row.
 */

const SESSION_TOUCH = "sessions.touch";
const POLL_POLICY_NAME = STAFF_CHANGED_COUNT_POLICY.name;
const COUNT_PATH = "/api/staff/kitchens/changed-count";
const POLL_INTERVAL_MS = CHANGED_COUNT_POLL_INTERVAL_SECONDS * 1000;
const START = new Date("2026-11-04T10:00:00.000Z");

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function countRequest(
  init: Parameters<typeof accountRequest>[1] = {},
): NextRequest {
  return accountRequest(COUNT_PATH, {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

/** A kitchen sent at revision 1 and saved since, so it is changed after seen. */
function plantChangedKitchen(): void {
  const { id } = plantKitchen({ revision: "2" });
  staffWorld.reader.plantRequest({
    clientRequestId: id,
    designId: id,
    reference: `REF-${id.slice(0, 6)}`,
    createdAt: new Date("2026-10-18T09:00:00.000Z"),
    designRevision: "1",
  });
}

async function countFor(cookie: string): Promise<unknown> {
  const answer = await COUNT(countRequest({ cookie }));
  expect(answer.status).toBe(200);
  return jsonOf(answer);
}

describe("who may read it", () => {
  it("answers an operator the count and nothing else, private and no-store", async () => {
    const { session } = await signedInOperator();
    plantChangedKitchen();
    plantChangedKitchen();
    plantKitchen();

    const answer = await COUNT(countRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ count: 2 });
  });

  it.each([
    ["nobody", undefined, 401],
    ["a client", "client", 403],
    ["a staff address not yet confirmed", "unconfirmed", 403],
  ])("refuses %s before it asks the store", async (_title, who, status) => {
    const cookie = await cookieOf(who);

    const answer = await COUNT(
      countRequest(cookie === undefined ? {} : { cookie }),
    );

    expect(answer.status).toBe(status);
    expect(staffWorld.calls).toEqual([]);
  });

  it("is refused with the poll's own network limit before the session is read", async () => {
    const { session } = await signedInOperator();
    limiterLedger.refusing.set(POLL_POLICY_NAME, 30);
    world.calls.length = 0;

    const answer = await COUNT(countRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, POLL_POLICY_NAME);
    expect(staffWorld.calls).toEqual([]);
  });
});

async function cookieOf(who: string | undefined): Promise<string | undefined> {
  if (who === undefined) return undefined;
  if (who === "client")
    return (await signedInAs({ role: "client" })).session.cookie;
  return (
    await signedInAs(
      { role: "operator", isVerified: false },
      "unconfirmed@example.test",
    )
  ).session.cookie;
}

describe("the poll's network budget", () => {
  it("counts a poll in its own bucket and never in the one pages and design reads share", async () => {
    const { session } = await signedInOperator();

    await countFor(session.cookie);

    expect(limiterLedger.counted).toEqual([POLL_POLICY_NAME]);
    expect(limiterLedger.counted).not.toContain(READ_POLICY_NAME);
  });

  it("is not stopped by a network whose page reads are spent", async () => {
    const { session } = await signedInOperator();
    limiterLedger.refusing.set(READ_POLICY_NAME, 30);

    const answer = await COUNT(countRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
  });

  it("refuses a poll with the shape of the read refusal: status, body and cache header", async () => {
    const { session } = await signedInOperator();
    limiterLedger.refusing.set(POLL_POLICY_NAME, 30);
    const refusedPoll = await COUNT(countRequest({ cookie: session.cookie }));
    limiterLedger.refusing.clear();
    limiterLedger.refusing.set(READ_POLICY_NAME, 30);
    const refusedRead = await LIST(
      accountRequest("/api/staff/kitchens", {
        cookie: session.cookie,
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );

    expect([refusedPoll.status, await jsonOf(refusedPoll)]).toEqual([
      refusedRead.status,
      await jsonOf(refusedRead),
    ]);
    expect(refusedPoll.headers.get("cache-control")).toBe(
      refusedRead.headers.get("cache-control"),
    );
  });
});

describe("what a poll leaves behind", () => {
  it("writes no audit row, where every list view writes one", async () => {
    const { session } = await signedInOperator();
    plantChangedKitchen();

    await countFor(session.cookie);
    await countFor(session.cookie);
    const listed = await LIST(
      accountRequest("/api/staff/kitchens", {
        cookie: session.cookie,
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );

    expect(listed.status).toBe(200);
    expect(staffWorld.audit.heldEvents().map(({ action }) => action)).toEqual([
      "kitchens-listed",
    ]);
  });

  it("does not extend the session's idle lifetime, which a person's request does", async () => {
    const { session } = await signedInOperator();

    await countFor(session.cookie);

    expect(world.calls.filter((call) => call === SESSION_TOUCH)).toEqual([]);
  });
});

describe("what the number is", () => {
  it("is the count the list's page carries, whatever that page is narrowed to", async () => {
    const { session } = await signedInOperator();
    plantChangedKitchen();
    plantChangedKitchen();
    plantKitchen();
    const listed = await LIST(
      accountRequest("/api/staff/kitchens", {
        cookie: session.cookie,
        search: "?segment=drafts",
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );

    const { changedCount, total } = (await jsonOf(listed)) as {
      changedCount: number;
      total: number;
    };

    expect(total).toBe(0);
    expect(await countFor(session.cookie)).toEqual({ count: changedCount });
    expect(changedCount).toBe(2);
  });

  it("is read once for any number of polls inside the interval, by any staff member, and again after it", async () => {
    const { session } = await signedInOperator();
    const colleague = await signedInOperator("colleague@example.test");
    plantChangedKitchen();
    const first = await countFor(session.cookie);
    plantChangedKitchen();

    vi.setSystemTime(START.getTime() + POLL_INTERVAL_MS - 1);
    const stillShared = await countFor(colleague.session.cookie);
    vi.setSystemTime(START.getTime() + POLL_INTERVAL_MS);
    const afterTheInterval = await countFor(session.cookie);

    expect([first, stillShared, afterTheInterval]).toEqual([
      { count: 1 },
      { count: 1 },
      { count: 2 },
    ]);
    expect(
      staffWorld.calls.filter((call) => call === "reader.countChanged"),
    ).toHaveLength(2);
  });
});

describe("when the store cannot answer", () => {
  it("is 503 with no cause, and the next poll reads again rather than keeping the failure", async () => {
    const { session } = await signedInOperator();
    plantChangedKitchen();
    staffWorld.failReader = true;

    const failed = await COUNT(countRequest({ cookie: session.cookie }));
    staffWorld.failReader = false;
    const recovered = await countFor(session.cookie);

    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(recovered).toEqual({ count: 1 });
  });
});

describe("the other methods", () => {
  it("answers HEAD 405 and runs nothing", async () => {
    const { session } = await signedInOperator();

    const answer = HEAD();

    expect(answer.status).toBe(405);
    expect(answer.headers.get("allow")).toBe("GET");
    expect(session.cookie).toBeDefined();
    expect(staffWorld.calls).toEqual([]);
  });

  it("refuses a cross-site request before reading anything", async () => {
    const { session } = await signedInOperator();

    const answer = await COUNT(
      countRequest({ cookie: session.cookie, secFetchSite: "cross-site" }),
    );

    expect(answer.status).toBe(403);
    expect(staffWorld.calls).toEqual([]);
  });
});
