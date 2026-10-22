import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  NOTES_ROUTE,
  STATUS_ROUTE,
  UNHIDE_ROUTE,
  UNKNOWN_ID,
  WRITE_ROUTES,
  type AskInit,
  type WriteRoute,
} from "../../../support/staff-write-routes";
import {
  freshStaffActionsWorld,
  plantActionKitchen,
  signedInStaffNamed,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
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
vi.mock("@/lib/server/staff/staff-kitchen-actions-store-instance", () =>
  import("../../../support/staff-actions-world").then((world) =>
    world.staffKitchenActionsStoreModule(),
  ),
);

/**
 * Adversarial QA of wave L3-S7, part two: what every answer of the three write routes carries (headers, log line,
 * body members at every depth), where a note's text may and may not appear, and how a failure of the session store or
 * the audit row is told. One scenario table is run for each route, so a status that one route answers and another
 * forgets to give the same headers is a failure of that route alone.
 */

const SECRET_TEXT = "SECRET-NOTE-TEXT-QA-L3-S7-4471";
const OPERATOR_EMAIL = "operator@example.test";
const ALLOWED_HEADER_NAMES = [
  "cache-control",
  "content-type",
  "retry-after",
  "vary",
];

let world: AccountWorld;
let staffWorld: StaffWorld;
let actions: StaffActionsWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  sessionValuesIssued.length = 0;
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  actions = freshStaffActionsWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sessionValuesIssued: string[] = [];

async function signedInOperator(
  email = OPERATOR_EMAIL,
  name = "Olga Operator",
) {
  const staff = await signedInStaffNamed({ role: "operator" }, email, name);
  sessionValuesIssued.push(staff.session.value);
  return staff;
}

/** A request body that carries the secret where the route takes text, and the route's own valid body elsewhere. */
function askWith(route: WriteRoute, id: string, init: AskInit = {}) {
  const json = route.name === "notes" ? { text: SECRET_TEXT } : route.validBody;
  return route.ask(id, { json, ...init });
}

interface Scenario {
  readonly title: string;
  readonly status: number;
  /** The one `[account]` line the answer writes, or `undefined` for an answer that writes none. */
  readonly line: { outcome: string; hasPolicy: boolean } | undefined;
  readonly run: (route: WriteRoute) => Promise<Response>;
  readonly appliesTo?: (route: WriteRoute) => boolean;
}

const REFUSED = { outcome: "refused", hasPolicy: false } as const;
const UNAVAILABLE = { outcome: "unavailable", hasPolicy: false } as const;

const METHOD_OF_ROUTE = {
  notes: "addNote",
  status: "setStatus",
  unhide: "unhide",
} as const;

function revokeBeforeTheStoreIsAsked(route: WriteRoute, accountId: string) {
  const method = METHOD_OF_ROUTE[route.name];
  const real = actions.store[method].bind(actions.store) as (
    request: unknown,
  ) => Promise<unknown>;
  vi.spyOn(actions.store, method).mockImplementation((async (
    request: unknown,
  ) => {
    await world.sessions.revokeAllForAccount(accountId);
    return real(request);
  }) as never);
}

const takesBody = (route: WriteRoute) => route.takesBody;

const SCENARIOS: readonly Scenario[] = [
  {
    title: "a success",
    status: 0,
    line: { outcome: "succeeded", hasPolicy: false },
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "an anonymous caller",
    status: 401,
    line: REFUSED,
    run: (route) => askWith(route, route.plantReady()),
  },
  {
    title: "a client",
    status: 403,
    line: REFUSED,
    run: async (route) => {
      const { session } = await signedInAs({ role: "client" });
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a cross-site request",
    status: 403,
    line: undefined,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        secFetchSite: "cross-site",
      });
    },
  },
  {
    title: "a malformed id",
    status: 404,
    line: REFUSED,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, "not-an-id", { cookie: session.cookie });
    },
  },
  {
    title: "an id no kitchen has",
    status: 404,
    line: REFUSED,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, UNKNOWN_ID, { cookie: session.cookie });
    },
  },
  {
    title: "a bucket that is full",
    status: 429,
    line: { outcome: "limited", hasPolicy: true },
    run: async (route) => {
      const { session } = await signedInOperator();
      limiterLedger.refusing.set(route.policy.name, 1);
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a bucket that cannot be counted",
    status: 503,
    line: UNAVAILABLE,
    run: async (route) => {
      const { session } = await signedInOperator();
      limiterLedger.unavailable.add(route.policy.name);
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a session store that throws",
    status: 503,
    line: UNAVAILABLE,
    run: async (route) => {
      const { session } = await signedInOperator();
      world.failOn("sessions.findLive");
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a store that throws",
    status: 503,
    line: UNAVAILABLE,
    run: async (route) => {
      const { session } = await signedInOperator();
      actions.failStore = true;
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "an audit row that cannot be staged",
    status: 503,
    line: UNAVAILABLE,
    run: async (route) => {
      const { session } = await signedInOperator();
      vi.spyOn(staffWorld.audit, "stage").mockRejectedValue(
        new Error(DRIVER_FAILURE_MARKER),
      );
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a session that ends after the route read it",
    status: 401,
    line: REFUSED,
    run: async (route) => {
      const { session, account } = await signedInOperator();
      revokeBeforeTheStoreIsAsked(route, account.id);
      return askWith(route, route.plantReady(), { cookie: session.cookie });
    },
  },
  {
    title: "a body of the wrong media type",
    status: 415,
    line: undefined,
    appliesTo: takesBody,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        json: "{}",
        contentType: "text/plain",
      });
    },
  },
  {
    title: "a body past the bound",
    status: 413,
    line: undefined,
    appliesTo: takesBody,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        json: `{"x":"${"a".repeat(9000)}"}`,
      });
    },
  },
  {
    title: "a body that is not an object",
    status: 400,
    line: REFUSED,
    appliesTo: takesBody,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        json: "[1]",
      });
    },
  },
  {
    title: "a member the body may not hold",
    status: 400,
    line: REFUSED,
    appliesTo: takesBody,
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        json: { ...route.validBody, extra: 1 },
      });
    },
  },
  {
    title: "a member that is refused",
    status: 400,
    line: REFUSED,
    appliesTo: takesBody,
    run: async (route) => {
      const { session } = await signedInOperator();
      const refused =
        route.name === "notes" ? { text: "" } : { status: "x", from: "new" };
      return askWith(route, route.plantReady(), {
        cookie: session.cookie,
        json: refused,
      });
    },
  },
  {
    title: "a status the kitchen cannot take",
    status: 409,
    line: REFUSED,
    appliesTo: (route) => route.name === "status",
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, plantActionKitchen({ isSent: false }).id, {
        cookie: session.cookie,
      });
    },
  },
  {
    title: "a kitchen that is not hidden",
    status: 409,
    line: REFUSED,
    appliesTo: (route) => route.name === "unhide",
    run: async (route) => {
      const { session } = await signedInOperator();
      return askWith(route, plantActionKitchen().id, {
        cookie: session.cookie,
      });
    },
  },
];

