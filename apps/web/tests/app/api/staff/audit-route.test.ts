import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_AUDIT_PAGE_PER_ACCOUNT_HOUR_FIGURE,
  STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  aDesignId,
  captureConsole,
  cookieOfValue,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
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
 * `GET /api/staff/audit` (E-L3-6, ADR 0173). The route is called with `Request` objects over the persistence package's
 * audit store fake; the session lookup, the capability check, both limiters' decisions and the response builders are the
 * real ones. Only an administrator with a confirmed address holds `audit.read`. Reading the log writes no row.
 */

const AUDIT_POLICY_NAME = "staff-audit-page-by-account-per-60-utc-minutes";
const SESSION_TOUCH = "sessions.touch";
const PAGE_SIZE = 25;
const A_VALUE_NO_ONE_ELSE_TYPES = "Zorila-Quasar-9917";

let world: AccountWorld;
let auditWorld: AuditPageWorld;

beforeEach(() => {
  world = freshAccountWorld();
  auditWorld = freshAuditPageWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function auditRequest(init: Parameters<typeof accountRequest>[1] = {}) {
  return accountRequest("/api/staff/audit", {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

async function signedInAdministrator(email = "administrator@example.test") {
  return signedInAs({ role: "administrator" }, email);
}

function touches(): number {
  return world.calls.filter((call) => call === SESSION_TOUCH).length;
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

describe("who may read the log (K-1)", () => {
  type CallerName =
    | "anonymous"
    | "a malformed cookie"
    | "a client with a confirmed address"
    | "a client with an unconfirmed address"
    | "an operator"
    | "an operator with an unconfirmed address"
    | "an administrator"
    | "an administrator with an unconfirmed address"
    | "an administrator idle past twelve hours"
    | "an administrator whose session was revoked";

  const EXPECTED_STATUS: readonly [CallerName, 200 | 401 | 403][] = [
    ["anonymous", 401],
    ["a malformed cookie", 401],
    ["a client with a confirmed address", 403],
    ["a client with an unconfirmed address", 403],
    ["an operator", 403],
    ["an operator with an unconfirmed address", 403],
    ["an administrator", 200],
    ["an administrator with an unconfirmed address", 403],
    ["an administrator idle past twelve hours", 401],
    ["an administrator whose session was revoked", 401],
  ];

  const CALLERS: Readonly<Partial<Record<CallerName, StaffCaller>>> = {
    "a client with a confirmed address": { role: "client" },
    "a client with an unconfirmed address": {
      role: "client",
      isVerified: false,
    },
    "an operator": { role: "operator" },
    "an operator with an unconfirmed address": {
      role: "operator",
      isVerified: false,
    },
    "an administrator": { role: "administrator" },
    "an administrator with an unconfirmed address": {
      role: "administrator",
      isVerified: false,
    },
    "an administrator idle past twelve hours": { role: "administrator" },
    "an administrator whose session was revoked": { role: "administrator" },
  };

  async function cookieOf(name: CallerName): Promise<string | undefined> {
    if (name === "anonymous") return undefined;
    if (name === "a malformed cookie") return cookieOfValue("short");
    const caller = CALLERS[name];
    if (caller === undefined) throw new Error(`no caller for ${name}`);
    const slug = name.replaceAll(/[^a-z]+/g, "-");
    const { account, session } = await signedInAs(
      caller,
      `${slug}@example.test`,
    );
    if (name === "an administrator idle past twelve hours") {
      world.advance(12 * 60 * 60 * 1000 + 1000);
    }
    if (name === "an administrator whose session was revoked") {
      await world.sessions.revokeAllForAccount(account.id);
    }
    return session.cookie;
  }

  it.each(EXPECTED_STATUS)("answers %s with %i", async (name, status) => {
    const cookie = await cookieOf(name);

    const answer = await route.GET(
      auditRequest(cookie === undefined ? {} : { cookie }),
    );

    expect(answer.status).toBe(status);
    if (status === 200) return;
    expect(await jsonOf(answer)).toEqual({
      status: status === 401 ? "unauthenticated" : "forbidden",
    });
    expect(auditWorld.calls).toEqual([]);
  });

  it("lets no role, capability or account in the request change the answer", async () => {
    const operator = await signedInAs({ role: "operator" });
    const administrator = await signedInAdministrator();
    const claims = {
      search: "?role=administrator&capabilities=audit.read&accountId=x",
      headers: {
        "x-role": "administrator",
        "x-capabilities": "audit.read",
        authorization: `Bearer ${administrator.account.id}`,
      },
    };

    const asOperator = await route.GET(
      auditRequest({ cookie: operator.session.cookie, ...claims }),
    );
    const asAdministrator = await route.GET(
      auditRequest({
        cookie: administrator.session.cookie,
        search: "?role=client",
        headers: { "x-role": "client" },
      }),
    );

    expect([asOperator.status, asAdministrator.status]).toEqual([403, 200]);
    expect(auditWorld.calls).toEqual(["audit.page"]);
  });
});

describe("the order of the checks", () => {
  it("counts the network's read limit before it reads the session, so a refusal is the same for every caller", async () => {
    const { session } = await signedInAdministrator();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);
    world.calls.length = 0;

    const signedIn = await route.GET(auditRequest({ cookie: session.cookie }));
    const anonymous = await route.GET(auditRequest());

    for (const answer of [signedIn, anonymous]) {
      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, READ_POLICY_NAME);
    }
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(world.calls).toEqual([]);
    expect(auditWorld.calls).toEqual([]);
  });

  it("answers 401 to an anonymous caller and 403 to an operator with a bad query: the capability is checked before the query", async () => {
    const operator = await signedInAs({ role: "operator" });

    const anonymous = await route.GET(auditRequest({ search: "?page=0" }));
    const refusedOperator = await route.GET(
      auditRequest({ cookie: operator.session.cookie, search: "?page=0" }),
    );

    expect([anonymous.status, refusedOperator.status]).toEqual([401, 403]);
    expect(limiterLedger.counted).not.toContain(AUDIT_POLICY_NAME);
    expect(auditWorld.calls).toEqual([]);
  });

  it("counts the page after the capability and the query and before the store", async () => {
    const { session } = await signedInAdministrator();

    await route.GET(auditRequest({ cookie: session.cookie }));

    expect(limiterLedger.counted).toEqual([
      READ_POLICY_NAME,
      AUDIT_POLICY_NAME,
    ]);
    expect(auditWorld.calls).toEqual(["audit.page"]);
  });
});

describe("the query", () => {
  const BAD_QUERIES: readonly [string, string, string, string][] = [
    ["page 0", "?page=0", "page", "NOT_A_PAGE_NUMBER"],
    ["a page with a leading zero", "?page=01", "page", "NOT_A_PAGE_NUMBER"],
    [
      "a page past the last the store counts",
      "?page=100001",
      "page",
      "NOT_A_PAGE_NUMBER",
    ],
    ["an unknown action", "?action=future-action", "action", "UNKNOWN_VALUE"],
    [
      "an action in capitals",
      "?action=KITCHEN-OPENED",
      "action",
      "UNKNOWN_VALUE",
    ],
    [
      "an actor that is no account id's shape",
      "?actor=operator%40example.test",
      "actor",
      "NOT_AN_ACCOUNT_ID",
    ],
    ["a day written for the screen", "?from=19.10.2026", "from", "NOT_A_DATE"],
    ["a day the calendar lacks", "?to=2026-02-30", "to", "NOT_A_DATE"],
    [
      "a day before the log began",
      "?from=1999-12-31",
      "from",
      "DATE_OUT_OF_RANGE",
    ],
    [
      "a day past the last the store reads",
      "?to=9999-12-31",
      "to",
      "DATE_OUT_OF_RANGE",
    ],
    [
      "a `to` before its `from`",
      "?from=2026-10-20&to=2026-10-19",
      "range",
      "RANGE_INVERTED",
    ],
  ];

  it.each(BAD_QUERIES)(
    "answers 400 with the member and a code for %s, before any page is counted or read",
    async (_title, search, field, code) => {
      const { session } = await signedInAdministrator();

      const answer = await route.GET(
        auditRequest({ cookie: session.cookie, search }),
      );

      expect(answer.status).toBe(400);
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field, code }],
      });
      expect(limiterLedger.counted).not.toContain(AUDIT_POLICY_NAME);
      expect(auditWorld.calls).toEqual([]);
    },
  );

  it("never repeats a refused value in the answer or in a log line", async () => {
    const { session } = await signedInAdministrator();
    const console_ = captureConsole();

    const refused = await route.GET(
      auditRequest({
        cookie: session.cookie,
        search: `?actor=${A_VALUE_NO_ONE_ELSE_TYPES}&action=${A_VALUE_NO_ONE_ELSE_TYPES}`,
      }),
    );

    expect(refused.status).toBe(400);
    expect(await refused.clone().text()).not.toContain(
      A_VALUE_NO_ONE_ELSE_TYPES,
    );
    expect(console_.everything()).not.toContain(A_VALUE_NO_ONE_ELSE_TYPES);
    expect(console_.accountLines()).toEqual([
      { event: "staff-audit", outcome: "refused" },
    ]);
  });

  it("hands the store the actor, the action, the page and the two days as Chisinau days, and nothing else", async () => {
    const { session } = await signedInAdministrator();
    const actorId = aDesignId();

    const answer = await route.GET(
      auditRequest({
        cookie: session.cookie,
        search: `?actor=${actorId}&action=status-changed&from=2026-10-19&to=2026-10-19&page=2&pageSize=1&role=client`,
      }),
    );

    expect(answer.status).toBe(200);
    expect(auditWorld.pageRequests).toEqual([
      {
        actorAccountId: actorId,
        action: "status-changed",
        occurredFrom: new Date("2026-10-18T21:00:00.000Z"),
        occurredBefore: new Date("2026-10-19T21:00:00.000Z"),
        page: 2,
      },
    ]);
  });

  it("defaults to the first page with no filter", async () => {
    const { session } = await signedInAdministrator();

    await route.GET(auditRequest({ cookie: session.cookie }));

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
});

describe("the days are Chisinau days (K-15)", () => {
  let cookie = "";

  beforeEach(async () => {
    cookie = (await signedInAdministrator()).session.cookie;
  });

  async function daysOf(search: string): Promise<string[]> {
    const answer = await route.GET(auditRequest({ cookie, search }));
    expect(answer.status).toBe(200);
    return (await pageOf(answer)).events.map(({ occurredAt }) => occurredAt);
  }

  function plantAt(instants: readonly string[]): void {
    const actorAccountId = aDesignId();
    for (const instant of instants) {
      plantEvent(auditWorld, {
        actorAccountId,
        occurredAt: new Date(instant),
      });
    }
  }

  it("returns exactly the events of 1 October 2026 for a filter from that day to that day", async () => {
    plantAt([
      "2026-09-30T20:59:59.999Z",
      "2026-09-30T21:00:00.000Z",
      "2026-10-01T12:00:00.000Z",
      "2026-10-01T20:59:59.999Z",
      "2026-10-01T21:00:00.000Z",
    ]);

    expect(await daysOf("?from=2026-10-01&to=2026-10-01")).toEqual([
      "2026-10-01T20:59:59.999Z",
      "2026-10-01T12:00:00.000Z",
      "2026-09-30T21:00:00.000Z",
    ]);
  });

  it("ends the 23-hour day of 29 March 2026 at 21:00 UTC and not at 22:00", async () => {
    plantAt([
      "2026-03-28T21:59:59.999Z",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T20:59:59.999Z",
      "2026-03-29T21:00:00.000Z",
      "2026-03-29T21:30:00.000Z",
    ]);

    expect(await daysOf("?from=2026-03-29&to=2026-03-29")).toEqual([
      "2026-03-29T20:59:59.999Z",
      "2026-03-28T22:00:00.000Z",
    ]);
  });

  it("ends the 25-hour day of 25 October 2026 at 22:00 UTC and not at 21:00", async () => {
    plantAt([
      "2026-10-24T20:59:59.999Z",
      "2026-10-24T21:00:00.000Z",
      "2026-10-25T21:30:00.000Z",
      "2026-10-25T21:59:59.999Z",
      "2026-10-25T22:00:00.000Z",
    ]);

    expect(await daysOf("?from=2026-10-25&to=2026-10-25")).toEqual([
      "2026-10-25T21:59:59.999Z",
      "2026-10-25T21:30:00.000Z",
      "2026-10-24T21:00:00.000Z",
    ]);
  });

  it("includes the whole of the `to` day, and leaves the other end open when only one day is named", async () => {
    plantAt([
      "2026-10-01T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
      "2026-10-03T10:00:00.000Z",
    ]);

    expect(await daysOf("?to=2026-10-02")).toEqual([
      "2026-10-02T10:00:00.000Z",
      "2026-10-01T10:00:00.000Z",
    ]);
    expect(await daysOf("?from=2026-10-02")).toEqual([
      "2026-10-03T10:00:00.000Z",
      "2026-10-02T10:00:00.000Z",
    ]);
  });
});

describe("the page", () => {
  it("pages 25 to a page, newest first, with the total of every row the filters match", async () => {
    const { session, account } = await signedInAdministrator();
    for (let minute = 0; minute <= PAGE_SIZE; minute += 1) {
      plantEvent(auditWorld, {
        actorAccountId: account.id,
        occurredAt: new Date(Date.UTC(2026, 9, 19, 9, minute)),
      });
    }

    const first = await pageOf(
      await route.GET(auditRequest({ cookie: session.cookie })),
    );
    const second = await pageOf(
      await route.GET(
        auditRequest({ cookie: session.cookie, search: "?page=2" }),
      ),
    );
    const beyond = await pageOf(
      await route.GET(
        auditRequest({ cookie: session.cookie, search: "?page=3" }),
      ),
    );

    expect([first.total, first.page, first.pageSize]).toEqual([26, 1, 25]);
    expect(first.events).toHaveLength(PAGE_SIZE);
    expect(first.events[0]?.occurredAt).toBe("2026-10-19T09:25:00.000Z");
    expect(second.events.map(({ occurredAt }) => occurredAt)).toEqual([
      "2026-10-19T09:00:00.000Z",
    ]);
    expect([beyond.total, beyond.events]).toEqual([26, []]);
  });

  it("filters by actor and by action", async () => {
    const { session, account } = await signedInAdministrator();
    const someoneElse = aDesignId();
    plantEvent(auditWorld, { actorAccountId: account.id });
    plantEvent(auditWorld, { actorAccountId: someoneElse });
    plantEvent(auditWorld, {
      actorAccountId: account.id,
      action: "kitchens-listed",
      detail: {
        segment: "sent",
        status: null,
        page: 1,
        rowCount: 0,
        hasSearch: false,
      },
    });

    const byActor = await pageOf(
      await route.GET(
        auditRequest({
          cookie: session.cookie,
          search: `?actor=${someoneElse}`,
        }),
      ),
    );
    const byAction = await pageOf(
      await route.GET(
        auditRequest({
          cookie: session.cookie,
          search: "?action=kitchens-listed",
        }),
      ),
    );

    expect(byActor.total).toBe(1);
    expect(byAction.events.map(({ entry }) => entry.action)).toEqual([
      "kitchens-listed",
    ]);
  });

  it("answers an empty log with a total of 0 and no events", async () => {
    const { session } = await signedInAdministrator();

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(await jsonOf(answer)).toEqual({
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      events: [],
    });
  });
});

describe("rows the build does not recognise", () => {
  it("passes an unknown action through as unrecognised, with its code and nothing of its detail, and counts it", async () => {
    const { session, account } = await signedInAdministrator();
    plantEvent(auditWorld, {
      actorAccountId: account.id,
      action: "preset-hidden",
      detail: { note: "SECRET-STORED-DETAIL", presetName: "SECRET-PRESET" },
      occurredAt: new Date("2026-10-19T09:00:00.000Z"),
    });
    plantEvent(auditWorld, {
      actorAccountId: account.id,
      occurredAt: new Date("2026-10-19T08:00:00.000Z"),
    });

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));
    const body = await pageOf(answer);

    expect(answer.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.events.map(({ entry }) => entry)).toEqual([
      { kind: "unrecognised", action: "preset-hidden" },
      { kind: "recognised", action: "kitchen-opened", detail: null },
    ]);
    expect(await answer.clone().text()).not.toContain("SECRET");
  });

  it.each([
    [
      "a status change whose detail is cut short",
      "status-changed",
      { from: "new" },
    ],
    [
      "a status change whose detail names an unknown status",
      "status-changed",
      { from: "new", to: "SECRET-STATUS" },
    ],
    [
      "a status change with a member the domain does not name",
      "status-changed",
      { from: "new", to: "closed", secret: "SECRET" },
    ],
    [
      "a kitchens-listed row with a detail of the wrong type",
      "kitchens-listed",
      { segment: "sent" },
    ],
    [
      "a kitchen-opened row that carries a detail",
      "kitchen-opened",
      { secret: "SECRET" },
    ],
  ])(
    "reads %s as unrecognised: its action is shown, its detail is not",
    async (_title, action, detail) => {
      const { session, account } = await signedInAdministrator();
      plantEvent(auditWorld, { actorAccountId: account.id, action, detail });

      const answer = await route.GET(auditRequest({ cookie: session.cookie }));

      expect((await pageOf(answer)).events.map(({ entry }) => entry)).toEqual([
        { kind: "unrecognised", action },
      ]);
      expect(await answer.clone().text()).not.toContain("SECRET");
    },
  );

  it("filters by an action it recognises without dropping the unrecognised rows of an unfiltered page", async () => {
    const { session, account } = await signedInAdministrator();
    plantEvent(auditWorld, {
      actorAccountId: account.id,
      action: "future-one",
    });
    plantEvent(auditWorld, { actorAccountId: account.id });

    const everything = await pageOf(
      await route.GET(auditRequest({ cookie: session.cookie })),
    );
    const opened = await pageOf(
      await route.GET(
        auditRequest({
          cookie: session.cookie,
          search: "?action=kitchen-opened",
        }),
      ),
    );

    expect(everything.total).toBe(2);
    expect(opened.total).toBe(1);
  });
});

