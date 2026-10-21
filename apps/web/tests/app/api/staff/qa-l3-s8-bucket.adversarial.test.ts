import type { RateLimitStore } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import {
  STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
  STAFF_AUDIT_PAGE_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  READ_POLICY_NAME,
  accountRequest,
  aDesignId,
  captureConsole,
  currentAccountWorld,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
} from "../../../support/account-world";
import {
  freshAuditPageWorld,
  plantEvent,
  type AuditPageWorld,
} from "../../../support/staff-audit-world";
import { signedInAs } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-audit-world").then((world) =>
    world.staffAuditPageStoreModule(),
  ),
);

const { GET, HEAD } = await import("@/app/api/staff/audit/route");

/**
 * Adversarial QA of wave L3-S8, part three: the audit page's bucket (ADR 0173, residuals of L3-S8: 300 pages an hour per
 * account, provisional, failing closed). The developer's file proves the figure with the ledger's refusing switch and one
 * real run of 300. This file counts for real wherever it can: whose bucket it is, where the hour turns, what a
 * limiter store that answers nonsense or nothing does to a request, and which requests the bucket counts. Its own
 * file, because a test that serves whole hours of pages must not share a network block's read count with another that
 * serves as many (the S6 file's reason).
 */

const AUDIT_POLICY_NAME = STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY.name;
const PAGES_PER_HOUR = STAFF_AUDIT_PAGE_PER_ACCOUNT_HOUR_FIGURE;
const RATE_LIMIT_DEADLINE_MS = 3000;
const SESSION_TOUCH = "sessions.touch";

let auditWorld: AuditPageWorld;
let ledgerCounting: RateLimitStore["recordHits"] | undefined;