describe.each(WRITE_ROUTES)("$name: every answer", (route) => {
  const scenarios = SCENARIOS.filter(({ appliesTo = () => true }) =>
    appliesTo(route),
  );

  it.each(scenarios)(
    "to $title is private, no-store, sets no cookie, carries no validator and writes the one line it should",
    async ({ status, line, run }) => {
      const answer = await run(route);

      expect(answer.status).toBe(status === 0 ? route.success : status);
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      expect(answer.headers.getSetCookie()).toEqual([]);
      expect(answer.headers.get("etag")).toBeNull();
      expect(answer.headers.get("last-modified")).toBeNull();
      expect(answer.headers.get("access-control-allow-origin")).toBeNull();
      expect(
        [...answer.headers.keys()].filter(
          (name) => !ALLOWED_HEADER_NAMES.includes(name),
        ),
      ).toEqual([]);
      expect(answer.headers.get("retry-after") !== null).toBe(
        answer.status === 429,
      );
      expectOneLine(line);
    },
  );

  it.each(scenarios)(
    "to $title holds no secret: not the note's text outside its 201, not a driver text, not the session",
    async ({ run }) => {
      const answer = await run(route);

      const text = await answer.clone().text();
      const headers = JSON.stringify([...answer.headers]);
      const logged = console_.everything();
      expect(text + headers + logged).not.toContain(DRIVER_FAILURE_MARKER);
      for (const value of sessionValuesIssued) {
        expect(text + headers + logged).not.toContain(value);
      }
      expect(JSON.stringify(staffWorld.audit.heldEvents())).not.toContain(
        SECRET_TEXT,
      );
      expect(headers + logged).not.toContain(SECRET_TEXT);
      if (answer.status !== 201) expect(text).not.toContain(SECRET_TEXT);
    },
  );
});

