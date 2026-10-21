import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  StaffAuditStoreError,
  type StaffAuditPage,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  aDesignId,
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  civilDayFromText,
  dayText,
  localMidnightOf,
  nextCivilDay,
  previousCivilDay,
} from "../../../support/qa-l3-s8-chisinau-oracle";
import {
  freshAuditPageWorld,
  plantEvent,
  type AuditPageWorld,
} from "../../../support/staff-audit-world";
import { signedInAs, type StaffCaller } from "../../../support/staff-world";

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

const route = await import("@/app/api/staff/audit/route");

/**
 * Adversarial QA of wave L3-S8, part two: the route over the persistence fakes. The developer's file pins the table of
 * callers, the order in words, the whitelist with one decorating store and the bucket's figure. This file looks for
 * what those leave: the order as a timeline of every call that was made, the callers refused with nothing counted, a
 * demotion between admission and the read, the window's edges on the days the clocks change, ties and seams of the
 * page, rows the build reads as unrecognised in every shape a script around the store could write, a store that
 * answers with more than the port declares at every depth, and the log, the headers and the methods of every answer.
 */

const AUDIT_POLICY_NAME = "staff-audit-page-by-account-per-60-utc-minutes";
const SESSION_TOUCH = "sessions.touch";
const FIND_LIVE = "sessions.findLive";
const PAGE_SIZE = 25;
const ACCOUNT_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

let world: AccountWorld;
let auditWorld: AuditPageWorld;