beforeEach(() => {
  freshAccountWorld();
  auditWorld = freshAuditPageWorld();
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

function askPage(
  cookie: string | undefined,
  { search = "", address = "192.0.2.10" } = {},
) {
  return GET(
    accountRequest("/api/staff/audit", {
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
    const answer = await askPage(cookie, where);
    expect(answer.status).toBe(200);
  }
}

async function signedInAdministrator(email = "administrator@example.test") {
  return signedInAs({ role: "administrator" }, email);
}

function pagesCounted(): number {
  return limiterLedger.counted.filter((name) => name === AUDIT_POLICY_NAME)
    .length;
}

describe("the figure is exact and the refusal is the whole of the wait", () => {
  it("serves 300 pages, refuses the 301st and the 302nd with a whole-second wait inside the hour, and counts each request once", async () => {
    const { session } = await signedInAdministrator();

    await servePages(session.cookie, PAGES_PER_HOUR);
    const counted = pagesCounted();
    const refused = await askPage(session.cookie);
    const refusedAgain = await askPage(session.cookie);

    expect(PAGES_PER_HOUR).toBe(300);
    expect(counted).toBe(300);
    for (const answer of [refused, refusedAgain]) {
      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, AUDIT_POLICY_NAME);
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(answer.headers.get("set-cookie")).toBeNull();
      expect(answer.headers.get("content-type")).toMatch(/^application\/json/);
      expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    }
    expect(auditWorld.calls).toHaveLength(PAGES_PER_HOUR);
  });

  it("is the page's bucket and no other: 300 pages spend no list, save, export or mint bucket of the account", async () => {
    const { session } = await signedInAdministrator();

    await servePages(session.cookie, 5);

    expect(
      limiterLedger.counted.filter((name) => name !== READ_POLICY_NAME),
    ).toEqual(Array(5).fill(AUDIT_POLICY_NAME));
  });

  it("is not spent by the list: 300 list pages leave the audit page's 300 whole, and the 301st of the list does not refuse a page", async () => {
    const { session, account } = await signedInAdministrator();
    const headers = new Headers({ "x-forwarded-for": "192.0.2.10" });
    for (let listed = 0; listed < PAGES_PER_HOUR; listed += 1) {
      const judgement = await judgeAccountSubject({
        purpose: "staff-kitchens-list",
        headers,
        accountId: account.id,
      });
      expect(judgement.decision.kind).not.toBe("refuse");
    }
    const listRefused = await judgeAccountSubject({
      purpose: "staff-kitchens-list",
      headers,
      accountId: account.id,
    });

    await servePages(session.cookie, PAGES_PER_HOUR);

    expect(listRefused.decision.kind).toBe("refuse");
    expect((await askPage(session.cookie)).status).toBe(429);
  });
});

describe("the bucket is the account's, whatever session or network asks", () => {
  it("shares one bucket between two sessions of one account", async () => {
    const { account, session } = await signedInAdministrator();
    const second = await seedSession(account);
    await servePages(session.cookie, PAGES_PER_HOUR / 2);
    await servePages(second.cookie, PAGES_PER_HOUR / 2);

    const firstRefused = await askPage(session.cookie);
    const secondRefused = await askPage(second.cookie);

    expect([firstRefused.status, secondRefused.status]).toEqual([429, 429]);
  });

  it("shares one bucket between three networks, and does not tie it to the address that asked", async () => {
    limiterLedger.subjects.push(
      { kind: "ipv4-block", subject: "198.51.100" },
      { kind: "ipv4-block", subject: "203.0.113" },
    );
    const { session } = await signedInAdministrator();
    const third = PAGES_PER_HOUR / 3;
    await servePages(session.cookie, third, { address: "192.0.2.10" });
    await servePages(session.cookie, third, { address: "198.51.100.20" });
    await servePages(session.cookie, third, { address: "203.0.113.30" });

    const fromAFourthPlace = await askPage(session.cookie, {
      address: "198.51.100.99",
    });

    expect(fromAFourthPlace.status).toBe(429);
  });

  it("does not let one administrator's ceiling stop another, and each has the whole figure", async () => {
    // a second network, since the network's own read limit counts every request of one block, whoever sent it
    limiterLedger.subjects.push({ kind: "ipv4-block", subject: "198.51.100" });
    const elsewhere = { address: "198.51.100.20" };
    const first = await signedInAdministrator("first@example.test");
    const second = await signedInAdministrator("second@example.test");
    await servePages(first.session.cookie, PAGES_PER_HOUR);

    const stopped = await askPage(first.session.cookie);
    await servePages(second.session.cookie, PAGES_PER_HOUR, elsewhere);
    const secondStopped = await askPage(second.session.cookie, elsewhere);

    expect([stopped.status, secondStopped.status]).toEqual([429, 429]);
  });

  it("names the policy in the log line of a refusal, and nothing that identifies the account or the query", async () => {
    const console_ = captureConsole();
    const { account, session } = await signedInAdministrator();
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);

    const refused = await askPage(session.cookie, {
      search: "?action=note-added&from=2026-10-01",
    });

    expect(refused.status).toBe(429);
    expect(console_.accountLines()).toEqual([
      { event: "staff-audit", outcome: "limited", policy: AUDIT_POLICY_NAME },
    ]);
    for (const secret of [account.id, "note-added", "2026-10-01"]) {
      expect(console_.everything()).not.toContain(secret);
    }
  });
});

describe("the hour", () => {
  it("counts over one UTC hour, so a retune of the figure breaks no test", () => {
    expect(Number.isInteger(PAGES_PER_HOUR)).toBe(true);
    expect(PAGES_PER_HOUR).toBeGreaterThan(0);
    expect(STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY.window).toEqual({
      kind: "utc-minutes",
      minutes: 60,
    });
  });

  it("turns over at the clock hour: the 301st page waits one second at 10:59:59, and the hour that follows has its own 300", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:59:59.000Z"));
    const { session } = await signedInAdministrator();
    await servePages(session.cookie, PAGES_PER_HOUR);

    const refused = await askPage(session.cookie);
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    const stillRefused = await askPage(session.cookie);

    expect([refused.status, stillRefused.status]).toEqual([429, 429]);
    expect(refused.headers.get("retry-after")).toBe("1");
    expect(stillRefused.headers.get("retry-after")).toBe("1");

    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    await servePages(session.cookie, PAGES_PER_HOUR);
    const refusedAgain = await askPage(session.cookie);

    expect(refusedAgain.status).toBe(429);
    expect(refusedAgain.headers.get("retry-after")).toBe("3600");
  });

  it("counts a page served in the last millisecond of an hour in that hour, not the next", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    const { session } = await signedInAdministrator();
    await servePages(session.cookie, PAGES_PER_HOUR);

    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    const firstOfTheNext = await askPage(session.cookie);

    expect(firstOfTheNext.status).toBe(200);
    vi.setSystemTime(new Date("2026-10-21T10:59:59.999Z"));
    expect((await askPage(session.cookie)).status).toBe(429);
  });

  it("does not follow the clock of Chisinau: the hour turns on the UTC hour, in a half-hour zone's autumn night as in any other", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T00:59:59.999Z"));
    const { session } = await signedInAdministrator();
    await servePages(session.cookie, PAGES_PER_HOUR);
    expect((await askPage(session.cookie)).status).toBe(429);

    vi.setSystemTime(new Date("2026-10-25T01:00:00.000Z"));

    expect((await askPage(session.cookie)).status).toBe(200);
  });
});