function expectOneLine(
  line: { outcome: string; hasPolicy: boolean } | undefined,
): void {
  const lines = console_.accountLines();
  const everythingLogged = JSON.parse(console_.everything()) as unknown[];
  if (line === undefined) {
    expect(everythingLogged).toEqual([]);
    return;
  }
  expect(everythingLogged).toHaveLength(1);
  expect(lines).toHaveLength(1);
  const [only] = lines;
  expect(only?.outcome).toBe(line.outcome);
  expect(Object.keys(only ?? {}).sort()).toEqual(
    line.hasPolicy ? ["event", "outcome", "policy"] : ["event", "outcome"],
  );
}

describe("the answers' members, at every depth", () => {
  function pathsOf(value: unknown, prefix = ""): string[] {
    if (value === null || typeof value !== "object") return [prefix];
    if (Array.isArray(value)) {
      return value.flatMap((item) => pathsOf(item, `${prefix}[]`));
    }
    return Object.entries(value).flatMap(([key, member]) =>
      pathsOf(member, prefix === "" ? key : `${prefix}.${key}`),
    );
  }

  it("a 201 holds the note, its id, text, time and its author's address and name, and not one member more", async () => {
    const { session, account } = await signedInOperator();
    const kitchen = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(kitchen.id, {
      cookie: session.cookie,
      json: { text: "Called the client" },
    });

    const body = await jsonOf(answer);
    expect(pathsOf(body).sort()).toEqual([
      "note.author.email",
      "note.author.name",
      "note.createdAt",
      "note.id",
      "note.text",
    ]);
    const serialised = JSON.stringify(body);
    for (const secret of [account.id, kitchen.accountId, kitchen.id]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("a 201 holds the author's name as null when the account has none, and still no id", async () => {
    const { session, account } = await signedInStaffNamed(
      { role: "operator" },
      "nameless@example.test",
      null,
    );
    const kitchen = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(kitchen.id, {
      cookie: session.cookie,
      json: { text: "Hello" },
    });

    const { note } = (await jsonOf(answer)) as {
      note: { author: Record<string, unknown> };
    };
    expect(note.author).toEqual({
      email: "nameless@example.test",
      name: null,
    });
    expect(JSON.stringify(note)).not.toContain(account.id);
  });

  it("a 200 holds the status and, for who set it, an address, a name and a time, and no account id", async () => {
    const { session, account } = await signedInOperator();
    const kitchen = plantActionKitchen();

    const answer = await STATUS_ROUTE.ask(kitchen.id, {
      cookie: session.cookie,
      json: { status: "offer-sent", from: "new" },
    });

    const body = await jsonOf(answer);
    expect(pathsOf(body).sort()).toEqual([
      "changedAt",
      "changedBy.email",
      "changedBy.name",
      "status",
    ]);
    expect(JSON.stringify(body)).not.toContain(account.id);
    expect(JSON.stringify(body)).not.toContain(kitchen.accountId ?? "none");
  });

  it("a 200 for a status that was already shown names the account that set it before, not the caller", async () => {
    const first = await signedInOperator("first@example.test", "First One");
    const second = await signedInOperator("second@example.test", "Second One");
    const kitchen = plantActionKitchen();
    await STATUS_ROUTE.ask(kitchen.id, {
      cookie: first.session.cookie,
      json: { status: "closed", from: "new" },
    });

    const answer = await STATUS_ROUTE.ask(kitchen.id, {
      cookie: second.session.cookie,
      json: { status: "closed", from: "closed" },
    });

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toMatchObject({
      status: "closed",
      changedBy: { email: "first@example.test", name: "First One" },
    });
    expect(staffWorld.audit.heldEvents()).toHaveLength(1);
  });

  it("a 200 for new on a kitchen whose status was never saved has no last change at all, and no row is made for it", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantActionKitchen();

    const answer = await STATUS_ROUTE.ask(kitchen.id, {
      cookie: session.cookie,
      json: { status: "new", from: "new" },
    });

    expect(await jsonOf(answer)).toEqual({
      status: "new",
      changedBy: null,
      changedAt: null,
    });
    expect(actions.store.heldStatus(kitchen.id)).toBeUndefined();
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it.each([
    [
      "status",
      STATUS_ROUTE,
      () => plantActionKitchen({ isSent: false }),
      "not-sent",
    ],
    ["unhide", UNHIDE_ROUTE, () => plantActionKitchen(), "not-hidden"],
  ] as const)(
    "a 409 from %s holds its one word and no other member",
    async (_name, route, plant, word) => {
      const { session } = await signedInOperator();

      const answer = await route.ask(plant().id, { cookie: session.cookie });

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: word });
    },
  );

  it("a 204 has no body, no content type and no length that tells of one", async () => {
    const { session } = await signedInOperator();

    const answer = await UNHIDE_ROUTE.ask(UNHIDE_ROUTE.plantReady(), {
      cookie: session.cookie,
    });

    expect(answer.status).toBe(204);
    expect(answer.body).toBeNull();
    expect(await answer.text()).toBe("");
    expect(answer.headers.get("content-type")).toBeNull();
    expect(answer.headers.get("content-length") ?? "0").toBe("0");
  });
});

describe("where a note's text may be", () => {
  it("is in the 201, once, in the store, once, and in no other place a request leaves behind", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: SECRET_TEXT },
    });

    const text = await answer.clone().text();
    expect(text.split(SECRET_TEXT)).toHaveLength(2);
    expect(JSON.stringify([...answer.headers])).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(staffWorld.audit.heldEvents())).not.toContain(
      SECRET_TEXT,
    );
    expect(actions.store.heldNotes(id)).toHaveLength(1);
  });

  it("is in no audit row, line or answer when the text is refused for another reason", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: `${SECRET_TEXT}\u202E` },
    });

    expect(answer.status).toBe(400);
    expect(await answer.clone().text()).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
  });

  it("is in no answer when the body is refused for an extra member", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: SECRET_TEXT, [SECRET_TEXT]: 1 },
    });

    expect(answer.status).toBe(400);
    expect(await answer.clone().text()).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
  });
});

