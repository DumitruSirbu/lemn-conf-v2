import type { RateLimitStore } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY,
  STAFF_KITCHENS_LIST_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  accountRequest,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
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

const { GET } = await import("@/app/api/staff/kitchens/route");

/**
 * Adversarial QA of the staff list's page bucket (ADR 0173): a number of pages an hour per account,
 * which fails closed. The edges the developer's file leaves: the bucket is the account's and nobody else's
 * (two sessions, three networks), the hour turns over at its edge, a store that answers nonsense or nothing serves no
 * page, and which requests the bucket counts. Its own file, because a test that serves a whole hour of pages must not share a
 * network block's read count with another that serves as many.
 */

const STAFF_LIST_POLICY_NAME =
  "staff-kitchens-list-by-account-per-60-utc-minutes";
const PAGES_ALLOWED_PER_HOUR = STAFF_KITCHENS_LIST_PER_ACCOUNT_HOUR_FIGURE;
const RATE_LIMIT_DEADLINE_MS = 3000;

let staffWorld: StaffWorld;
let ledgerCounting: RateLimitStore["recordHits"] | undefined;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  ledgerCounting = vi
    .spyOn(getRateLimitStore(), "recordHits")
    .getMockImplementation();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function askList(
  cookie: string | undefined,
  { search = "", address = "192.0.2.10" } = {},
) {
  return GET(
    accountRequest("/api/staff/kitchens", {
      ...(cookie === undefined ? {} : { cookie }),
      search,
      headers: { "x-forwarded-for": address },
    }),
  );
}

async function servePages(
  cookie: string,
  count: number,
  where?: { address?: string },
): Promise<void> {
  for (let served = 1; served <= count; served += 1) {
    const answer = await askList(cookie, where);
    expect(answer.status).toBe(200);
  }
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

function heldRows() {
  return staffWorld.audit.heldEvents();
}

describe("the bucket is the account's, whatever session or network asks", () => {
  it("shares one bucket between two sessions of one account", async () => {
    const { account, session } = await signedInOperator();
    const second = await seedSession(account);
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR / 2);
    await servePages(second.cookie, PAGES_ALLOWED_PER_HOUR / 2);

    const firstRefused = await askList(session.cookie);
    const secondRefused = await askList(second.cookie);

    expect([firstRefused.status, secondRefused.status]).toEqual([429, 429]);
  });

  it("shares one bucket between three networks, and does not tie it to the address that asked", async () => {
    limiterLedger.subjects.push(
      { kind: "ipv4-block", subject: "198.51.100" },
      { kind: "ipv4-block", subject: "203.0.113" },
    );
    const { session } = await signedInOperator();
    const quarter = PAGES_ALLOWED_PER_HOUR / 3;
    await servePages(session.cookie, quarter, { address: "192.0.2.10" });
    await servePages(session.cookie, quarter, { address: "198.51.100.20" });
    await servePages(session.cookie, quarter, { address: "203.0.113.30" });

    const fromAFourthPlace = await askList(session.cookie, {
      address: "198.51.100.99",
    });

    expect(fromAFourthPlace.status).toBe(429);
  });

  it("does not let the account's ceiling stop a second account on the same network", async () => {
    const first = await signedInOperator("first@example.test");
    const second = await signedInAs(
      { role: "administrator" },
      "second@example.test",
    );
    await servePages(first.session.cookie, PAGES_ALLOWED_PER_HOUR);

    const stopped = await askList(first.session.cookie);
    const served = await askList(second.session.cookie);

    expect([stopped.status, served.status]).toEqual([429, 200]);
  });

  it("names the bucket's policy in the log line of a refusal and nothing that identifies the account", async () => {
    const lines: unknown[][] = [];
    for (const method of ["warn", "error", "log", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args);
      });
    }
    const { account, session } = await signedInOperator();
    limiterLedger.refusing.set(STAFF_LIST_POLICY_NAME, 1);

    const refused = await askList(session.cookie);

    expect(refused.status).toBe(429);
    expect(lines).toContainEqual([
      "[account]",
      {
        event: "staff-kitchens",
        outcome: "limited",
        policy: STAFF_LIST_POLICY_NAME,
      },
    ]);
    expect(JSON.stringify(lines)).not.toContain(account.id);
  });
});