describe("what a row holds", () => {
  const SECRET_PHONE = "+37369123456";
  const SECRET_POSTAL_ADDRESS = "Strada Secreta 7";
  const SECRET_HASH = "SECRET-PASSWORD-HASH";

  /** Plants a row of each shape, with a directory that resolves everyone, and a store that hands back members the port
   *  does not declare, so only a route that names its members keeps them out. */
  async function plantEveryShape() {
    const { session, account } = await signedInAdministrator();
    const clientId = aDesignId();
    const ownerId = aDesignId();
    const designId = aDesignId();
    auditWorld.nameAccount(ownerId, {
      email: "owner@example.test",
      name: "Olga Owner",
    });
    auditWorld.nameAccount(account.id, {
      email: "administrator@example.test",
      name: "Ana Administrator",
    });
    auditWorld.nameAccount(clientId, {
      email: "client@example.test",
      name: "Cristi Client",
    });
    auditWorld.nameDesign(designId, {
      name: "Bucataria din Botanica",
      ownerAccountId: ownerId,
      isDeletedByClient: false,
    });
    const rows: [string, Record<string, unknown> | null][] = [
      ["kitchen-opened", null],
      ["note-added", null],
      ["status-changed", { from: "new", to: "contacted" }],
      ["kitchen-unhidden", null],
      [
        "kitchens-listed",
        {
          segment: "all",
          status: null,
          page: 2,
          rowCount: 20,
          hasSearch: true,
        },
      ],
    ];
    rows.forEach(([action, detail], index) => {
      const names = action !== "kitchens-listed";
      plantEvent(auditWorld, {
        actorAccountId: account.id,
        action,
        detail,
        designId: names ? designId : null,
        subjectAccountId: names ? clientId : null,
        occurredAt: new Date(Date.UTC(2026, 9, 19, 9, index)),
      });
    });
    auditWorld.decoratePage = (page) => ({
      ...page,
      events: page.events.map((row) => ({
        ...row,
        actor: {
          ...row.actor,
          phone: SECRET_PHONE,
          passwordHash: SECRET_HASH,
        },
        subject:
          row.subject === null
            ? null
            : {
                ...row.subject,
                phone: SECRET_PHONE,
                postalAddress: SECRET_POSTAL_ADDRESS,
              },
        design:
          row.design === null
            ? null
            : {
                ...row.design,
                postalAddress: SECRET_POSTAL_ADDRESS,
                client:
                  row.design.client === null
                    ? null
                    : { ...row.design.client, phone: SECRET_PHONE },
              },
        sessionTokenHash: SECRET_HASH,
      })),
      total: page.total,
    });
    const answer = await route.GET(auditRequest({ cookie: session.cookie }));
    return { answer, account, clientId, ownerId, designId };
  }

  it("holds exactly total, page, pageSize and events, and each event exactly its members", async () => {
    const { answer } = await plantEveryShape();

    const body = await pageOf(answer);

    expect(Object.keys(body).sort()).toEqual([
      "events",
      "page",
      "pageSize",
      "total",
    ]);
    for (const event of body.events) {
      expect(Object.keys(event).sort()).toEqual([
        "actor",
        "entry",
        "id",
        "kitchen",
        "occurredAt",
        "subject",
      ]);
      expect(Object.keys(event.actor).sort()).toEqual(["email", "id", "name"]);
      expect(Object.keys(event.subject ?? { email: 1 })).toEqual(["email"]);
      expect(
        Object.keys(event.kitchen ?? { client: 1, id: 1, name: 1 }).sort(),
      ).toEqual(["client", "id", "name"]);
      expect(Object.keys(event.kitchen?.client ?? { email: 1 })).toEqual([
        "email",
      ]);
    }
  });

  it("names the actor by id, address and name, the client by address alone, and the kitchen by id and name", async () => {
    const { answer, account, designId } = await plantEveryShape();

    const body = await pageOf(answer);
    const opened = body.events.find(
      ({ entry }) => entry.action === "kitchen-opened",
    );

    expect(opened?.actor).toEqual({
      id: account.id,
      email: "administrator@example.test",
      name: "Ana Administrator",
    });
    expect(opened?.subject).toEqual({ email: "client@example.test" });
    expect(opened?.kitchen).toEqual({
      id: designId,
      name: "Bucataria din Botanica",
      client: { email: "owner@example.test" },
    });
  });

  it("leaves a list view without a subject or a kitchen", async () => {
    const { answer } = await plantEveryShape();

    const listed = (await pageOf(answer)).events.find(
      ({ entry }) => entry.action === "kitchens-listed",
    );

    expect(listed?.subject).toBeNull();
    expect(listed?.kitchen).toBeNull();
  });

  it("shapes each action's entry by that action's detail, member by member", async () => {
    const { answer } = await plantEveryShape();

    const entries = (await pageOf(answer)).events.map(({ entry }) => entry);

    expect(entries).toEqual([
      {
        kind: "recognised",
        action: "kitchens-listed",
        detail: {
          segment: "all",
          status: null,
          page: 2,
          rowCount: 20,
          hasSearch: true,
        },
      },
      { kind: "recognised", action: "kitchen-unhidden", detail: null },
      {
        kind: "recognised",
        action: "status-changed",
        detail: { from: "new", to: "contacted" },
      },
      { kind: "recognised", action: "note-added", detail: null },
      { kind: "recognised", action: "kitchen-opened", detail: null },
    ]);
  });

  it("sends no phone, postal address, password hash or session hash at any depth", async () => {
    const { answer } = await plantEveryShape();

    const text = await answer.clone().text();

    for (const secret of [SECRET_PHONE, SECRET_POSTAL_ADDRESS, SECRET_HASH]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(
      /phone|postalAddress|passwordHash|sessionToken|accountId/i,
    );
  });

  it("sends the actor's account id on every row and no other account id: not the client's, the subject's or the kitchen owner's", async () => {
    const { answer, account, clientId, ownerId } = await plantEveryShape();

    const body = await pageOf(answer);
    const text = await answer.clone().text();

    expect(body.events.map(({ actor }) => actor.id)).toEqual(
      body.events.map(() => account.id),
    );
    expect(text.split(account.id)).toHaveLength(body.events.length + 1);
    expect(text).not.toContain(clientId);
    expect(text).not.toContain(ownerId);
  });

  it("reads an actor that no longer resolves as a null address and name, not as a missing row", async () => {
    const { session, account } = await signedInAdministrator();
    plantEvent(auditWorld, { actorAccountId: account.id });

    const body = await pageOf(
      await route.GET(auditRequest({ cookie: session.cookie })),
    );

    expect(body.events[0]?.actor).toEqual({
      id: account.id,
      email: null,
      name: null,
    });
  });

  it("reads a kitchen that is gone, deleted, or owned by no account without a name or a client", async () => {
    const { session, account } = await signedInAdministrator();
    const deleted = aDesignId();
    const orphan = aDesignId();
    const missing = aDesignId();
    auditWorld.nameDesign(deleted, {
      name: "Deleted one",
      ownerAccountId: null,
      isDeletedByClient: true,
    });
    auditWorld.nameDesign(orphan, {
      name: "Lead",
      ownerAccountId: null,
      isDeletedByClient: false,
    });
    for (const designId of [deleted, orphan, missing]) {
      plantEvent(auditWorld, { actorAccountId: account.id, designId });
    }

    const body = await pageOf(
      await route.GET(auditRequest({ cookie: session.cookie })),
    );

    const names = body.events.map(({ kitchen }) => kitchen?.name ?? null);
    expect(names.filter((name) => name === null)).toHaveLength(2);
    expect(names.filter((name) => name !== null)).toEqual(["Lead"]);
    expect(body.events.every(({ kitchen }) => kitchen?.client === null)).toBe(
      true,
    );
  });
});

describe("reading the log writes nothing", () => {
  it("writes no audit row for a page served, and never asks the store to record", async () => {
    const { session, account } = await signedInAdministrator();
    plantEvent(auditWorld, { actorAccountId: account.id });

    await route.GET(auditRequest({ cookie: session.cookie }));
    await route.GET(
      auditRequest({ cookie: session.cookie, search: "?page=2" }),
    );

    expect(auditWorld.store.heldEvents()).toHaveLength(1);
    expect(auditWorld.calls).toEqual(["audit.page", "audit.page"]);
  });
});

describe("the account's page limit fails closed", () => {
  const PAGES_ALLOWED_PER_HOUR = STAFF_AUDIT_PAGE_PER_ACCOUNT_HOUR_FIGURE;

  it("is 300 pages an hour, counted in the clock hour", () => {
    expect(PAGES_ALLOWED_PER_HOUR).toBe(300);
    expect(STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY.name).toBe(AUDIT_POLICY_NAME);
    expect(STAFF_AUDIT_PAGE_BY_ACCOUNT_POLICY.figure).toBe(300);
  });

  it("serves the figure's pages an hour and refuses the next with a wait inside the hour, reading nothing for it", async () => {
    const { session } = await signedInAdministrator();
    for (let served = 1; served <= PAGES_ALLOWED_PER_HOUR; served += 1) {
      const answer = await route.GET(auditRequest({ cookie: session.cookie }));
      expect(answer.status).toBe(200);
    }
    auditWorld.calls.length = 0;

    const refused = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(refused.status).toBe(429);
    expectAWaitWithinTheWindowOf(refused, AUDIT_POLICY_NAME);
    expect(await jsonOf(refused)).toEqual({ status: "rate-limited" });
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
    expect(auditWorld.calls).toEqual([]);
  });

  it("counts each account's pages apart", async () => {
    const first = await signedInAdministrator("first@example.test");
    const second = await signedInAdministrator("second@example.test");
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    const stopped = await route.GET(
      auditRequest({ cookie: first.session.cookie }),
    );
    limiterLedger.refusing.delete(AUDIT_POLICY_NAME);
    const served = await route.GET(
      auditRequest({ cookie: second.session.cookie }),
    );

    expect([stopped.status, served.status]).toEqual([429, 200]);
  });

  it("refuses the page and reads nothing when the bucket cannot be counted", async () => {
    const { session } = await signedInAdministrator();
    const console_ = captureConsole();
    limiterLedger.unavailable.add(AUDIT_POLICY_NAME);

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(auditWorld.calls).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("counts the bucket when no network source is named, where the general read is not counted at all", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const { session } = await signedInAdministrator();

    const served = await route.GET(auditRequest({ cookie: session.cookie }));
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    const refused = await route.GET(auditRequest({ cookie: session.cookie }));

    expect([served.status, refused.status]).toEqual([200, 429]);
  });
});

describe("a store that cannot answer is 503, never 401 (O18)", () => {
  it("answers 503 with no cause and no event, and logs the event and outcome alone, when the store fails", async () => {
    const { session, account } = await signedInAdministrator();
    const console_ = captureConsole();
    plantEvent(auditWorld, { actorAccountId: account.id });
    auditWorld.failPage = true;

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.accountLines()).toEqual([
      { event: "staff-audit", outcome: "unavailable" },
    ]);
  });

  it("answers 503 and not 401 when the session cannot be read", async () => {
    const { session } = await signedInAdministrator();
    world.failOn("sessions.findLive");

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(auditWorld.calls).toEqual([]);
  });
});

describe("the session is kept alive", () => {
  it("marks an admitted session seen once, before any bucket is counted or the store asked", async () => {
    const { session } = await signedInAdministrator();
    const seenAtTheMark: { counted: string[]; storeCalls: string[] }[] = [];
    world.intercept(SESSION_TOUCH, (real) => {
      seenAtTheMark.push({
        counted: limiterLedger.counted.filter(
          (name) => name !== READ_POLICY_NAME,
        ),
        storeCalls: [...auditWorld.calls],
      });
      return real();
    });

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(touches()).toBe(1);
    expect(seenAtTheMark).toEqual([{ counted: [], storeCalls: [] }]);
  });

  it("marks it seen when the admitted request is then refused for its query or its bucket", async () => {
    const { session } = await signedInAdministrator();

    await route.GET(
      auditRequest({ cookie: session.cookie, search: "?page=0" }),
    );
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    await route.GET(auditRequest({ cookie: session.cookie }));

    expect(touches()).toBe(2);
  });

  it("marks nothing seen for a request that is refused before admission", async () => {
    const operator = await signedInAs({ role: "operator" });
    const client = await signedInAs({ role: "client" });

    await route.GET(auditRequest());
    await route.GET(auditRequest({ cookie: operator.session.cookie }));
    await route.GET(auditRequest({ cookie: client.session.cookie }));

    expect(touches()).toBe(0);
  });

  it("answers as it would if the mark failed", async () => {
    const { session } = await signedInAdministrator();
    world.failOn(SESSION_TOUCH);

    const answer = await route.GET(auditRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
  });
});

describe("the answers", () => {
  it("is private, no-store on every status it gives", async () => {
    const administrator = await signedInAdministrator();
    const operator = await signedInAs({ role: "operator" });
    const answers = [
      await route.GET(auditRequest({ cookie: administrator.session.cookie })),
      await route.GET(auditRequest()),
      await route.GET(auditRequest({ cookie: operator.session.cookie })),
      await route.GET(
        auditRequest({
          cookie: administrator.session.cookie,
          search: "?page=0",
        }),
      ),
      await route.GET(
        auditRequest({
          cookie: administrator.session.cookie,
          secFetchSite: "cross-site",
        }),
      ),
    ];
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    answers.push(
      await route.GET(auditRequest({ cookie: administrator.session.cookie })),
    );
    limiterLedger.refusing.delete(AUDIT_POLICY_NAME);
    auditWorld.failPage = true;
    answers.push(
      await route.GET(auditRequest({ cookie: administrator.session.cookie })),
    );

    expect(answers.map(({ status }) => status)).toEqual([
      200, 401, 403, 400, 403, 429, 503,
    ]);
    for (const answer of answers) {
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("refuses a request from another site before reading the session or counting a bucket", async () => {
    const { session } = await signedInAdministrator();
    world.calls.length = 0;
    limiterLedger.counted.length = 0;

    const answer = await route.GET(
      auditRequest({ cookie: session.cookie, secFetchSite: "cross-site" }),
    );

    expect(answer.status).toBe(403);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(auditWorld.calls).toEqual([]);
  });

  it("logs an event and an outcome, and a policy for a limit, and nothing else", async () => {
    const { session, account } = await signedInAdministrator();
    const console_ = captureConsole();
    plantEvent(auditWorld, { actorAccountId: account.id });
    auditWorld.nameAccount(account.id, {
      email: "administrator@example.test",
      name: "Ana Administrator",
    });

    await route.GET(auditRequest({ cookie: session.cookie }));
    limiterLedger.refusing.set(AUDIT_POLICY_NAME, 1);
    await route.GET(auditRequest({ cookie: session.cookie }));

    expect(console_.accountLines()).toEqual([
      { event: "staff-audit", outcome: "succeeded" },
      { event: "staff-audit", outcome: "limited", policy: AUDIT_POLICY_NAME },
    ]);
    expect(console_.everything()).not.toContain("administrator@example.test");
    expect(console_.everything()).not.toContain(account.id);
  });
});

describe("the route's methods", () => {
  it("exports GET and HEAD only", () => {
    const methods = Object.keys(route).filter((name) =>
      ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(
        name,
      ),
    );

    expect(methods.sort()).toEqual(["GET", "HEAD"]);
  });

  /** The framework hands every handler the request; a handler that delegated to `GET` would have it to work with. */
  const head: (request: NextRequest) => Response = route.HEAD;

  it("answers HEAD with 405, no-store headers and no body, to a session and to nobody alike", async () => {
    const { session } = await signedInAdministrator();

    for (const cookie of [session.cookie, undefined]) {
      const answer = head(
        auditRequest({
          method: "HEAD",
          ...(cookie === undefined ? {} : { cookie }),
        }),
      );

      expect(answer.status).toBe(405);
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(answer.headers.get("allow")).toBe("GET");
      expect(await answer.text()).toBe("");
    }
  });

  it("reads no session, counts no bucket and asks no store for a HEAD", async () => {
    const { session } = await signedInAdministrator();
    world.calls.length = 0;
    limiterLedger.counted.length = 0;

    head(auditRequest({ method: "HEAD", cookie: session.cookie }));

    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(auditWorld.calls).toEqual([]);
  });
});