describe("any listed status may follow any other", () => {
  const STATUSES = [...REQUEST_STATUSES];

  it("lists the four words the plan names", () => {
    expect(STATUSES).toEqual(["new", "contacted", "offer-sent", "closed"]);
  });

  const PAIRS = STATUSES.flatMap((from) =>
    STATUSES.map((to) => [from, to] as const),
  );

  it.each(PAIRS)(
    "from %s to %s: 200 with the word, and one audit row naming both unless nothing changes",
    async (from, to) => {
      const { session, account } = await signedInOperator();
      const other = await signedInOperator("other@example.test", "Other");
      const kitchen = plantActionKitchen();
      if (from !== "new") {
        actions.store.plantStatus({
          designId: kitchen.id,
          status: from,
          changedByAccountId: other.account.id,
          changedAt: new Date("2026-10-19T08:00:00.000Z"),
        });
      }

      const answer = await STATUS_ROUTE.ask(kitchen.id, {
        cookie: session.cookie,
        json: { status: to, from },
      });

      expect(answer.status).toBe(200);
      expect(await jsonOf(answer)).toMatchObject({ status: to });
      const rows = staffWorld.audit.heldEvents();
      if (from === to) {
        expect(rows).toEqual([]);
        return;
      }
      expect(rows).toEqual([
        expect.objectContaining({
          action: "status-changed",
          actorAccountId: account.id,
          designId: kitchen.id,
          detail: { from, to },
        }),
      ]);
      expect(actions.store.heldStatus(kitchen.id)?.status).toBe(to);
    },
  );
});