describe("the figure and the hour", () => {
  it("is a positive whole number of pages counted over one UTC hour, so a retune of the figure breaks no test", () => {
    expect(Number.isInteger(STAFF_KITCHENS_LIST_PER_ACCOUNT_HOUR_FIGURE)).toBe(
      true,
    );
    expect(STAFF_KITCHENS_LIST_PER_ACCOUNT_HOUR_FIGURE).toBeGreaterThan(0);
    expect(STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY.window).toEqual({
      kind: "utc-minutes",
      minutes: 60,
    });
  });

  it("turns over at the clock hour: the 301st page waits one second at 10:59:59, and the hour that follows has its own 300", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:59:59.000Z"));
    const { session } = await signedInOperator();
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR);

    const refused = await askList(session.cookie);
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    const stillRefused = await askList(session.cookie);

    expect([refused.status, stillRefused.status]).toEqual([429, 429]);
    expect(refused.headers.get("retry-after")).toBe("1");
    expect(stillRefused.headers.get("retry-after")).toBe("1");

    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR);
    const refusedAgain = await askList(session.cookie);

    expect(refusedAgain.status).toBe(429);
    expect(refusedAgain.headers.get("retry-after")).toBe("3600");
    expectAWaitWithinTheWindowOf(refusedAgain, STAFF_LIST_POLICY_NAME);
    expect(heldRows()).toHaveLength(PAGES_ALLOWED_PER_HOUR * 2);
  });

  it("counts a page served in the last millisecond of an hour in that hour, not the next", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    const { session } = await signedInOperator();
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR);

    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    const firstOfTheNext = await askList(session.cookie);

    expect(firstOfTheNext.status).toBe(200);
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    expect((await askList(session.cookie)).status).toBe(429);
  });
});

describe("a store that cannot give a trustworthy count serves no page", () => {
  /** The staff bucket's `recordHits` is answered by `answerWith`; every other bucket is counted as the ledger counts. */
  function answerTheStaffBucketWith(answerWith: () => unknown): void {
    const store = getRateLimitStore();
    const counting = ledgerCounting;
    if (counting === undefined) throw new Error("the limiter is not watched");
    vi.spyOn(store, "recordHits").mockImplementation((buckets) => {
      const counted = counting(buckets);
      const isStaffBucket = limiterLedger.counted
        .slice(-buckets.length)
        .includes(STAFF_LIST_POLICY_NAME);
      return isStaffBucket ? (answerWith() as Promise<number[]>) : counted;
    });
  }

  async function expectNoPageServed(answer: Response): Promise<void> {
    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  }

  it.each([
    ["a count of not-a-number", [Number.NaN]],
    ["a count of nought", [0]],
    ["a negative count", [-1]],
    ["a fractional count", [1.5]],
    ["an infinite count", [Number.POSITIVE_INFINITY]],
    ["a count that is text", ["1"]],
    ["a count that is null", [null]],
    ["no counts", []],
    ["a count that is not in a list", "1"],
    ["a count that is an object", { 0: 1 }],
    ["nothing at all", undefined],
  ])("answers 503 for %s", async (_title, counts) => {
    const { session } = await signedInOperator();
    plantKitchen({});
    answerTheStaffBucketWith(() => Promise.resolve(counts));

    await expectNoPageServed(await askList(session.cookie));
  });

  it("answers 503 for a store that rejects, and for one that throws before it returns a promise", async () => {
    const { session } = await signedInOperator();
    answerTheStaffBucketWith(() => Promise.reject(new Error("driver text")));
    await expectNoPageServed(await askList(session.cookie));

    answerTheStaffBucketWith(() => {
      throw new Error("driver text, thrown at once");
    });
    await expectNoPageServed(await askList(session.cookie));
  });

  it("answers 503 for a store that never answers, after the limiter's own deadline", async () => {
    const { session } = await signedInOperator();
    answerTheStaffBucketWith(() => new Promise<never>(() => undefined));
    const startedAt = Date.now();

    await expectNoPageServed(await askList(session.cookie));

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      RATE_LIMIT_DEADLINE_MS - 100,
    );
    expect(Date.now() - startedAt).toBeLessThan(RATE_LIMIT_DEADLINE_MS + 2000);
  });

  it("serves a page when only the network's general read limit cannot be judged, which fails open", async () => {
    const { session } = await signedInOperator();

    limiterLedger.unavailable.add("read-by-block-per-60-utc-minutes");
    const answer = await askList(session.cookie);

    expect(answer.status).toBe(200);
  });
});

