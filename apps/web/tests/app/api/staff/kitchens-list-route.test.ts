import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantClient,
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
 * `GET /api/staff/kitchens` (M8B Lot 3, E-L3-1; ADR 0173). The route is called with `Request` objects over the
 * persistence package's fakes; the session lookup, the capability check, both limiters' decisions and the response
 * builders are the real ones. Every list view writes a `kitchens-listed` audit row before its page is sent, and the
 * account's page bucket fails closed.
 */

const STAFF_LIST_POLICY_NAME =
  "staff-kitchens-list-by-account-per-60-utc-minutes";
const PAGES_ALLOWED_PER_HOUR = 300;
const PAGE_SIZE = 20;
const A_SEARCH_NO_ONE_ELSE_TYPES = "Zorila-Quasar-9917";

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function listRequest(init: Parameters<typeof accountRequest>[1] = {}) {
  return accountRequest("/api/staff/kitchens", {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

function plantKitchens(count: number, accountId: string | null = null): void {
  for (let index = 0; index < count; index += 1) {
    plantKitchen({
      accountId,
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)),
      sentAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)),
    });
  }
}

async function servePages(cookie: string, count: number): Promise<void> {
  for (let served = 1; served <= count; served += 1) {
    const answer = await GET(listRequest({ cookie }));
    expect(answer.status).toBe(200);
  }
}

function heldRows() {
  return staffWorld.audit.heldEvents();
}

describe("the order of the checks", () => {
  it("refuses a cross-site request first: nothing is counted, no session is read, no store is asked", async () => {
    const { session } = await signedInOperator();
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await GET(
        listRequest({ cookie: session.cookie, secFetchSite }),
      );

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("counts the network's read limit before it reads the session, so a refusal is the same for every caller", async () => {
    const { session } = await signedInOperator();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);
    world.calls.length = 0;

    const signedIn = await GET(listRequest({ cookie: session.cookie }));
    const anonymous = await GET(listRequest());

    for (const answer of [signedIn, anonymous]) {
      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, READ_POLICY_NAME);
      expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    }
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  });

  it("serves a page when the network's read limiter cannot be judged: the general read fails open, only the page bucket does not", async () => {
    const { session } = await signedInOperator();
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("answers 401 to an anonymous caller with a bad query: the capability is checked before the query", async () => {
    const answer = await GET(listRequest({ search: "?segment=nonsense" }));

    expect(answer.status).toBe(401);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers 403 to a client with a bad query, and counts no page for them", async () => {
    const client = await signedInAs({ role: "client" });

    const answer = await GET(
      listRequest({ cookie: client.session.cookie, search: "?page=0" }),
    );

    expect(answer.status).toBe(403);
    expect(limiterLedger.counted).not.toContain(STAFF_LIST_POLICY_NAME);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers 503, never 401, when the session store cannot be read", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    world.failOn("sessions.findLive");

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.accountLines()).toContainEqual({
      event: "staff-kitchens",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers 401 to a staff session that has been idle past twelve hours", async () => {
    const { session } = await signedInOperator();
    world.advance(12 * 60 * 60 * 1000 + 1000);

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(401);
    expect(staffWorld.calls).toEqual([]);
  });
});

describe("the query", () => {
  const BAD_QUERIES: readonly [string, string, string, string][] = [
    ["an unknown segment", "?segment=nonsense", "segment", "UNKNOWN_VALUE"],
    ["an unknown status", "?status=bogus", "status", "UNKNOWN_VALUE"],
    [
      "a status outside the sent segment",
      "?segment=drafts&status=new",
      "status",
      "STATUS_NEEDS_SENT_SEGMENT",
    ],
    ["page 0", "?page=0", "page", "NOT_A_PAGE_NUMBER"],
    ["a negative page", "?page=-1", "page", "NOT_A_PAGE_NUMBER"],
    ["a page with a leading zero", "?page=01", "page", "NOT_A_PAGE_NUMBER"],
    ["a page that is not a number", "?page=abc", "page", "NOT_A_PAGE_NUMBER"],
    ["a search of 101 characters", `?q=${"a".repeat(101)}`, "q", "TOO_LONG"],
    [
      "a search with a control character",
      "?q=a%07b",
      "q",
      "FORBIDDEN_CHARACTER",
    ],
  ];

  it.each(BAD_QUERIES)(
    "answers 400 with the member and a code for %s, before any page is counted or read",
    async (_title, search, field, code) => {
      const { session } = await signedInOperator();

      const answer = await GET(listRequest({ cookie: session.cookie, search }));

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field, code }],
      });
      expect(limiterLedger.counted).not.toContain(STAFF_LIST_POLICY_NAME);
      expect(staffWorld.calls).toEqual([]);
      expect(heldRows()).toEqual([]);
    },
  );

  it("never repeats the search text in a refusal, the audit log or a log line", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const typed = `${A_SEARCH_NO_ONE_ELSE_TYPES}%07`;

    const refused = await GET(
      listRequest({ cookie: session.cookie, search: `?q=${typed}` }),
    );

    expect(refused.status).toBe(400);
    expect(await refused.clone().text()).not.toContain(
      A_SEARCH_NO_ONE_ELSE_TYPES,
    );
    expect(console_.everything()).not.toContain(A_SEARCH_NO_ONE_ELSE_TYPES);
  });

  it("reads the segment, the status, the search and the page, and ignores every other member", async () => {
    const { session } = await signedInOperator();
    const client = plantClient({ name: "Ileana Unica" });
    plantKitchens(PAGE_SIZE + 1, client.id);

    const answer = await GET(
      listRequest({
        cookie: session.cookie,
        search: `?segment=all&page=2&q=ileana&role=administrator&accountId=${client.id}&pageSize=1`,
      }),
    );
    const body = (await jsonOf(answer)) as {
      page: number;
      pageSize: number;
      total: number;
      kitchens: unknown[];
    };

    expect(answer.status).toBe(200);
    expect([body.page, body.pageSize, body.total]).toEqual([
      2,
      PAGE_SIZE,
      PAGE_SIZE + 1,
    ]);
    expect(body.kitchens).toHaveLength(1);
  });

  it("defaults to the sent segment, first page", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    plantKitchen({ accountId: client.id });
    plantKitchen({ accountId: client.id, isSent: false });

    const body = (await jsonOf(
      await GET(listRequest({ cookie: session.cookie })),
    )) as { page: number; total: number };

    expect([body.page, body.total]).toEqual([1, 1]);
    expect(heldRows()[0]?.detail).toMatchObject({
      segment: "sent",
      status: null,
      page: 1,
    });
  });
});