beforeEach(() => {
  world = freshAccountWorld();
  auditWorld = freshAuditPageWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type AuditRequestInit = Parameters<typeof accountRequest>[1];

function auditRequest(init: NonNullable<AuditRequestInit> = {}) {
  return accountRequest("/api/staff/audit", {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

async function signedInAdministrator(email = "administrator@example.test") {
  return signedInAs({ role: "administrator" }, email);
}

interface EventWire {
  id: string;
  occurredAt: string;
  entry: Record<string, unknown>;
  actor: Record<string, unknown>;
  subject: Record<string, unknown> | null;
  kitchen: {
    id: string;
    name: string | null;
    client: Record<string, unknown> | null;
  } | null;
}

interface PageWire {
  total: number;
  page: number;
  pageSize: number;
  events: EventWire[];
}

async function pageOf(answer: Response): Promise<PageWire> {
  return (await jsonOf(answer)) as PageWire;
}

// ---------------------------------------------------------------------------------------------------------------------
// (1) who may read

describe("a refused caller is refused with nothing counted for the page and nothing read", () => {
  type Refused = readonly [string, StaffCaller | "anonymous", 401 | 403];
  const REFUSED: readonly Refused[] = [
    ["anonymous", "anonymous", 401],
    ["a client", { role: "client" }, 403],
    ["an unconfirmed client", { role: "client", isVerified: false }, 403],
    ["an operator", { role: "operator" }, 403],
    ["an unconfirmed operator", { role: "operator", isVerified: false }, 403],
    [
      "an unconfirmed administrator",
      { role: "administrator", isVerified: false },
      403,
    ],
  ];

  it.each(REFUSED)(
    "refuses %s: only the network's read is counted, the session is not marked, the store is not asked and the log names the refusal alone",
    async (_title, caller, status) => {
      const console_ = captureConsole();
      const cookie =
        caller === "anonymous"
          ? undefined
          : (await signedInAs(caller, "someone@example.test")).session.cookie;
      limiterLedger.counted.length = 0;
      world.calls.length = 0;

      const answer = await route.GET(
        auditRequest({
          ...(cookie === undefined ? {} : { cookie }),
          search: "?actor=A1b2C3d4E5f6G7h8I9j0_&page=2",
        }),
      );

      expect(answer.status).toBe(status);
      expect(limiterLedger.counted).toEqual([READ_POLICY_NAME]);
      expect(world.calls).not.toContain(SESSION_TOUCH);
      expect(auditWorld.calls).toEqual([]);
      expect(console_.accountLines()).toEqual([
        { event: "staff-audit", outcome: "refused" },
      ]);
    },
  );

  it("gives a client, an operator and an unconfirmed administrator the same bytes, so the refusal does not tell a role", async () => {
    const callers: StaffCaller[] = [
      { role: "client" },
      { role: "operator" },
      { role: "administrator", isVerified: false },
    ];
    const wires: string[] = [];
    for (const [index, caller] of callers.entries()) {
      const { session } = await signedInAs(
        caller,
        `caller${String(index)}@example.test`,
      );
      wires.push(
        await wireOf(await route.GET(auditRequest({ cookie: session.cookie }))),
      );
    }

    expect(new Set(wires).size).toBe(1);
  });

  it("is not fooled by a role, capability or account in a header, a cookie or the query, and an administrator's claim to be a client changes nothing", async () => {
    const operator = await signedInAs({ role: "operator" });
    const administrator = await signedInAdministrator();
    const claims = {
      "x-role": "administrator",
      "x-user-role": "administrator",
      "x-capabilities": "audit.read",
      "x-forwarded-user": administrator.account.id,
      "x-middleware-subrequest": "middleware",
      "x-account-id": administrator.account.id,
      authorization: `Bearer ${administrator.session.value}`,
    };

    const asOperator = await route.GET(
      auditRequest({
        cookie: `${operator.session.cookie}; role=administrator; capabilities=audit.read; account=${administrator.account.id}`,
        headers: claims,
        search: `?role=administrator&capability=audit.read&accountId=${administrator.account.id}&as=${administrator.account.id}`,
      }),
    );
    const asAdministrator = await route.GET(
      auditRequest({
        cookie: `${administrator.session.cookie}; role=client`,
        headers: { "x-role": "client", "x-user-role": "client" },
        search: "?role=client",
      }),
    );

    expect([asOperator.status, asAdministrator.status]).toEqual([403, 200]);
    expect(auditWorld.calls).toEqual(["audit.page"]);
    expect(auditWorld.pageRequests).toEqual([
      {
        actorAccountId: null,
        action: null,
        occurredFrom: null,
        occurredBefore: null,
        page: 1,
      },
    ]);
  });

  it("refuses a cookie that names a live session of the wrong length, case or shape as no session, with nothing read", async () => {
    const { session } = await signedInAdministrator();
    const refusedCookies = [
      cookieOfValue(session.value.toUpperCase()),
      cookieOfValue(session.value.slice(1)),
      cookieOfValue(`${session.value}x`),
      cookieOfValue(` ${session.value}`),
      cookieOfValue(""),
    ];

    for (const cookie of refusedCookies) {
      const answer = await route.GET(auditRequest({ cookie }));
      expect(answer.status).toBe(401);
    }
    expect(auditWorld.calls).toEqual([]);
  });

  it("answers 401 for a session the administrator's sign-out revoked and for one idle past its lifetime, and the 401 body is the anonymous one", async () => {
    const anonymous = await wireOf(await route.GET(auditRequest()));
    const revoked = await signedInAdministrator("revoked@example.test");
    await world.sessions.revokeAllForAccount(revoked.account.id);
    const idle = await signedInAdministrator("idle@example.test");
    world.advance(12 * 60 * 60 * 1000 + 1000);

    const wires = [
      await wireOf(
        await route.GET(auditRequest({ cookie: revoked.session.cookie })),
      ),
      await wireOf(
        await route.GET(auditRequest({ cookie: idle.session.cookie })),
      ),
    ];

    expect(wires).toEqual([anonymous, anonymous]);
  });
});

describe("a demotion", () => {
  it("is read at once by the next request: an administrator made an operator is refused, with the page not counted", async () => {
    const { session, account } = await signedInAdministrator();
    expect(
      (await route.GET(auditRequest({ cookie: session.cookie }))).status,
    ).toBe(200);
    world.accounts.setRoleOf(account.id, "operator");
    limiterLedger.counted.length = 0;
    auditWorld.calls.length = 0;

    const after = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(after.status).toBe(403);
    expect(limiterLedger.counted).toEqual([READ_POLICY_NAME]);
    expect(auditWorld.calls).toEqual([]);
  });

  it("is a residual between admission and the read: the request already admitted is served, and the very next one is refused (ADR 0173)", async () => {
    const { session, account } = await signedInAdministrator();
    world.intercept(SESSION_TOUCH, async (real) => {
      world.accounts.setRoleOf(account.id, "operator");
      return real();
    });

    const inFlight = await route.GET(auditRequest({ cookie: session.cookie }));
    const next = await route.GET(auditRequest({ cookie: session.cookie }));

    expect([inFlight.status, next.status]).toEqual([200, 403]);
    expect(auditWorld.calls).toEqual(["audit.page"]);
  });

  it("is also the other way: an operator made an administrator is served by the next request", async () => {
    const { session, account } = await signedInAs({ role: "operator" });
    expect(
      (await route.GET(auditRequest({ cookie: session.cookie }))).status,
    ).toBe(403);
    world.accounts.setRoleOf(account.id, "administrator");

    expect(
      (await route.GET(auditRequest({ cookie: session.cookie }))).status,
    ).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (2) the order, as a timeline of every call

describe("the order of every call, in one timeline", () => {
  function watchTheTimeline(): string[] {
    const timeline: string[] = [];
    for (const method of [FIND_LIVE, SESSION_TOUCH]) {
      world.intercept(method, (real) => {
        timeline.push(method);
        return real();
      });
    }
    const counting = vi
      .spyOn(getRateLimitStore(), "recordHits")
      .getMockImplementation();
    if (counting === undefined) throw new Error("the limiter is not watched");
    vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation(
      (buckets) => {
        const before = limiterLedger.counted.length;
        const answer = counting(buckets);
        timeline.push(
          `limiter:${limiterLedger.counted.slice(before).join("+")}`,
        );
        return answer;
      },
    );
    const asked = auditWorld.port.page.bind(auditWorld.port);
    auditWorld.port.page = (request) => {
      timeline.push("audit.page");
      return asked(request);
    };
    return timeline;
  }

  it("serves a page as: the network's read, the session, the mark, the account's page, the store", async () => {
    const { session } = await signedInAdministrator();
    const timeline = watchTheTimeline();

    await route.GET(auditRequest({ cookie: session.cookie }));

    expect(timeline).toEqual([
      `limiter:${READ_POLICY_NAME}`,
      FIND_LIVE,
      SESSION_TOUCH,
      `limiter:${AUDIT_POLICY_NAME}`,
      "audit.page",
    ]);
  });

  it("stops a wrong query after the mark and before the account's page is counted", async () => {
    const { session } = await signedInAdministrator();
    const timeline = watchTheTimeline();

    await route.GET(
      auditRequest({ cookie: session.cookie, search: "?page=0" }),
    );

    expect(timeline).toEqual([
      `limiter:${READ_POLICY_NAME}`,
      FIND_LIVE,
      SESSION_TOUCH,
    ]);
  });

  it("stops a refused page after counting it and before the store", async () => {
    const { session } = await signedInAdministrator();
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    const timeline = watchTheTimeline();

    await route.GET(auditRequest({ cookie: session.cookie }));

    expect(timeline).toEqual([
      `limiter:${READ_POLICY_NAME}`,
      FIND_LIVE,
      SESSION_TOUCH,
      `limiter:${AUDIT_POLICY_NAME}`,
    ]);
  });

  it("stops an operator after the session is read and before the mark, so a refused caller is never marked seen", async () => {
    const { session } = await signedInAs({ role: "operator" });
    const timeline = watchTheTimeline();

    await route.GET(
      auditRequest({ cookie: session.cookie, search: "?page=0" }),
    );

    expect(timeline).toEqual([`limiter:${READ_POLICY_NAME}`, FIND_LIVE]);
  });

  it("stops a cross-site request before any call at all, the network's read included", async () => {
    const { session } = await signedInAdministrator();
    const timeline = watchTheTimeline();

    await route.GET(
      auditRequest({ cookie: session.cookie, secFetchSite: "cross-site" }),
    );

    expect(timeline).toEqual([]);
  });

  it("lets the network's read limit refuse before the session is read, however the caller stands", async () => {
    const operator = await signedInAs({ role: "operator" });
    limiterLedger.refusing.set(READ_POLICY_NAME, 1);
    const timeline = watchTheTimeline();

    const answer = await route.GET(
      auditRequest({ cookie: operator.session.cookie }),
    );

    expect(answer.status).toBe(429);
    expect(timeline).toEqual([`limiter:${READ_POLICY_NAME}`]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (4) the window at the route

describe("the day's window holds the rows of the day and no others, on every day the clocks change", () => {
  const CLOCK_CHANGE_DAYS = [
    "2026-03-29",
    "2026-10-25",
    "2027-03-28",
    "2027-10-31",
    "2028-03-26",
    "2028-10-29",
  ];
  let cookie = "";

  beforeEach(async () => {
    cookie = (await signedInAdministrator()).session.cookie;
  });

  async function instantsOf(search: string): Promise<string[]> {
    const answer = await route.GET(auditRequest({ cookie, search }));
    expect(answer.status).toBe(200);
    const body = await pageOf(answer);
    expect(body.total).toBe(body.events.length);
    return body.events.map(({ occurredAt }) => occurredAt).sort();
  }

  function plantInstants(instants: readonly Date[]): void {
    const actorAccountId = aDesignId();
    for (const occurredAt of instants) {
      plantEvent(auditWorld, { actorAccountId, occurredAt });
    }
  }

  it.each(CLOCK_CHANGE_DAYS)(
    "holds, for %s, the last millisecond of the day and its first, and not the millisecond before or after",
    async (text) => {
      const day = civilDayFromText(text);
      const midnight = localMidnightOf(day).getTime();
      const nextMidnight = localMidnightOf(nextCivilDay(day)).getTime();
      plantInstants(
        [
          midnight - 1,
          midnight,
          midnight + 1,
          (midnight + nextMidnight) / 2,
          nextMidnight - 1,
          nextMidnight,
          nextMidnight + 1,
        ].map((ms) => new Date(ms)),
      );

      const inTheDay = await instantsOf(`?from=${text}&to=${text}`);

      expect(inTheDay).toEqual(
        [
          midnight,
          midnight + 1,
          (midnight + nextMidnight) / 2,
          nextMidnight - 1,
        ].map((ms) => new Date(ms).toISOString()),
      );
    },
  );

  it.each(CLOCK_CHANGE_DAYS)(
    "takes a window from the day before %s to the day after it to the midnight after that, whatever the length of the days between",
    async (text) => {
      const day = civilDayFromText(text);
      const previous = previousCivilDay(day);
      const following = nextCivilDay(day);
      const lastMidnight = localMidnightOf(nextCivilDay(following)).getTime();
      const firstMidnight = localMidnightOf(previous).getTime();
      plantInstants(
        [firstMidnight - 1, firstMidnight, lastMidnight - 1, lastMidnight].map(
          (ms) => new Date(ms),
        ),
      );

      const inTheWindow = await instantsOf(
        `?from=${dayText(previous)}&to=${dayText(following)}`,
      );

      expect(inTheWindow).toEqual(
        [firstMidnight, lastMidnight - 1].map((ms) =>
          new Date(ms).toISOString(),
        ),
      );
    },
  );

  it("leaves a window with only `to` open at the start of time and shut at the midnight after that day, and one with only `from` open at the end", async () => {
    const midnight = localMidnightOf(civilDayFromText("2027-10-31")).getTime();
    const nextMidnight = localMidnightOf(
      civilDayFromText("2027-11-01"),
    ).getTime();
    plantInstants(
      [midnight - 1, midnight, nextMidnight - 1, nextMidnight].map(
        (ms) => new Date(ms),
      ),
    );

    const onlyTo = await instantsOf("?to=2027-10-31");
    const onlyFrom = await instantsOf("?from=2027-10-31");

    expect(onlyTo).toEqual(
      [midnight - 1, midnight, nextMidnight - 1].map((ms) =>
        new Date(ms).toISOString(),
      ),
    );
    expect(onlyFrom).toEqual(
      [midnight, nextMidnight - 1, nextMidnight].map((ms) =>
        new Date(ms).toISOString(),
      ),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (5) results

describe("ties, seams and rows the build does not read", () => {
  let cookie = "";
  let actorId = "";

  beforeEach(async () => {
    const administrator = await signedInAdministrator();
    cookie = administrator.session.cookie;
    actorId = administrator.account.id;
  });

  async function pageAt(number: number, search = ""): Promise<PageWire> {
    const joined = `${search}${search === "" ? "?" : "&"}page=${String(number)}`;
    const answer = await route.GET(auditRequest({ cookie, search: joined }));
    expect(answer.status).toBe(200);
    return pageOf(answer);
  }

  it("orders rows of one instant by id, descending, across the page seam, with none repeated and none lost", async () => {
    const sameInstant = new Date("2026-10-19T09:00:00.000Z");
    const ids = Array.from({ length: 60 }, () => aDesignId());
    for (const id of ids) {
      plantEvent(auditWorld, {
        actorAccountId: actorId,
        occurredAt: sameInstant,
        id,
      });
    }

    const pages = [await pageAt(1), await pageAt(2), await pageAt(3)];

    const served = pages.flatMap(({ events }) => events.map(({ id }) => id));
    expect(pages.map(({ events }) => events.length)).toEqual([25, 25, 10]);
    expect(pages.map(({ total }) => total)).toEqual([60, 60, 60]);
    expect(served).toEqual(
      [...ids].sort((left, right) => (left < right ? 1 : -1)),
    );
  });

  it("counts rows the build does not read in the total and shows them where they fall in the order, across the seam", async () => {
    for (let minute = 0; minute < 24; minute += 1) {
      plantEvent(auditWorld, {
        actorAccountId: actorId,
        occurredAt: new Date(Date.UTC(2026, 9, 19, 12, 30 - minute)),
      });
    }
    for (const [index, action] of [
      "future-a",
      "future-b",
      "future-c",
    ].entries()) {
      plantEvent(auditWorld, {
        actorAccountId: actorId,
        action,
        detail: { secret: "SECRET-DETAIL" },
        occurredAt: new Date(Date.UTC(2026, 9, 18, 12, index)),
      });
    }

    const first = await pageAt(1);
    const second = await pageAt(2);
    const text = JSON.stringify([first, second]);

    expect([first.total, second.total]).toEqual([27, 27]);
    expect(first.events).toHaveLength(25);
    expect(first.events.slice(-1).map(({ entry }) => entry)).toEqual([
      { kind: "unrecognised", action: "future-c" },
    ]);
    expect(second.events.map(({ entry }) => entry)).toEqual([
      { kind: "unrecognised", action: "future-b" },
      { kind: "unrecognised", action: "future-a" },
    ]);
    expect(text).not.toContain("SECRET");
  });

  it.each<[string, unknown, string]>([
    ["kitchen-opened", {}, "an empty object for an action without a detail"],
    ["kitchen-opened", [], "an array for an action without a detail"],
    ["note-added", { note: "x" }, "a member for an action without a detail"],
    ["kitchen-unhidden", 0, "a number for an action without a detail"],
    ["status-changed", null, "SQL NULL for an action that has a detail"],
    ["status-changed", {}, "an empty object for an action that has a detail"],
    ["status-changed", [], "an array for an action that has a detail"],
    ["status-changed", { from: "new", to: "new", extra: 1 }, "an extra member"],
    ["status-changed", { from: "NEW", to: "closed" }, "a status in capitals"],
    ["status-changed", { from: "new", to: "closed " }, "a status with a space"],
    ["status-changed", { from: 1, to: 2 }, "numbers for statuses"],
    ["kitchens-listed", null, "SQL NULL for an action that has a detail"],
    ["kitchens-listed", {}, "an empty object for an action that has a detail"],
    [
      "kitchens-listed",
      { segment: "all", status: null, page: 0, rowCount: 0, hasSearch: false },
      "a page 0",
    ],
    [
      "kitchens-listed",
      { segment: "all", status: null, page: 1, rowCount: 26, hasSearch: false },
      "more rows than a page holds",
    ],
    [
      "kitchens-listed",
      { segment: "all", status: null, page: 1, rowCount: 1, hasSearch: "yes" },
      "a search flag that is no boolean",
    ],
    [
      "kitchens-listed",
      {
        segment: "everything",
        status: null,
        page: 1,
        rowCount: 1,
        hasSearch: true,
      },
      "a segment the build lacks",
    ],
  ])(
    "reads %s with %j (%s) as unrecognised, with its action and no detail",
    async (action, detail) => {
      plantEvent(auditWorld, {
        actorAccountId: actorId,
        action,
        detail: detail as never,
      });

      const [event] = (await pageAt(1)).events;

      expect(event?.entry).toEqual({ kind: "unrecognised", action });
      expect(Object.keys(event?.entry ?? {}).sort()).toEqual([
        "action",
        "kind",
      ]);
    },
  );

  it("shows an unrecognised row's subject and kitchen as it would a recognised one's, and nothing of its detail", async () => {
    const subjectId = aDesignId();
    const designId = aDesignId();
    auditWorld.nameAccount(subjectId, {
      email: "client@example.test",
      name: "Client",
    });
    auditWorld.nameDesign(designId, {
      name: "Bucatarie",
      ownerAccountId: subjectId,
      isDeletedByClient: false,
    });
    plantEvent(auditWorld, {
      actorAccountId: actorId,
      action: "future-kind",
      designId,
      subjectAccountId: subjectId,
      detail: { phone: "+37369123456" },
    });

    const answer = await route.GET(auditRequest({ cookie }));
    const [event] = (await pageOf(answer)).events;

    expect(event).toMatchObject({
      subject: { email: "client@example.test" },
      kitchen: {
        id: designId,
        name: "Bucatarie",
        client: { email: "client@example.test" },
      },
    });
    expect(await answer.clone().text()).not.toContain("37369123456");
  });

  it("reads every recognised detail exactly: each status pair, and each member of a list view", async () => {
    const statuses = ["new", "contacted", "offer-sent", "closed"];
    for (const from of statuses) {
      for (const to of statuses) {
        plantEvent(auditWorld, {
          actorAccountId: actorId,
          action: "status-changed",
          detail: { from, to },
        });
      }
    }

    const details = [
      ...(await pageAt(1)).events,
      ...(await pageAt(2)).events,
    ].map(({ entry }) => entry.detail);

    const expected = statuses.flatMap((from) =>
      statuses.map((to) => ({ from, to })),
    );
    expect(details).toHaveLength(16);
    for (const pair of expected) expect(details).toContainEqual(pair);
  });

  it("answers a page past the last with an empty list and the real total, at page 2 and at the last page the port counts", async () => {
    for (let n = 0; n < PAGE_SIZE; n += 1)
      plantEvent(auditWorld, { actorAccountId: actorId });

    const second = await pageAt(2);
    const last = await pageAt(100_000);

    expect([second.total, second.page, second.events]).toEqual([25, 2, []]);
    expect([last.total, last.page, last.pageSize, last.events]).toEqual([
      25,
      100_000,
      25,
      [],
    ]);
  });

  it("reads a subject that no longer resolves as a null address, a kitchen with no name but an owner with the owner, and keeps the kitchen's id", async () => {
    const goneSubject = aDesignId();
    const owner = aDesignId();
    const designId = aDesignId();
    auditWorld.nameAccount(owner, { email: "owner@example.test", name: null });
    auditWorld.nameDesign(designId, {
      name: null,
      ownerAccountId: owner,
      isDeletedByClient: false,
    });
    plantEvent(auditWorld, {
      actorAccountId: actorId,
      designId,
      subjectAccountId: goneSubject,
    });

    const [event] = (await pageAt(1)).events;

    expect(event?.subject).toEqual({ email: null });
    expect(event?.kitchen).toEqual({
      id: designId,
      name: null,
      client: { email: "owner@example.test" },
    });
  });

  it("reads an actor with an address and no name as an address and a null name, the id kept", async () => {
    auditWorld.nameAccount(actorId, {
      email: "administrator@example.test",
      name: null,
    });
    plantEvent(auditWorld, { actorAccountId: actorId });

    const [event] = (await pageAt(1)).events;

    expect(event?.actor).toEqual({
      id: actorId,
      email: "administrator@example.test",
      name: null,
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (6) the whitelist at every depth

describe("a store that answers with more than the port declares leaks none of it", () => {
  const LEAK = "LEAK-5531";
  let cookie = "";
  let actorId = "";

  beforeEach(async () => {
    const administrator = await signedInAdministrator();
    cookie = administrator.session.cookie;
    actorId = administrator.account.id;
  });

  async function answerFor(
    decorate: (page: StaffAuditPage) => StaffAuditPage,
  ): Promise<Response> {
    auditWorld.decoratePage = decorate;
    return route.GET(auditRequest({ cookie }));
  }

  it("keeps extra members of the page itself, of its rows, of their accounts and of their kitchens out of the answer", async () => {
    plantEvent(auditWorld, { actorAccountId: actorId });
    const answer = await answerFor((page) => ({
      ...page,
      nextCursor: LEAK,
      sql: LEAK,
      events: page.events.map((row) => ({
        ...row,
        tokenHash: LEAK,
        toJSON: () => ({ leaked: LEAK }),
        actor: { ...row.actor, passwordHash: LEAK },
      })),
    }));

    const body = await pageOf(answer);

    expect(answer.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "events",
      "page",
      "pageSize",
      "total",
    ]);
    expect(Object.keys(body.events[0] ?? {}).sort()).toEqual([
      "actor",
      "entry",
      "id",
      "kitchen",
      "occurredAt",
      "subject",
    ]);
    expect(JSON.stringify(body)).not.toContain(LEAK);
  });

  it("keeps a stored detail off an unrecognised row even when the store hands it over, and keeps extra members out of a recognised detail", async () => {
    plantEvent(auditWorld, {
      actorAccountId: actorId,
      action: "status-changed",
      detail: { from: "new", to: "closed" },
    });
    plantEvent(auditWorld, {
      actorAccountId: actorId,
      action: "kitchens-listed",
      detail: {
        segment: "all",
        status: null,
        page: 1,
        rowCount: 3,
        hasSearch: false,
      },
    });
    plantEvent(auditWorld, { actorAccountId: actorId, action: "future-kind" });
    const answer = await answerFor((page) => ({
      ...page,
      events: page.events.map((row) => {
        if (row.reading.kind === "unrecognised") {
          return {
            ...row,
            reading: {
              ...row.reading,
              detail: { secret: LEAK },
              entry: { action: "x", detail: LEAK },
            },
          };
        }
        const { entry } = row.reading;
        return {
          ...row,
          reading: {
            kind: "recognised" as const,
            entry: {
              ...entry,
              detail: { ...(entry.detail ?? {}), secret: LEAK },
              secret: LEAK,
            },
          },
        } as unknown as typeof row;
      }),
    }));

    const body = await pageOf(answer);

    expect(JSON.stringify(body)).not.toContain(LEAK);
    const byAction = Object.fromEntries(
      body.events.map(({ entry }) => [entry.action as string, entry]),
    );
    expect(byAction["future-kind"]).toEqual({
      kind: "unrecognised",
      action: "future-kind",
    });
    expect(
      Object.keys(byAction["status-changed"]?.detail as object).sort(),
    ).toEqual(["from", "to"]);
    expect(
      Object.keys(byAction["kitchens-listed"]?.detail as object).sort(),
    ).toEqual(["hasSearch", "page", "rowCount", "segment", "status"]);
  });

  it("answers a recognised row that carries a detail its action does not take with no detail", async () => {
    plantEvent(auditWorld, { actorAccountId: actorId });
    const answer = await answerFor((page) => ({
      ...page,
      events: page.events.map((row) => ({
        ...row,
        reading: {
          kind: "recognised" as const,
          entry: {
            action: "kitchen-opened" as const,
            detail: { secret: LEAK } as never,
          },
        },
      })),
    }));

    const [event] = (await pageOf(answer)).events;

    expect(event?.entry).toEqual({
      kind: "recognised",
      action: "kitchen-opened",
      detail: null,
    });
    expect(JSON.stringify(await jsonOf(answer))).not.toContain(LEAK);
  });

  it("never answers an event without its `entry`: a row read as recognised under a code the build does not list is a 503 or an unrecognised row, not a row with the member missing", async () => {
    plantEvent(auditWorld, { actorAccountId: actorId });
    const answer = await answerFor((page) => ({
      ...page,
      events: page.events.map((row) => ({
        ...row,
        reading: {
          kind: "recognised" as const,
          entry: { action: "preset-hidden", detail: null } as never,
        },
      })),
    }));

    if (answer.status === 503) return;
    const [event] = (await pageOf(answer)).events;
    expect(Object.keys(event ?? {})).toContain("entry");
    expect(event?.entry).toMatchObject({ action: "preset-hidden" });
  });

  it("answers no account id but the actor's: every id-shaped string in the answer is an event, a kitchen or the actor", async () => {
    const subjectId = aDesignId();
    const ownerId = aDesignId();
    const designId = aDesignId();
    auditWorld.nameAccount(subjectId, {
      email: "subject@example.test",
      name: "Subject",
    });
    auditWorld.nameAccount(ownerId, {
      email: "owner@example.test",
      name: "Owner",
    });
    auditWorld.nameDesign(designId, {
      name: "K",
      ownerAccountId: ownerId,
      isDeletedByClient: false,
    });
    const planted = plantEvent(auditWorld, {
      actorAccountId: actorId,
      designId,
      subjectAccountId: subjectId,
    });
    const answer = await answerFor((page) => ({
      ...page,
      events: page.events.map((row) => ({
        ...row,
        subject:
          row.subject === null ? null : { ...row.subject, id: subjectId },
        design:
          row.design === null
            ? null
            : {
                ...row.design,
                client:
                  row.design.client === null
                    ? null
                    : { ...row.design.client, id: ownerId },
              },
      })),
    }));

    const body = await pageOf(answer);

    const idShaped: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "string" && ACCOUNT_ID_SHAPE.test(value))
        idShaped.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === "object" && value !== null)
        Object.values(value).forEach(collect);
    };
    collect(body);
    expect(idShaped.sort()).toEqual([actorId, designId, planted.id].sort());
  });

  it("answers a stored address, name or kitchen name as text only, so one made of markup or JSON stays a string", async () => {
    auditWorld.nameAccount(actorId, {
      email: "a@example.test",
      name: "</script><img src=x onerror=alert(1)>",
    });
    const designId = aDesignId();
    auditWorld.nameDesign(designId, {
      name: '{"__proto__":{"admin":true}}',
      ownerAccountId: null,
      isDeletedByClient: false,
    });
    plantEvent(auditWorld, { actorAccountId: actorId, designId });

    const answer = await route.GET(auditRequest({ cookie }));
    const [event] = (await pageOf(answer)).events;

    expect(event?.actor.name).toBe("</script><img src=x onerror=alert(1)>");
    expect(event?.kitchen?.name).toBe('{"__proto__":{"admin":true}}');
    expect(answer.headers.get("content-type")).toMatch(/^application\/json/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (11) no oracle

describe("the search cannot tell whether an account exists", () => {
  it("answers an actor no account has, a client's id and an administrator with no rows with the same bytes", async () => {
    const { session, account } = await signedInAdministrator();
    const client = await signedInAs({ role: "client" });
    plantEvent(auditWorld, { actorAccountId: account.id });
    const asks = [aDesignId(), client.account.id, "ABCDEFGHIJKLMNOPQRSTU"];

    const wires: string[] = [];
    for (const actor of asks) {
      const answer = await route.GET(
        auditRequest({ cookie: session.cookie, search: `?actor=${actor}` }),
      );
      expect(answer.status).toBe(200);
      wires.push(await wireOf(answer));
    }

    expect(new Set(wires).size).toBe(1);
    expect((JSON.parse(wires.at(0) ?? "[]") as unknown[])[2]).toBe(
      JSON.stringify({ total: 0, page: 1, pageSize: 25, events: [] }),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (8)(9)(10) what is logged, what every answer carries, what fails

describe("what the log holds for each way a request can end", () => {
  const PRIVATE = "private, no-store";

  async function endOf(name: string): Promise<Response> {
    const administrator = await signedInAdministrator("log-admin@example.test");
    const operator = await signedInAs(
      { role: "operator" },
      "log-operator@example.test",
    );
    switch (name) {
      case "served":
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      case "anonymous":
        return route.GET(auditRequest());
      case "forbidden":
        return route.GET(auditRequest({ cookie: operator.session.cookie }));
      case "wrong query":
        return route.GET(
          auditRequest({
            cookie: administrator.session.cookie,
            search: "?from=nope",
          }),
        );
      case "page limit":
        limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      case "read limit":
        limiterLedger.refusing.set(READ_POLICY_NAME, 1);
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      case "page limit down":
        limiterLedger.unavailable.add(AUDIT_POLICY_NAME);
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      case "session store down":
        world.failOn(FIND_LIVE);
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      case "audit store down":
        auditWorld.failPage = true;
        return route.GET(
          auditRequest({ cookie: administrator.session.cookie }),
        );
      default:
        throw new Error(name);
    }
  }

  const ENDS: readonly [string, number, readonly Record<string, string>[]][] = [
    ["served", 200, [{ event: "staff-audit", outcome: "succeeded" }]],
    ["anonymous", 401, [{ event: "staff-audit", outcome: "refused" }]],
    ["forbidden", 403, [{ event: "staff-audit", outcome: "refused" }]],
    ["wrong query", 400, [{ event: "staff-audit", outcome: "refused" }]],
    [
      "page limit",
      429,
      [{ event: "staff-audit", outcome: "limited", policy: AUDIT_POLICY_NAME }],
    ],
    // The network's read limit is the shared one and logs nothing of its own (`judgeReadRequest`): pinned so a line
    // that named the account here would be seen.
    ["read limit", 429, []],
    [
      "page limit down",
      503,
      [{ event: "staff-audit", outcome: "unavailable" }],
    ],
    [
      "session store down",
      503,
      [{ event: "staff-audit", outcome: "unavailable" }],
    ],
    [
      "audit store down",
      503,
      [{ event: "staff-audit", outcome: "unavailable" }],
    ],
  ];

  it.each(ENDS)(
    "ends '%s' as %i with the log lines %j, every answer private and no-store with no cookie set, and no audit row written",
    async (name, status, lines) => {
      const console_ = captureConsole();

      const answer = await endOf(name);

      expect(answer.status).toBe(status);
      expect(console_.accountLines()).toEqual(lines);
      expect(answer.headers.get("cache-control")).toBe(PRIVATE);
      expect(answer.headers.get("set-cookie")).toBeNull();
      expect(auditWorld.store.heldEvents()).toEqual([]);
      expect(auditWorld.calls).not.toContain("audit.record");
      const everything = console_.everything();
      for (const secret of [
        "log-admin@example.test",
        "log-operator@example.test",
        DRIVER_FAILURE_MARKER,
      ]) {
        expect(everything).not.toContain(secret);
      }
    },
  );

  it("logs no account id, address, session value or typed filter on any path", async () => {
    const console_ = captureConsole();
    const { session, account } =
      await signedInAdministrator("typed@example.test");
    const typed = aDesignId();

    await route.GET(
      auditRequest({
        cookie: session.cookie,
        search: `?actor=${typed}&action=note-added&from=2026-10-01`,
      }),
    );
    await route.GET(
      auditRequest({
        cookie: session.cookie,
        search: `?actor=${typed}&action=nope`,
      }),
    );

    const everything = console_.everything();
    for (const secret of [
      account.id,
      session.value,
      typed,
      "typed@example.test",
      "2026-10-01",
      "note-added",
    ]) {
      expect(everything).not.toContain(secret);
    }
    expect(everything.match(/\[account\]/g)).toHaveLength(2);
  });
});

describe("a store that fails is 503 with no cause, whatever it says and however it fails", () => {
  const FAILURES: readonly [string, () => unknown][] = [
    [
      "the grant is missing (42501)",
      () =>
        new StaffAuditStoreError("read the staff audit log", "unavailable", {
          cause: Object.assign(
            new Error(
              `permission denied for table staff_audit_events ${DRIVER_FAILURE_MARKER}`,
            ),
            { code: "42501" },
          ),
        }),
    ],
    [
      "the table is missing (42P01)",
      () => new StaffAuditStoreError("read the staff audit log", "unavailable"),
    ],
    [
      "the database answered something else",
      () =>
        new StaffAuditStoreError(
          "read the staff audit log",
          "unexpected-answer",
        ),
    ],
    [
      "the database failed",
      () =>
        new StaffAuditStoreError("read the staff audit log", "database", {
          cause: new Error(DRIVER_FAILURE_MARKER),
        }),
    ],
    [
      "the request was refused by the port",
      () =>
        new StaffAuditStoreError("read the staff audit log", "invalid-record"),
    ],
    ["a string is thrown", () => DRIVER_FAILURE_MARKER],
    ["undefined is thrown", () => undefined],
  ];

  it.each(FAILURES)(
    "answers 503 and only that when %s",
    async (_title, failure) => {
      const { session } = await signedInAdministrator();
      const console_ = captureConsole();
      auditWorld.port.page = () => Promise.reject(failure() as Error);

      const answer = await route.GET(auditRequest({ cookie: session.cookie }));

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(answer.headers.get("retry-after")).toBeNull();
      expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
      expect(console_.everything()).not.toContain("staff_audit_events");
      expect(console_.everything()).not.toContain("42501");
    },
  );

  it("answers 503 for a store that throws before it returns a promise, and for one that answers something that is no page", async () => {
    const { session } = await signedInAdministrator();
    const answers: Response[] = [];
    auditWorld.port.page = () => {
      throw new Error(DRIVER_FAILURE_MARKER);
    };
    answers.push(await route.GET(auditRequest({ cookie: session.cookie })));
    for (const nonsense of [
      null,
      undefined,
      "page",
      7,
      { total: 1 },
      { events: "x" },
    ]) {
      auditWorld.port.page = () => Promise.resolve(nonsense as never);
      answers.push(await route.GET(auditRequest({ cookie: session.cookie })));
    }

    expect(answers.map(({ status }) => status)).toEqual([
      503, 503, 503, 503, 503, 503, 503,
    ]);
    for (const answer of answers)
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
  });

  it("answers 503 and not 401 when the session store fails with any failure, and when the mark alone fails the page is served", async () => {
    const { session } = await signedInAdministrator();
    world.intercept(FIND_LIVE, () => {
      throw new Error(DRIVER_FAILURE_MARKER);
    });
    const throwing = await route.GET(auditRequest({ cookie: session.cookie }));
    world.intercept(FIND_LIVE, (real) => real());
    world.failOn(SESSION_TOUCH);
    const markFails = await route.GET(auditRequest({ cookie: session.cookie }));

    expect([throwing.status, markFails.status]).toEqual([503, 200]);
  });
});

describe("the methods and the cross-site guard", () => {
  it("has exactly GET and HEAD and the two route options in the module, and the route's folder holds nothing else", () => {
    expect(Object.keys(route).sort()).toEqual([
      "GET",
      "HEAD",
      "dynamic",
      "runtime",
    ]);
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    const folder = join(
      import.meta.dirname,
      "../../../../src/app/api/staff/audit",
    );
    expect(readdirSync(folder, { recursive: true }).map(String)).toEqual([
      "route.ts",
    ]);
    const routeExports = route as unknown as Record<string, unknown>;
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(routeExports[method]).toBeUndefined();
    }
  });

  it("answers HEAD 405 whoever asks and in whatever state the buckets are, reading, counting and writing nothing", async () => {
    const { session } = await signedInAdministrator();
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    limiterLedger.refusing.set(READ_POLICY_NAME, 1);
    world.calls.length = 0;
    limiterLedger.counted.length = 0;
    const head: (request: unknown) => Response = route.HEAD as never;

    const answers = [
      head(auditRequest({ method: "HEAD", cookie: session.cookie })),
      head(
        auditRequest({
          method: "HEAD",
          cookie: session.cookie,
          secFetchSite: "cross-site",
        }),
      ),
      head(auditRequest({ method: "HEAD", search: "?page=0" })),
    ];

    for (const answer of answers) {
      expect(answer.status).toBe(405);
      expect(answer.headers.get("allow")).toBe("GET");
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(await answer.text()).toBe("");
    }
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(auditWorld.calls).toEqual([]);
    expect(auditWorld.store.heldEvents()).toEqual([]);
  });

  it.each([
    [
      "a foreign Origin and no Sec-Fetch-Site",
      { secFetchSite: null, headers: { origin: "https://evil.example" } },
    ],
    [
      "the Origin text null and no Sec-Fetch-Site",
      { secFetchSite: null, headers: { origin: "null" } },
    ],
    [
      "a same-site sibling Origin and no Sec-Fetch-Site",
      { secFetchSite: null, headers: { origin: "https://shop.lemnaria.test" } },
    ],
    ["Sec-Fetch-Site same-site", { secFetchSite: "same-site" }],
    ["Sec-Fetch-Site none, as a typed address", { secFetchSite: "none" }],
    ["Sec-Fetch-Site cross-site", { secFetchSite: "cross-site" }],
    [
      "Sec-Fetch-Site in capitals, which no browser sends",
      { secFetchSite: "Same-Origin" },
    ],
    ["Sec-Fetch-Site empty", { secFetchSite: "" }],
  ] as const)(
    "refuses %s before anything is counted, read or asked, with the one cross-site answer",
    async (_title, init) => {
      const { session } = await signedInAdministrator();
      world.calls.length = 0;
      limiterLedger.counted.length = 0;

      const answer = await route.GET(
        auditRequest({ cookie: session.cookie, ...init } as never),
      );

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(world.calls).toEqual([]);
      expect(limiterLedger.counted).toEqual([]);
      expect(auditWorld.calls).toEqual([]);
    },
  );

  it.each([
    [
      "the site's own Origin and no Sec-Fetch-Site",
      { secFetchSite: null, headers: { origin: "https://lemnaria.test" } },
    ],
    ["neither header", { secFetchSite: null }],
    [
      "Sec-Fetch-Site same-origin over a foreign Origin",
      {
        secFetchSite: "same-origin",
        headers: { origin: "https://evil.example" },
      },
    ],
  ] as const)("serves a request with %s", async (_title, init) => {
    const { session } = await signedInAdministrator();

    const answer = await route.GET(
      auditRequest({ cookie: session.cookie, ...init } as never),
    );

    expect(answer.status).toBe(200);
  });
});