describe("what the bucket counts", () => {
  it("counts a page of a high number as a page, the same as page 1", async () => {
    const { session } = await signedInOperator();
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR - 1);

    const lastAllowed = await askList(session.cookie, { search: "?page=1000" });
    const next = await askList(session.cookie, { search: "?page=1" });

    expect(lastAllowed.status).toBe(200);
    expect(next.status).toBe(429);
  });

  it("counts a page whose reader failed and a page whose audit row failed: a page is counted before it is read", async () => {
    const { session } = await signedInOperator();
    plantKitchen({});
    staffWorld.failReader = true;
    for (let failed = 0; failed < 50; failed += 1) {
      expect((await askList(session.cookie)).status).toBe(503);
    }
    staffWorld.failReader = false;
    staffWorld.auditBehaviour = "reject";
    for (let failed = 0; failed < 50; failed += 1) {
      expect((await askList(session.cookie)).status).toBe(503);
    }
    staffWorld.auditBehaviour = "commit";

    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR - 100);
    const refused = await askList(session.cookie);

    expect(refused.status).toBe(429);
  });

  it("counts no refused query, no anonymous request, no client and no cross-site request", async () => {
    const { session } = await signedInOperator();
    const client = await signedInAs({ role: "client" });
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR - 1);

    for (let refused = 0; refused < 40; refused += 1) {
      expect(
        (await askList(session.cookie, { search: "?page=0" })).status,
      ).toBe(400);
      expect(
        (await askList(session.cookie, { search: "?segment=nope" })).status,
      ).toBe(400);
      expect((await askList(undefined)).status).toBe(401);
      expect((await askList(client.session.cookie)).status).toBe(403);
    }
    const crossSite = await GET(
      accountRequest("/api/staff/kitchens", {
        cookie: session.cookie,
        secFetchSite: "cross-site",
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );
    const lastAllowed = await askList(session.cookie);
    const next = await askList(session.cookie);

    expect(crossSite.status).toBe(403);
    expect([lastAllowed.status, next.status]).toEqual([200, 429]);
  });

  it("counts nothing for a one-kitchen read: the bucket is the list's alone", async () => {
    const { session } = await signedInOperator();
    const { GET: ONE } = await import("@/app/api/staff/kitchens/[id]/route");
    const kitchen = plantKitchen({});
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR - 1);

    for (let opened = 0; opened < 30; opened += 1) {
      const answer = await ONE(
        accountRequest("/api/staff/kitchens/x", {
          cookie: session.cookie,
          headers: { "x-forwarded-for": "192.0.2.10" },
        }),
        { params: Promise.resolve({ id: kitchen.id }) },
      );
      expect(answer.status).toBe(200);
    }

    expect((await askList(session.cookie)).status).toBe(200);
    expect((await askList(session.cookie)).status).toBe(429);
  });
});