describe("the kitchens listed", () => {
  it("lists a hidden kitchen with its mark and a sent kitchen no account owns with no client, and leaves out a deleted one and a visitor's draft", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const hidden = plantKitchen({ accountId: client.id, isHidden: true });
    const leadWithoutAccount = plantKitchen({ accountId: null });
    plantKitchen({ accountId: client.id, isDeletedByClient: true });
    plantKitchen({ accountId: null, isSent: false });

    const body = (await jsonOf(
      await GET(
        listRequest({ cookie: session.cookie, search: "?segment=all" }),
      ),
    )) as {
      kitchens: { id: string; isHidden: boolean; client: unknown }[];
    };

    const byId = new Map(body.kitchens.map((row) => [row.id, row]));
    expect([...byId.keys()].sort()).toEqual(
      [hidden.id, leadWithoutAccount.id].sort(),
    );
    expect(byId.get(hidden.id)?.isHidden).toBe(true);
    expect(byId.get(leadWithoutAccount.id)?.client).toBeNull();
  });

  it("lists a kitchen whose stored document this build cannot read, with a null design", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const unreadable = plantKitchen({ accountId: client.id, design: null });

    const body = (await jsonOf(
      await GET(listRequest({ cookie: session.cookie })),
    )) as { kitchens: { id: string; design: unknown }[] };

    expect(body.kitchens).toEqual([
      expect.objectContaining({ id: unreadable.id, design: null }),
    ]);
  });
});