describe("a limiter store that cannot give a trustworthy count serves no page", () => {
  /** The audit bucket's `recordHits` is answered by `answerWith`; every other bucket is counted as the ledger counts. */
  function answerTheAuditBucketWith(answerWith: () => unknown): void {
    const store = getRateLimitStore();
    const counting = ledgerCounting;
    if (counting === undefined) throw new Error("the limiter is not watched");
    vi.spyOn(store, "recordHits").mockImplementation((buckets) => {
      const counted = counting(buckets);
      const isAuditBucket = limiterLedger.counted
        .slice(-buckets.length)
        .includes(AUDIT_POLICY_NAME);
      return isAuditBucket ? (answerWith() as Promise<number[]>) : counted;
    });
  }

  async function expectNoPageServed(answer: Response): Promise<void> {
    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(auditWorld.calls).toEqual([]);
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
    const { session } = await signedInAdministrator();
    plantEvent(auditWorld, { actorAccountId: aDesignId() });
    answerTheAuditBucketWith(() => Promise.resolve(counts));

    await expectNoPageServed(await askPage(session.cookie));
  });

  it("answers 503 for a store that rejects, and for one that throws before it returns a promise", async () => {
    const { session } = await signedInAdministrator();
    answerTheAuditBucketWith(() => Promise.reject(new Error("driver text")));
    await expectNoPageServed(await askPage(session.cookie));

    answerTheAuditBucketWith(() => {
      throw new Error("driver text, thrown at once");
    });
    await expectNoPageServed(await askPage(session.cookie));
  });

  it("answers 503 for a store that never answers, after the limiter's own deadline and not before", async () => {
    const { session } = await signedInAdministrator();
    answerTheAuditBucketWith(() => new Promise<never>(() => undefined));
    const startedAt = Date.now();

    await expectNoPageServed(await askPage(session.cookie));

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      RATE_LIMIT_DEADLINE_MS - 100,
    );
    expect(Date.now() - startedAt).toBeLessThan(RATE_LIMIT_DEADLINE_MS + 2000);
  });

  it("serves a page when only the network's general read limit cannot be judged, which fails open, and still counts the page", async () => {
    const { session } = await signedInAdministrator();
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await askPage(session.cookie);

    expect(answer.status).toBe(200);
    expect(pagesCounted()).toBe(1);
  });
});

describe("what the bucket counts", () => {
  it("counts a page of a high number, and a filtered page, as a page", async () => {
    const { session } = await signedInAdministrator();
    await servePages(session.cookie, PAGES_PER_HOUR - 2);

    const high = await askPage(session.cookie, { search: "?page=100000" });
    const filtered = await askPage(session.cookie, {
      search: "?action=note-added&from=2026-10-01&to=2026-10-02",
    });
    const next = await askPage(session.cookie);

    expect([high.status, filtered.status, next.status]).toEqual([
      200, 200, 429,
    ]);
  });

  it("counts a page whose store failed: a page is counted before it is read", async () => {
    const { session } = await signedInAdministrator();
    auditWorld.failPage = true;
    for (let failed = 0; failed < 50; failed += 1) {
      expect((await askPage(session.cookie)).status).toBe(503);
    }
    auditWorld.failPage = false;

    await servePages(session.cookie, PAGES_PER_HOUR - 50);
    const refused = await askPage(session.cookie);

    expect(refused.status).toBe(429);
  });

  it("counts no wrong query, no anonymous request, no client, no operator, no unconfirmed administrator, no cross-site request and no HEAD", async () => {
    const { session } = await signedInAdministrator();
    const client = await signedInAs({ role: "client" }, "client@example.test");
    const operator = await signedInAs(
      { role: "operator" },
      "operator@example.test",
    );
    const unconfirmed = await signedInAs(
      { role: "administrator", isVerified: false },
      "unconfirmed@example.test",
    );
    await servePages(session.cookie, PAGES_PER_HOUR - 1);
    const countedBefore = pagesCounted();

    for (let refused = 0; refused < 40; refused += 1) {
      expect(
        (await askPage(session.cookie, { search: "?page=0" })).status,
      ).toBe(400);
      expect(
        (await askPage(session.cookie, { search: "?from=2026-02-30" })).status,
      ).toBe(400);
      expect((await askPage(undefined)).status).toBe(401);
      expect((await askPage(client.session.cookie)).status).toBe(403);
      expect((await askPage(operator.session.cookie)).status).toBe(403);
      expect((await askPage(unconfirmed.session.cookie)).status).toBe(403);
    }
    const crossSite = await GET(
      accountRequest("/api/staff/audit", {
        cookie: session.cookie,
        secFetchSite: "cross-site",
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );
    const head = HEAD();
    const lastAllowed = await askPage(session.cookie);
    const next = await askPage(session.cookie);

    expect(crossSite.status).toBe(403);
    expect(head.status).toBe(405);
    expect(pagesCounted() - countedBefore).toBe(2);
    expect([lastAllowed.status, next.status]).toEqual([200, 429]);
  });

  it("marks the session seen for a page the bucket refuses, as the plan has every admitted staff request keep the session alive", async () => {
    const { session } = await signedInAdministrator();
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    const touches = vi.fn();
    currentAccountWorld().intercept(SESSION_TOUCH, (real) => {
      touches();
      return real();
    });

    const refused = await askPage(session.cookie);

    expect(refused.status).toBe(429);
    expect(touches).toHaveBeenCalledTimes(1);
  });
});