describe("a status the kitchen cannot take is a conflict whatever the word", () => {
  it.each(REQUEST_STATUSES)(
    "%s on a draft is 409 not-sent, and new on a draft is not read as a status it already shows",
    async (status) => {
      const { session } = await signedInOperator();
      const draft = plantActionKitchen({ isSent: false });

      const answer = await STATUS_ROUTE.ask(draft.id, {
        cookie: session.cookie,
        json: { status, from: "new" },
      });

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: "not-sent" });
      expect(actions.store.heldStatus(draft.id)).toBeUndefined();
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    },
  );

  it.each(REQUEST_STATUSES)(
    "%s over a stored word this build does not list is 409 status-not-recognised: the stored word is never read as new",
    async (status) => {
      const { session, account } = await signedInOperator();
      const kitchen = plantActionKitchen();
      const planted = {
        designId: kitchen.id,
        status: "won",
        changedByAccountId: account.id,
        changedAt: new Date("2026-10-19T08:00:00.000Z"),
      };
      actions.store.plantStatus(planted);

      const answer = await STATUS_ROUTE.ask(kitchen.id, {
        cookie: session.cookie,
        json: { status, from: "new" },
      });

      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: "status-not-recognised" });
      expect(actions.store.heldStatus(kitchen.id)).toEqual(planted);
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    },
  );
});

describe("a session store that fails", () => {
  it.each(WRITE_ROUTES)(
    "$name: is 503 and never 401 when the route's own read of the session throws",
    async (route) => {
      const { session } = await signedInOperator();
      world.failOn("sessions.findLive");

      const answer = await askWith(route, route.plantReady(), {
        cookie: session.cookie,
      });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(actions.calls).toEqual([]);
      expect(limiterLedger.counted).toEqual([]);
    },
  );

  it.each(WRITE_ROUTES)(
    "$name: is 503 and never 401 when the store's own look at the session throws, and nothing is written",
    async (route) => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      const before = actions.store.heldKitchen(id);
      const realLookup = world.sessions.findLive.bind(world.sessions);
      let lookups = 0;
      vi.spyOn(world.sessions, "findLive").mockImplementation((request) => {
        lookups += 1;
        return lookups === 1
          ? realLookup(request)
          : Promise.reject(new Error(DRIVER_FAILURE_MARKER));
      });

      const answer = await askWith(route, id, { cookie: session.cookie });

      expect(lookups).toBeGreaterThanOrEqual(2);
      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(actions.store.heldKitchen(id)).toEqual(before);
      expect(actions.store.heldNotes(id)).toEqual([]);
      expect(actions.store.heldStatus(id)).toBeUndefined();
      expect(staffWorld.audit.heldEvents()).toEqual([]);
      expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    },
  );
});

describe("an audit row that cannot be written leaves no change", () => {
  it.each(WRITE_ROUTES)(
    "$name: 503, and the kitchen, its notes and its status are as they were",
    async (route) => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      const before = actions.store.heldKitchen(id);
      vi.spyOn(staffWorld.audit, "stage").mockRejectedValue(
        new Error(DRIVER_FAILURE_MARKER),
      );

      const answer = await askWith(route, id, { cookie: session.cookie });

      expect(answer.status).toBe(503);
      expect(actions.store.heldKitchen(id)).toEqual(before);
      expect(actions.store.heldNotes(id)).toEqual([]);
      expect(actions.store.heldStatus(id)).toBeUndefined();
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    },
  );
});