describe("what a page holds", () => {
  it("answers private, no-store, with a body of exactly total, page, pageSize and kitchens", async () => {
    const { session } = await signedInOperator();

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(Object.keys((await jsonOf(answer)) as object).sort()).toEqual([
      "kitchens",
      "page",
      "pageSize",
      "total",
    ]);
  });

  it("describes a kitchen member by member and a client by e-mail, name and phone alone", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    plantKitchen({ accountId: client.id, name: "Bucataria din Botanica" });

    const answer = await GET(listRequest({ cookie: session.cookie }));
    const { kitchens } = (await jsonOf(answer)) as {
      kitchens: Record<string, unknown>[];
    };

    expect(Object.keys(kitchens[0] ?? {}).sort()).toEqual([
      "client",
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "requestStatus",
      "sentAt",
      "updatedAt",
    ]);
    expect(kitchens[0]?.client).toEqual({
      email: client.email,
      name: client.name,
      phone: client.phone,
    });
    const text = JSON.stringify(kitchens);
    expect(text).not.toContain(client.id);
    expect(text).not.toContain(client.postalAddress);
    expect(text).not.toMatch(/accountId|passwordHash|visitorHash|address/i);
  });

  it("sends the thumbnail only what it draws of the document", async () => {
    const { session } = await signedInOperator();
    plantKitchen({});

    const { kitchens } = (await jsonOf(
      await GET(listRequest({ cookie: session.cookie })),
    )) as { kitchens: { design: Record<string, unknown> }[] };

    const keys = Object.keys(kitchens[0]?.design ?? {});
    expect(keys).toEqual(expect.arrayContaining(["room", "placements"]));
    expect(keys).not.toContain("presetId");
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("updatedAt");
  });
});

describe("every list view is audited before the page is sent", () => {
  it("writes one kitchens-listed row naming the actor, the codes and the count, and no kitchen or client", async () => {
    const { account, session } = await signedInOperator();
    const client = plantClient();
    plantKitchens(3, client.id);

    const answer = await GET(
      listRequest({
        cookie: session.cookie,
        search: "?segment=sent&status=new",
      }),
    );

    expect(answer.status).toBe(200);
    expect(heldRows()).toEqual([
      expect.objectContaining({
        actorAccountId: account.id,
        action: "kitchens-listed",
        designId: null,
        subjectAccountId: null,
        detail: {
          segment: "sent",
          status: "new",
          page: 1,
          rowCount: 3,
          hasSearch: false,
        },
      }),
    ]);
  });

  it.each([
    [1, PAGE_SIZE],
    [2, 1],
    [3, 0],
  ])("counts the rows of page %i as %i", async (page, rowCount) => {
    const { session } = await signedInOperator();
    plantKitchens(PAGE_SIZE + 1);

    await GET(
      listRequest({ cookie: session.cookie, search: `?page=${String(page)}` }),
    );

    expect(heldRows()[0]?.detail).toMatchObject({ page, rowCount });
  });

  it("records that a search was made and never what it was", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    plantClient({ name: A_SEARCH_NO_ONE_ELSE_TYPES });

    const answer = await GET(
      listRequest({
        cookie: session.cookie,
        search: `?q=${A_SEARCH_NO_ONE_ELSE_TYPES}`,
      }),
    );

    expect(answer.status).toBe(200);
    expect(heldRows()[0]?.detail).toMatchObject({ hasSearch: true });
    expect(JSON.stringify(heldRows())).not.toContain(
      A_SEARCH_NO_ONE_ELSE_TYPES,
    );
    expect(console_.everything()).not.toContain(A_SEARCH_NO_ONE_ELSE_TYPES);
  });

  it("counts an empty search as no search", async () => {
    const { session } = await signedInOperator();

    await GET(listRequest({ cookie: session.cookie, search: "?q=" }));

    expect(heldRows()[0]?.detail).toMatchObject({ hasSearch: false });
  });

  it("writes a row for a page past the last, with no rows", async () => {
    const { session } = await signedInOperator();

    const answer = await GET(
      listRequest({ cookie: session.cookie, search: "?page=50" }),
    );

    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("answers 503 with no page, no client and no cause, and keeps no row, when the audit row cannot be written", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const client = plantClient({ email: "seen-only-in-a-page@example.test" });
    plantKitchen({ accountId: client.id, name: "Bucatarie secreta" });
    staffWorld.auditBehaviour = "reject";

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    const text = await answer.clone().text();
    expect(text).not.toContain(client.email);
    expect(text).not.toContain("Bucatarie secreta");
    expect(text).not.toContain(DRIVER_FAILURE_MARKER);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(heldRows()).toEqual([]);
    expect(console_.accountLines()).toContainEqual({
      event: "staff-kitchens",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 and serves nothing when the actor's session ended before the row was written", async () => {
    const { account, session } = await signedInOperator();
    plantKitchen({});
    staffWorld.auditBehaviour = "lose-session";
    staffWorld.signedOutAccountId = account.id;

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(heldRows()).toEqual([]);
  });

  it("has the row committed by the time the answer exists: the write is awaited, not started", async () => {
    const { session } = await signedInOperator();
    staffWorld.auditBehaviour = "commit-late";

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("writes no row for a request that is not answered 200", async () => {
    const { session } = await signedInOperator();
    const client = await signedInAs({ role: "client" });
    const refused = [
      await GET(listRequest()),
      await GET(listRequest({ cookie: client.session.cookie })),
      await GET(listRequest({ cookie: session.cookie, search: "?page=0" })),
    ];
    staffWorld.failReader = true;
    refused.push(await GET(listRequest({ cookie: session.cookie })));

    expect(refused.map(({ status }) => status)).toEqual([401, 403, 400, 503]);
    expect(heldRows()).toEqual([]);
  });

  it("answers 503 with no page and no row when the reader fails", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    staffWorld.failReader = true;

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(staffWorld.calls).not.toContain("audit.record");
  });
});

describe("the account's page limit fails closed", () => {
  it("serves 300 pages an hour and refuses the 301st with a wait inside the hour, reading nothing and writing no row for it", async () => {
    const { session } = await signedInOperator();
    await servePages(session.cookie, PAGES_ALLOWED_PER_HOUR);
    staffWorld.calls.length = 0;

    const refused = await GET(listRequest({ cookie: session.cookie }));

    expect(refused.status).toBe(429);
    expectAWaitWithinTheWindowOf(refused, STAFF_LIST_POLICY_NAME);
    expect(await jsonOf(refused)).toEqual({ status: "rate-limited" });
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toHaveLength(PAGES_ALLOWED_PER_HOUR);
  });

  it("counts each account's pages apart: one account's ceiling does not stop another's first page", async () => {
    const first = await signedInOperator("first@example.test");
    const second = await signedInOperator("second@example.test");
    await servePages(first.session.cookie, PAGES_ALLOWED_PER_HOUR);

    const stopped = await GET(listRequest({ cookie: first.session.cookie }));
    const served = await GET(listRequest({ cookie: second.session.cookie }));

    expect([stopped.status, served.status]).toEqual([429, 200]);
  });

  it("refuses the page, reads nothing and writes no row when the bucket cannot be counted", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    limiterLedger.unavailable.add(STAFF_LIST_POLICY_NAME);

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("counts the bucket when no network source is named, where the general read is not counted at all", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const { session } = await signedInOperator();

    const served = await GET(listRequest({ cookie: session.cookie }));
    limiterLedger.refusing.set(STAFF_LIST_POLICY_NAME, 1);
    const refused = await GET(listRequest({ cookie: session.cookie }));

    expect(served.status).toBe(200);
    expect(refused.status).toBe(429);
    expect(limiterLedger.counted).toEqual([
      STAFF_LIST_POLICY_NAME,
      STAFF_LIST_POLICY_NAME,
    ]);
  });

  it("counts the page after the capability and the query and before the reader", async () => {
    const { session } = await signedInOperator();

    await GET(listRequest({ cookie: session.cookie }));

    expect(limiterLedger.counted).toEqual([
      READ_POLICY_NAME,
      STAFF_LIST_POLICY_NAME,
    ]);
    expect(staffWorld.calls).toEqual(["reader.listPage", "audit.record"]);
  });
});
