import { fc } from "@fast-check/vitest";
import {
  REQUEST_STATUSES,
  STAFF_KITCHEN_PAGE_SIZE,
} from "@lemnaria/configurator-domain";
import type { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_EVENTS } from "@/lib/server/account/account-log";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  aDesign,
  aDesignId,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  SENT_AT,
  UPDATED_AT,
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

const listModule = await import("@/app/api/staff/kitchens/route");
const oneModule = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * Adversarial QA of wave L3-S6 (`GET /api/staff/kitchens` and `/api/staff/kitchens/{id}`, ADR 0173). What the
 * developer's files do not reach: the order and the awaiting of the audit write against a stalled store, a body that
 * cannot be shaped, a hostile reader against the wire contract's key sets, every answer's headers, the log's closed
 * shape, the query parser's edges and the id route's one refusal over hostile ids. The 300-an-hour bucket's own
 * edges are in `qa-l3-s6-list-bucket.adversarial.test.ts`.
 */

const STAFF_LIST_POLICY_NAME =
  "staff-kitchens-list-by-account-per-60-utc-minutes";
const NETWORK_ADDRESS = "192.0.2.77";
const OFFSETS_LARGEST_COUNTABLE_PAGE = 450_359_962_737_049;

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

interface AskInit {
  readonly cookie?: string;
  readonly search?: string;
  readonly headers?: Record<string, string>;
  readonly secFetchSite?: string | null;
}

function requestInit(init: AskInit): Parameters<typeof accountRequest>[1] {
  return {
    ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
    ...(init.search === undefined ? {} : { search: init.search }),
    ...(init.secFetchSite === undefined
      ? {}
      : { secFetchSite: init.secFetchSite }),
    headers: { "x-forwarded-for": NETWORK_ADDRESS, ...init.headers },
  };
}

function askList(init: AskInit = {}): Promise<NextResponse> {
  return listModule.GET(
    accountRequest("/api/staff/kitchens", requestInit(init)),
  );
}

function askOne(id: string, init: AskInit = {}): Promise<NextResponse> {
  return oneModule.GET(
    accountRequest("/api/staff/kitchens/x", requestInit(init)),
    { params: Promise.resolve({ id }) },
  );
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

function heldRows() {
  return staffWorld.audit.heldEvents();
}

function headerTextOf(answer: Response): string {
  return [...answer.headers]
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

function everythingOf(answer: Response, body: string): string {
  return `${headerTextOf(answer)}\n${body}`;
}

function spyOnConsole(): unknown[][] {
  const calls: unknown[][] = [];
  for (const method of [
    "debug",
    "error",
    "info",
    "log",
    "trace",
    "warn",
  ] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args);
    });
  }
  return calls;
}

function aGate() {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}

async function isSettledAfterAWhile(
  pending: Promise<unknown>,
): Promise<boolean> {
  let isSettled = false;
  void pending.then(
    () => {
      isSettled = true;
    },
    () => {
      isSettled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  return isSettled;
}

// ---------------------------------------------------------------------------------------------------------------------

describe("the audit write gates the body", () => {
  it("sends no list answer while the audit row is still being written, and sends the page once it commits", async () => {
    const { session } = await signedInOperator();
    plantKitchen({});
    const gate = aGate();
    const record = vi
      .spyOn(staffWorld.auditPort, "record")
      .mockImplementation(() => gate.opened);

    const pending = askList({ cookie: session.cookie });

    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledTimes(1);
    });
    expect(await isSettledAfterAWhile(pending)).toBe(false);
    gate.release();
    expect((await pending).status).toBe(200);
  });

  it("sends no kitchen while the audit row is still being written, and sends it once it commits", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({});
    const gate = aGate();
    const record = vi
      .spyOn(staffWorld.auditPort, "record")
      .mockImplementation(() => gate.opened);

    const pending = askOne(kitchen.id, { cookie: session.cookie });

    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledTimes(1);
    });
    expect(await isSettledAfterAWhile(pending)).toBe(false);
    gate.release();
    expect((await pending).status).toBe(200);
  });

  it("hands the audit store the live session's token hash and no actor, kitchen text or search text", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ name: "Bucatarie-nume-9917" });
    const record = vi.spyOn(staffWorld.auditPort, "record");

    await askList({ cookie: session.cookie, search: "?q=Quasar-9917" });
    await askOne(kitchen.id, { cookie: session.cookie });

    const asked = record.mock.calls.map(([call]) => call);
    expect(asked).toHaveLength(2);
    for (const call of asked) {
      expect(Object.keys(call).sort()).toEqual([
        "designId",
        "entry",
        "idleLifetimeSeconds",
        "sessionTokenHash",
        "subjectAccountId",
      ]);
      expect(call.sessionTokenHash).toBe(session.tokenHash);
      expect(JSON.stringify(call)).not.toContain("Quasar");
      expect(JSON.stringify(call.entry)).not.toContain("Bucatarie");
    }
  });
});

describe("a body that cannot be shaped costs no audit row and sends nothing", () => {
  const INVALID_INSTANT = new Date(Number.NaN);

  it.each([
    ["an updated-at that is no date", { updatedAt: INVALID_INSTANT }],
    ["a sent-at that is no date", { sentAt: INVALID_INSTANT }],
  ])(
    "answers the list 503 for a row with %s, without asking the audit store",
    async (_title, fields) => {
      const { session } = await signedInOperator();
      const client = plantClient({ email: "shape-fails@example.test" });
      plantKitchen({ accountId: client.id, name: "Nume-9917", ...fields });

      const answer = await askList({ cookie: session.cookie });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      const text = everythingOf(answer, await answer.clone().text());
      expect(text).not.toContain("shape-fails@example.test");
      expect(text).not.toContain("Nume-9917");
      expect(staffWorld.calls).toEqual(["reader.listPage"]);
      expect(heldRows()).toEqual([]);
    },
  );

  it.each([
    [
      "an updated-at that is no date",
      (id: string) =>
        Promise.resolve(plantKitchen({ id, updatedAt: INVALID_INSTANT })),
    ],
    [
      "a sent-at that is no date",
      (id: string) =>
        Promise.resolve(plantKitchen({ id, sentAt: INVALID_INSTANT })),
    ],
    [
      "a request whose sent-at is no date",
      (id: string) => {
        plantKitchen({ id });
        staffWorld.reader.plantRequest({
          clientRequestId: aDesignId(),
          designId: id,
          reference: "LM-2026-0042",
          createdAt: INVALID_INSTANT,
        });
        return Promise.resolve();
      },
    ],
    [
      "a status whose change instant is no date",
      async (id: string) => {
        const staff = await signedInOperator("author@example.test");
        plantKitchen({ id });
        staffWorld.reader.plantStatus({
          designId: id,
          status: "contacted",
          changedByAccountId: staff.account.id,
          changedAt: INVALID_INSTANT,
        });
      },
    ],
    [
      "a note whose instant is no date",
      async (id: string) => {
        const staff = await signedInOperator("author@example.test");
        plantKitchen({ id });
        staffWorld.reader.plantNote({
          id: aDesignId(),
          designId: id,
          authorAccountId: staff.account.id,
          text: "Nota-9917",
          createdAt: INVALID_INSTANT,
        });
      },
    ],
  ])(
    "answers one kitchen 503 for %s, without asking the audit store",
    async (_title, plant) => {
      const { session } = await signedInOperator();
      const id = aDesignId();
      await plant(id);

      const answer = await askOne(id, { cookie: session.cookie });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(await answer.clone().text()).not.toContain("Nota-9917");
      expect(staffWorld.calls).toEqual(["reader.readOne"]);
      expect(heldRows()).toEqual([]);
    },
  );

  it.each([
    ["a page with no kitchens member", {}],
    ["a page whose kitchens hold a null", { kitchens: [null] }],
  ])(
    "answers the list 503, with no row, for a reader that returns %s",
    async (_title, page) => {
      const { session } = await signedInOperator();
      vi.spyOn(staffWorld.readerPort, "listPage").mockResolvedValue({
        total: 1,
        page: 1,
        pageSize: STAFF_KITCHEN_PAGE_SIZE,
        ...page,
      } as never);

      const answer = await askList({ cookie: session.cookie });

      expect(answer.status).toBe(503);
      expect(heldRows()).toEqual([]);
    },
  );

  it.each([
    ["no reading at all", undefined],
    ["a found reading with no kitchen", { kind: "found" }],
  ])(
    "answers one kitchen 503, never 404, with no row, for a reader that returns %s",
    async (_title, reading) => {
      const { session } = await signedInOperator();
      vi.spyOn(staffWorld.readerPort, "readOne").mockResolvedValue(
        reading as never,
      );

      const answer = await askOne(aDesignId(), { cookie: session.cookie });

      expect(answer.status).toBe(503);
      expect(heldRows()).toEqual([]);
    },
  );
});

describe("the order of the checks, beyond the developer's table", () => {
  it("reads the role afresh on every request: a demoted operator is refused on both routes, with nothing asked of the reader or the bucket", async () => {
    const { account, session } = await signedInOperator();
    const kitchen = plantKitchen({});
    expect((await askList({ cookie: session.cookie })).status).toBe(200);
    expect((await askOne(kitchen.id, { cookie: session.cookie })).status).toBe(
      200,
    );
    staffWorld.calls.length = 0;
    limiterLedger.counted.length = 0;
    world.accounts.setRoleOf(account.id, "client");

    const list = await askList({ cookie: session.cookie });
    const one = await askOne(kitchen.id, { cookie: session.cookie });

    expect([list.status, one.status]).toEqual([403, 403]);
    expect(staffWorld.calls).toEqual([]);
    expect(limiterLedger.counted).not.toContain(STAFF_LIST_POLICY_NAME);
    expect(heldRows()).toHaveLength(2);
    world.accounts.setRoleOf(account.id, "administrator");
    expect((await askList({ cookie: session.cookie })).status).toBe(200);
  });

  it("serves an operator and an administrator alike, and writes the actor each time", async () => {
    const operator = await signedInOperator("op@example.test");
    const administrator = await signedInAs(
      { role: "administrator" },
      "admin@example.test",
    );
    const kitchen = plantKitchen({});

    const answers = [
      await askList({ cookie: operator.session.cookie }),
      await askList({ cookie: administrator.session.cookie }),
      await askOne(kitchen.id, { cookie: operator.session.cookie }),
      await askOne(kitchen.id, { cookie: administrator.session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    expect(heldRows().map(({ actorAccountId }) => actorAccountId)).toEqual([
      operator.account.id,
      administrator.account.id,
      operator.account.id,
      administrator.account.id,
    ]);
  });

  it("answers 503, not 401, when the session store answers nothing at all", async () => {
    const { session } = await signedInOperator();
    world.intercept("sessions.findLive", () => Promise.resolve(undefined));

    const answers = [
      await askList({ cookie: session.cookie }),
      await askOne(aDesignId(), { cookie: session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([503, 503]);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers a session store that fails with 503 even when the query is wrong or the id is malformed", async () => {
    const { session } = await signedInOperator();
    world.failOn("sessions.findLive");

    const answers = [
      await askList({ cookie: session.cookie, search: "?page=0" }),
      await askOne("not-an-id", { cookie: session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([503, 503]);
  });
});

describe("the cross-site guard on both routes", () => {
  it.each([
    [
      "a foreign Origin and no Sec-Fetch-Site",
      { origin: "https://evil.example" },
    ],
    ["the Origin text null and no Sec-Fetch-Site", { origin: "null" }],
    [
      "a same-site sibling Origin and no Sec-Fetch-Site",
      { origin: "https://shop.lemnaria.test" },
    ],
  ])(
    "refuses %s before anything is counted, read or asked",
    async (_title, headers) => {
      const { session } = await signedInOperator();
      const kitchen = plantKitchen({});
      world.calls.length = 0;
      limiterLedger.counted.length = 0;
      const init = { cookie: session.cookie, secFetchSite: null, headers };

      const answers = [await askList(init), await askOne(kitchen.id, init)];

      for (const answer of answers) {
        expect(answer.status).toBe(403);
        expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
      }
      expect(world.calls).toEqual([]);
      expect(staffWorld.calls).toEqual([]);
      expect(limiterLedger.counted).toEqual([]);
    },
  );

  it.each([
    [
      "the site's own Origin and no Sec-Fetch-Site",
      { origin: "https://lemnaria.test" },
    ],
    ["neither header", {}],
  ])("serves a request with %s", async (_title, headers) => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({});
    const init = { cookie: session.cookie, secFetchSite: null, headers };

    const answers = [await askList(init), await askOne(kitchen.id, init)];

    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
  });

  it("trusts Sec-Fetch-Site over a foreign Origin, as the shared predicate documents", async () => {
    const { session } = await signedInOperator();

    const answer = await askList({
      cookie: session.cookie,
      secFetchSite: "same-origin",
      headers: { origin: "https://evil.example" },
    });

    expect(answer.status).toBe(200);
  });

  it("exports GET alone and the two route options, so no other method is a handler of ours", () => {
    for (const routeModule of [listModule, oneModule]) {
      expect(Object.keys(routeModule).sort()).toEqual([
        "GET",
        "dynamic",
        "runtime",
      ]);
      expect(routeModule.runtime).toBe("nodejs");
      expect(routeModule.dynamic).toBe("force-dynamic");
    }
  });
});

describe("every answer is private, no-store and sets no cookie", () => {
  const SECRET_EMAIL = "client-secret-9917@example.test";
  const SECRET_NAME = "Nume-Client-9917";
  const SECRET_PHONE = "+37369009917";
  const SECRET_KITCHEN_NAME = "Bucatarie-Secreta-9917";

  interface Route {
    readonly title: string;
    readonly isList: boolean;
    ask(init: AskInit, id?: string): Promise<NextResponse>;
  }

  interface Scenario {
    readonly title: string;
    readonly status: number;
    readonly appliesTo: "both" | "list" | "one";
    readonly run: (route: Route, kitchenId: string) => Promise<NextResponse>;
  }

  const ROUTES: readonly Route[] = [
    { title: "the list", isList: true, ask: (init) => askList(init) },
    {
      title: "one kitchen",
      isList: false,
      ask: (init, id = "") => askOne(id, init),
    },
  ];

  async function operatorCookie(): Promise<string> {
    return (await signedInOperator()).session.cookie;
  }

  const SCENARIOS: readonly Scenario[] = [
    {
      title: "served",
      status: 200,
      appliesTo: "both",
      run: async (route, id) =>
        route.ask({ cookie: await operatorCookie() }, id),
    },
    {
      title: "a refused query",
      status: 400,
      appliesTo: "list",
      run: async (route) =>
        route.ask({ cookie: await operatorCookie(), search: "?segment=bad" }),
    },
    {
      title: "no session",
      status: 401,
      appliesTo: "both",
      run: (route, id) => route.ask({}, id),
    },
    {
      title: "a client's session",
      status: 403,
      appliesTo: "both",
      run: async (route, id) => {
        const client = await signedInAs({ role: "client" });
        return route.ask({ cookie: client.session.cookie }, id);
      },
    },
    {
      title: "a cross-site request",
      status: 403,
      appliesTo: "both",
      run: async (route, id) =>
        route.ask(
          { cookie: await operatorCookie(), secFetchSite: "cross-site" },
          id,
        ),
    },
    {
      title: "an id that names nothing",
      status: 404,
      appliesTo: "one",
      run: async (route) =>
        route.ask({ cookie: await operatorCookie() }, aDesignId()),
    },
    {
      title: "the network read limit",
      status: 429,
      appliesTo: "both",
      run: async (route, id) => {
        limiterLedger.refusing.set(READ_POLICY_NAME, 1);
        return route.ask({ cookie: await operatorCookie() }, id);
      },
    },
    {
      title: "the account's page bucket",
      status: 429,
      appliesTo: "list",
      run: async (route) => {
        limiterLedger.refusing.set(STAFF_LIST_POLICY_NAME, 1);
        return route.ask({ cookie: await operatorCookie() });
      },
    },
    {
      title: "a page bucket that cannot be counted",
      status: 503,
      appliesTo: "list",
      run: async (route) => {
        limiterLedger.unavailable.add(STAFF_LIST_POLICY_NAME);
        return route.ask({ cookie: await operatorCookie() });
      },
    },
    {
      title: "a session store that is down",
      status: 503,
      appliesTo: "both",
      run: async (route, id) => {
        const cookie = await operatorCookie();
        world.failOn("sessions.findLive");
        return route.ask({ cookie }, id);
      },
    },
    {
      title: "an audit row that cannot be written",
      status: 503,
      appliesTo: "both",
      run: async (route, id) => {
        staffWorld.auditBehaviour = "reject";
        return route.ask({ cookie: await operatorCookie() }, id);
      },
    },
    {
      title: "a reader that is down",
      status: 503,
      appliesTo: "both",
      run: async (route, id) => {
        staffWorld.failReader = true;
        return route.ask({ cookie: await operatorCookie() }, id);
      },
    },
    {
      title: "a body that cannot be shaped",
      status: 503,
      appliesTo: "both",
      run: async (route, id) => {
        plantKitchen({
          id,
          accountId: client.id,
          name: SECRET_KITCHEN_NAME,
          updatedAt: new Date(Number.NaN),
        });
        return route.ask({ cookie: await operatorCookie() }, id);
      },
    },
  ];

  let client: ReturnType<typeof plantClient>;
  let kitchenId: string;

  beforeEach(() => {
    client = plantClient({
      email: SECRET_EMAIL,
      name: SECRET_NAME,
      phone: SECRET_PHONE,
    });
    kitchenId = plantKitchen({
      accountId: client.id,
      name: SECRET_KITCHEN_NAME,
    }).id;
  });

  const CASES = ROUTES.flatMap((route) =>
    SCENARIOS.filter(
      ({ appliesTo }) =>
        appliesTo === "both" || appliesTo === (route.isList ? "list" : "one"),
    ).map((scenario) => ({
      name: `${route.title} answers ${String(scenario.status)} for ${scenario.title} with private, no-store and no cookie`,
      route,
      scenario,
    })),
  );

  it.each(CASES)("$name", async ({ route, scenario }) => {
    const answer = await scenario.run(route, kitchenId);
    const text = await answer.clone().text();

    expect(answer.status).toBe(scenario.status);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(answer.headers.getSetCookie()).toEqual([]);
    for (const absent of [
      "etag",
      "last-modified",
      "location",
      "expires",
      "age",
    ]) {
      expect(answer.headers.get(absent)).toBeNull();
    }
    expect(answer.headers.get("content-type")).toMatch(/^application\/json/);
    expect(answer.headers.get("retry-after") !== null).toBe(
      scenario.status === 429,
    );
    if (scenario.status !== 200) {
      const seen = everythingOf(answer, text);
      for (const secret of [
        SECRET_EMAIL,
        SECRET_NAME,
        SECRET_PHONE,
        SECRET_KITCHEN_NAME,
        client.id,
      ]) {
        expect(seen).not.toContain(secret);
      }
      if (scenario.status !== 404) expect(seen).not.toContain(kitchenId);
    }
  });
});

describe("what the log and the audit rows may hold", () => {
  const CLIENT_EMAIL = "log-client-9917@example.test";
  const CLIENT_NAME = "Nume-Log-9917";
  const CLIENT_PHONE = "+37369019917";
  const KITCHEN_NAME = "Bucatarie-Log-9917";

  it("writes only closed [account] lines, and no address, name, phone, id, session value or network address, over every outcome", async () => {
    const consoleCalls = spyOnConsole();
    const { account, session } = await signedInOperator(
      "log-operator-9917@example.test",
    );
    const client = plantClient({
      email: CLIENT_EMAIL,
      name: CLIENT_NAME,
      phone: CLIENT_PHONE,
    });
    const kitchen = plantKitchen({ accountId: client.id, name: KITCHEN_NAME });
    const clientSession = await signedInAs(
      { role: "client" },
      "log-client2-9917@example.test",
    );
    const search = "?q=Nimeni-9917%00";

    await askList({ cookie: session.cookie });
    await askList({ cookie: session.cookie, search });
    await askList({ cookie: session.cookie, search: `?q=${CLIENT_NAME}` });
    await askList({ cookie: clientSession.session.cookie });
    await askList();
    await askOne(kitchen.id, { cookie: session.cookie });
    await askOne(aDesignId(), { cookie: session.cookie });
    await askOne("not an id", { cookie: session.cookie });
    await askOne(kitchen.id, { cookie: clientSession.session.cookie });
    limiterLedger.refusing.set(STAFF_LIST_POLICY_NAME, 1);
    await askList({ cookie: session.cookie });
    limiterLedger.refusing.clear();
    staffWorld.auditBehaviour = "reject";
    await askList({ cookie: session.cookie });
    await askOne(kitchen.id, { cookie: session.cookie });

    expect(consoleCalls.length).toBeGreaterThan(8);
    for (const [label, line, ...rest] of consoleCalls) {
      expect(label).toBe("[account]");
      expect(rest).toEqual([]);
      expect(
        Object.keys(line as object).every((key) =>
          ["event", "outcome", "policy"].includes(key),
        ),
      ).toBe(true);
      expect(ACCOUNT_EVENTS).toContain((line as { event: string }).event);
    }
    const logged = JSON.stringify(consoleCalls);
    for (const secret of [
      CLIENT_EMAIL,
      CLIENT_NAME,
      CLIENT_PHONE,
      KITCHEN_NAME,
      kitchen.id,
      client.id,
      account.id,
      session.value,
      NETWORK_ADDRESS,
      "Nimeni",
      DRIVER_FAILURE_MARKER,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  const A_BREVE = String.fromCodePoint(0x103);
  const S_COMMA = String.fromCodePoint(0x218);
  const S_CEDILLA = String.fromCodePoint(0x15e);
  const COMBINING_BREVE = String.fromCodePoint(0x306);
  const COMBINING_COMMA_BELOW = String.fromCodePoint(0x326);
  const CEDILLA_TO_COMMA_BELOW: readonly (readonly [number, number])[] = [
    [0x15e, 0x218],
    [0x15f, 0x219],
    [0x162, 0x21a],
    [0x163, 0x21b],
  ];

  const SEARCHES = [
    ["an ASCII marker", "Quasar-Nimeni-9917"],
    ["accented letters, composed", `Zoril${A_BREVE}-${S_COMMA}oim-9917`],
    [
      "the same letters, decomposed",
      `Zorila${COMBINING_BREVE}-S${COMBINING_COMMA_BELOW}oim-9917`,
    ],
    ["a cedilla spelling", `Zoril${A_BREVE}-${S_CEDILLA}oim-9917`],
    ["an e-mail shape", "nimeni.nu.il.cauta-9917@example.test"],
  ] as const;

  function foldedToCommaBelow(text: string): string {
    return CEDILLA_TO_COMMA_BELOW.reduce(
      (folded, [cedilla, commaBelow]) =>
        folded.replaceAll(
          String.fromCodePoint(cedilla),
          String.fromCodePoint(commaBelow),
        ),
      text,
    );
  }

  function spellingsOf(text: string): string[] {
    const folded = foldedToCommaBelow(text);
    const forms = [
      text,
      text.normalize("NFC"),
      text.normalize("NFD"),
      folded,
      folded.normalize("NFD"),
    ];
    return [
      ...new Set(
        forms.flatMap((form) => [
          form,
          form.toLowerCase(),
          form.toUpperCase(),
          encodeURIComponent(form),
          encodeURIComponent(form.toLowerCase()),
        ]),
      ),
    ];
  }

  it.each(SEARCHES)(
    "never records %s in an audit row, a log line or a header, only that a search was made",
    async (_title, text) => {
      const consoleCalls = spyOnConsole();
      const { session } = await signedInOperator();
      plantKitchen({ accountId: plantClient({ name: "Altcineva" }).id });

      const answers = [
        await askList({
          cookie: session.cookie,
          search: `?q=${encodeURIComponent(text)}`,
        }),
        await askList({ cookie: session.cookie, search: `?q=${text}` }),
        await askList({
          cookie: session.cookie,
          search: `?q=${encodeURIComponent(text.normalize("NFD"))}`,
        }),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(200);
        const seen = everythingOf(answer, await answer.clone().text());
        for (const spelling of spellingsOf(text)) {
          expect(seen).not.toContain(spelling);
          expect(JSON.stringify(heldRows())).not.toContain(spelling);
          expect(JSON.stringify(consoleCalls)).not.toContain(spelling);
        }
      }
      expect(heldRows().map(({ detail }) => detail)).toEqual([
        {
          segment: "sent",
          status: null,
          page: 1,
          rowCount: 0,
          hasSearch: true,
        },
        {
          segment: "sent",
          status: null,
          page: 1,
          rowCount: 0,
          hasSearch: true,
        },
        {
          segment: "sent",
          status: null,
          page: 1,
          rowCount: 0,
          hasSearch: true,
        },
      ]);
    },
  );

  it("keeps the matching client's address out of the audit row and the log even though the page shows it", async () => {
    const consoleCalls = spyOnConsole();
    const { session } = await signedInOperator();
    const client = plantClient({ email: CLIENT_EMAIL, name: CLIENT_NAME });
    plantKitchen({ accountId: client.id });

    const answer = await askList({
      cookie: session.cookie,
      search: `?q=${CLIENT_EMAIL}`,
    });

    expect(answer.status).toBe(200);
    expect(await answer.clone().text()).toContain(CLIENT_EMAIL);
    expect(JSON.stringify(heldRows())).not.toContain(CLIENT_EMAIL);
    expect(JSON.stringify(heldRows())).not.toContain(client.id);
    expect(JSON.stringify(consoleCalls)).not.toContain(CLIENT_EMAIL);
    expect(headerTextOf(answer)).not.toContain(CLIENT_EMAIL);
  });

  it.each([
    ["no q at all", ""],
    ["an empty q", "?q="],
    ["a q of spaces", "?q=%20%20%20"],
    ["a q of a no-break space", "?q=%C2%A0"],
    ["a q of a zero-width space", "?q=%E2%80%8B"],
    ["a q of a bidi override", "?q=%E2%80%AE"],
    ["a q of a soft hyphen and spaces", "?q=%20%C2%AD%20"],
  ])(
    "records hasSearch false and does not filter for %s",
    async (_title, search) => {
      const { session } = await signedInOperator();
      plantKitchen({ accountId: plantClient({ name: "Ana" }).id });
      plantKitchen({ accountId: plantClient({ name: "Ion" }).id });

      const answer = await askList({ cookie: session.cookie, search });

      expect(answer.status).toBe(200);
      expect(((await jsonOf(answer)) as { total: number }).total).toBe(2);
      expect(heldRows()[0]?.detail).toMatchObject({
        hasSearch: false,
        rowCount: 2,
      });
    },
  );

  it.each([
    ["a single zero", "?q=0"],
    ["a letter between spaces", "?q=%20a%20"],
    ["a letter between zero-width spaces", "?q=%E2%80%8Ba%E2%80%8B"],
  ])("records hasSearch true for %s", async (_title, search) => {
    const { session } = await signedInOperator();

    await askList({ cookie: session.cookie, search });

    expect(heldRows()[0]?.detail).toMatchObject({ hasSearch: true });
  });

  it("names the client's account on a kitchen-opened row only while the client resolves, and the kitchen's own id always", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const owned = plantKitchen({ accountId: client.id });
    const erasedClient = plantClient();
    const erased = plantKitchen({ accountId: erasedClient.id });
    staffWorld.reader.removeAccount(erasedClient.id);
    const leadWithoutAccount = plantKitchen({ accountId: null });

    for (const kitchen of [owned, erased, leadWithoutAccount]) {
      expect(
        (await askOne(kitchen.id, { cookie: session.cookie })).status,
      ).toBe(200);
    }

    expect(
      heldRows().map(({ designId, subjectAccountId }) => [
        designId,
        subjectAccountId,
      ]),
    ).toEqual([
      [owned.id, client.id],
      [erased.id, null],
      [leadWithoutAccount.id, null],
    ]);
  });

  it("counts a row for each page it serves: rowCount equals the rows in the body, across the pages and the segments", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    for (let index = 0; index < 45; index += 1) {
      plantKitchen({
        accountId: index % 3 === 0 ? null : client.id,
        isSent: index % 2 === 0,
        updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)),
        sentAt:
          index % 2 === 0 ? new Date(Date.UTC(2026, 9, 1, 0, 0, index)) : null,
      });
    }

    for (const segment of ["sent", "drafts", "all"]) {
      for (const page of [1, 2, 3, 4]) {
        const answer = await askList({
          cookie: session.cookie,
          search: `?segment=${segment}&page=${String(page)}`,
        });
        const body = (await jsonOf(answer)) as { kitchens: unknown[] };
        expect(heldRows().at(-1)?.detail).toEqual({
          segment,
          status: null,
          page,
          rowCount: body.kitchens.length,
          hasSearch: false,
        });
      }
    }
    expect(heldRows()).toHaveLength(12);
  });
});

describe("the wire contract's key sets against a hostile reader", () => {
  const LEAK = "MUST-NOT-LEAK-9917";
  const THUMBNAIL_KEYS = [
    "columnExtents",
    "emptyColumns",
    "placements",
    "room",
    "settings",
  ];

  function hostile<Shape extends object>(
    shape: Shape,
    touched: string[],
    label: string,
  ): Shape {
    const copy = { ...shape } as Record<string, unknown>;
    for (const [name, value] of Object.entries({
      id: `${LEAK}-id`,
      accountId: `${LEAK}-account`,
      visitorHash: `${LEAK}-visitor`,
      passwordHash: `${LEAK}-password`,
      postalAddress: `${LEAK}-address`,
      tokenHash: `${LEAK}-token`,
    })) {
      if (!(name in copy)) copy[name] = value;
    }
    Object.defineProperty(copy, "readOnlyByAGetter", {
      enumerable: true,
      get() {
        touched.push(label);
        return LEAK;
      },
    });
    Object.defineProperty(copy, "toJSON", {
      enumerable: false,
      value() {
        touched.push(`${label}.toJSON`);
        return { leaked: LEAK };
      },
    });
    Object.defineProperty(copy, "__proto__", {
      enumerable: true,
      value: { inherited: LEAK },
    });
    return copy as Shape;
  }

  function keysOf(value: unknown): string[] {
    return Object.keys(value as object).sort();
  }

  it("sends a list row, its client and its page with exactly the contract's members", async () => {
    const { session } = await signedInOperator();
    const touched: string[] = [];
    const client = hostile(
      {
        id: `${LEAK}-client-id`,
        email: "seen@example.test",
        name: null,
        phone: "+373",
      },
      touched,
      "client",
    );
    const design = {
      ...aDesign("thumb"),
      accountId: `${LEAK}-design-account`,
      sentCopyToken: `${LEAK}-design-token`,
    };
    const row = hostile(
      {
        id: aDesignId(),
        name: "Nume",
        design,
        client,
        isSent: true,
        isHidden: false,
        sentAt: SENT_AT,
        updatedAt: UPDATED_AT,
        requestStatus: "new",
      },
      touched,
      "row",
    );
    const page = hostile(
      { total: 1, page: 1, pageSize: STAFF_KITCHEN_PAGE_SIZE, kitchens: [row] },
      touched,
      "page",
    );
    vi.spyOn(staffWorld.readerPort, "listPage").mockResolvedValue(
      page as never,
    );

    const answer = await askList({ cookie: session.cookie });
    const text = await answer.clone().text();
    const body = JSON.parse(text) as {
      kitchens: { client: unknown; design: unknown }[];
    };

    expect(answer.status).toBe(200);
    expect(keysOf(body)).toEqual(["kitchens", "page", "pageSize", "total"]);
    expect(keysOf(body.kitchens[0])).toEqual([
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
    expect(keysOf(body.kitchens[0]?.client)).toEqual([
      "email",
      "name",
      "phone",
    ]);
    for (const key of keysOf(body.kitchens[0]?.design)) {
      expect(THUMBNAIL_KEYS).toContain(key);
    }
    expect(text).not.toContain(LEAK);
    expect(touched).toEqual([]);
  });

  it("sends one kitchen with exactly the contract's members at every depth", async () => {
    const { session } = await signedInOperator();
    const touched: string[] = [];
    const clientAccountId = aDesignId();
    const person = (label: string) =>
      hostile(
        { id: `${LEAK}-${label}`, email: `${label}@example.test`, name: label },
        touched,
        label,
      );
    const detail = hostile(
      {
        id: aDesignId(),
        name: "Nume",
        design: aDesign("current"),
        asSent: aDesign("sent"),
        isSent: true,
        isHidden: true,
        sentAt: SENT_AT,
        updatedAt: UPDATED_AT,
        client: hostile(
          {
            id: clientAccountId,
            email: "c@example.test",
            name: "C",
            phone: null,
          },
          touched,
          "client",
        ),
        request: hostile(
          { reference: "LM-1", sentAt: SENT_AT },
          touched,
          "request",
        ),
        status: hostile(
          {
            value: "contacted",
            change: hostile(
              { by: person("changer"), at: SENT_AT },
              touched,
              "change",
            ),
          },
          touched,
          "status",
        ),
        notes: [
          hostile(
            {
              id: aDesignId(),
              text: "Nota",
              createdAt: SENT_AT,
              author: person("author"),
            },
            touched,
            "note",
          ),
        ],
        notesTruncated: false,
      },
      touched,
      "detail",
    );
    vi.spyOn(staffWorld.readerPort, "readOne").mockResolvedValue({
      kind: "found",
      kitchen: detail,
    } as never);

    const answer = await askOne(aDesignId(), { cookie: session.cookie });
    const text = await answer.clone().text();
    const body = JSON.parse(text) as Record<string, Record<string, unknown>>;

    expect(answer.status).toBe(200);
    expect(keysOf(body)).toEqual([
      "client",
      "kitchen",
      "notes",
      "notesTruncated",
      "request",
      "status",
    ]);
    expect(keysOf(body.kitchen)).toEqual([
      "asSent",
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "sentAt",
      "updatedAt",
    ]);
    expect(keysOf(body.client)).toEqual(["email", "name", "phone"]);
    expect(text).not.toContain(clientAccountId);
    expect(keysOf(body.request)).toEqual(["reference", "sentAt"]);
    expect(keysOf(body.status)).toEqual(["changedAt", "changedBy", "value"]);
    expect(keysOf(body.status?.changedBy)).toEqual(["email", "name"]);
    expect(body.status?.changedAt).toBe(SENT_AT.toISOString());
    const notes = body.notes as unknown as { author: unknown }[];
    expect(keysOf(notes[0])).toEqual(["author", "createdAt", "id", "text"]);
    expect(keysOf(notes[0]?.author)).toEqual(["email", "name"]);
    expect(text).not.toContain(LEAK);
    expect(touched).toEqual([]);
  });

  it("names the kitchen's own id in the body, never an account id, over a client, a status author and a note author", async () => {
    const staff = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchen({ accountId: client.id });
    staffWorld.reader.plantStatus({
      designId: kitchen.id,
      status: "offer-sent",
      changedByAccountId: staff.account.id,
      changedAt: SENT_AT,
    });
    staffWorld.reader.plantNote({
      id: aDesignId(),
      designId: kitchen.id,
      authorAccountId: staff.account.id,
      text: "Nota",
      createdAt: SENT_AT,
    });

    const one = await (
      await askOne(kitchen.id, { cookie: staff.session.cookie })
    )
      .clone()
      .text();
    const list = await (await askList({ cookie: staff.session.cookie }))
      .clone()
      .text();

    for (const text of [one, list]) {
      expect(text).not.toContain(client.id);
      expect(text).not.toContain(staff.account.id);
    }
  });
});

describe("the query, at the route", () => {
  async function plantTwoClients() {
    const alfa = plantClient({
      name: "Alfa-Unic-9917",
      email: "alfa@example.test",
    });
    const beta = plantClient({
      name: "Beta-Unic-9917",
      email: "beta@example.test",
    });
    plantKitchen({ accountId: alfa.id });
    plantKitchen({ accountId: beta.id });
    return signedInOperator();
  }

  async function bodyOfList(search: string, cookie: string) {
    const answer = await askList({ cookie, search });
    return {
      answer,
      body: (await jsonOf(answer)) as { total: number; page: number },
    };
  }

  it("reads the first of a repeated member, and ignores arrays and members of another case", async () => {
    const { session } = await plantTwoClients();

    const first = await bodyOfList("?q=Alfa&q=Beta", session.cookie);
    const emptyFirst = await bodyOfList("?q=&q=Beta", session.cookie);
    const bracketed = await bodyOfList(
      "?q[]=Alfa&Q=Alfa&Segment=drafts&PAGE=9",
      session.cookie,
    );

    expect(first.body.total).toBe(1);
    expect(heldRows()[0]?.detail).toMatchObject({ hasSearch: true });
    expect(emptyFirst.body.total).toBe(2);
    expect(heldRows()[1]?.detail).toMatchObject({ hasSearch: false });
    expect([
      bracketed.answer.status,
      bracketed.body.total,
      bracketed.body.page,
    ]).toEqual([200, 2, 1]);
  });

  it.each([
    ["an upper-case segment", "?segment=ALL", "segment"],
    ["a segment with a trailing space", "?segment=sent%20", "segment"],
    ["a segment spelled in a different case", "?segment=Sent", "segment"],
    ["an upper-case status", "?status=NEW", "status"],
    ["a status with the all segment", "?segment=all&status=new", "status"],
    [
      "a status with the drafts segment",
      "?segment=drafts&status=closed",
      "status",
    ],
  ])("answers 400 for %s", async (_title, search, field) => {
    const { session } = await signedInOperator();

    const answer = await askList({ cookie: session.cookie, search });

    expect(answer.status).toBe(400);
    expect(
      ((await jsonOf(answer)) as { issues: { field: string }[] }).issues.map(
        (issue) => issue.field,
      ),
    ).toEqual([field]);
    expect(staffWorld.calls).toEqual([]);
  });

  it.each(REQUEST_STATUSES)(
    "filters the sent segment by the status %s and records the code",
    async (status) => {
      const { session } = await signedInOperator();

      const answer = await askList({
        cookie: session.cookie,
        search: `?segment=sent&status=${status}`,
      });

      expect(answer.status).toBe(200);
      expect(heldRows()[0]?.detail).toMatchObject({ segment: "sent", status });
    },
  );

  it.each([
    ["an empty page", "?page=", 1],
    ["page 1", "?page=1", 1],
    ["a page with a leading plus", "?page=%2B1", null],
    ["a decimal page", "?page=1.0", null],
    ["an exponent page", "?page=1e3", null],
    ["a page with a leading space", "?page=%201", null],
    ["a page with a trailing line feed", "?page=1%0A", null],
    ["a full-width digit page", "?page=%EF%BC%91", null],
    ["a Devanagari digit page", "?page=%E0%A5%A7", null],
    ["a hexadecimal page", "?page=0x10", null],
    ["a page of two zeros", "?page=00", null],
    ["a negative zero page", "?page=-0", null],
    ["a page past the safe integers", "?page=99999999999999999999999", null],
  ])("reads %s", async (_title, search, expectedPage) => {
    const { session } = await signedInOperator();

    const answer = await askList({ cookie: session.cookie, search });

    if (expectedPage === null) {
      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "page", code: "NOT_A_PAGE_NUMBER" }],
      });
    } else {
      expect(answer.status).toBe(200);
      expect(((await jsonOf(answer)) as { page: number }).page).toBe(
        expectedPage,
      );
    }
  });

  it("accepts a page exactly when its offset can be counted, over digit strings and the boundary's neighbours", async () => {
    const { session } = await signedInOperator();
    const digits = fc.string({
      unit: fc.constantFrom(..."0123456789".split("")),
      minLength: 1,
      maxLength: 20,
    });
    const nearTheBoundary = fc
      .integer({ min: -3, max: 3 })
      .map((offset) => String(OFFSETS_LARGEST_COUNTABLE_PAGE + offset));

    await fc.assert(
      fc.asyncProperty(fc.oneof(digits, nearTheBoundary), async (text) => {
        const answer = await askList({
          cookie: session.cookie,
          search: `?page=${text}`,
        });
        const isCountable =
          /^[1-9][0-9]*$/.test(text) &&
          Number.isSafeInteger(Number(text) * STAFF_KITCHEN_PAGE_SIZE);
        expect(answer.status).toBe(isCountable ? 200 : 400);
        if (isCountable) {
          expect(((await jsonOf(answer)) as { page: number }).page).toBe(
            Number(text),
          );
        } else {
          expect(await jsonOf(answer)).toEqual({
            status: "invalid-input",
            issues: [{ field: "page", code: "NOT_A_PAGE_NUMBER" }],
          });
        }
      }),
      { numRuns: 120 },
    );
  });

  it("serves the largest countable page empty and refuses the next one", async () => {
    const { session } = await signedInOperator();
    plantKitchen({});

    const last = await askList({
      cookie: session.cookie,
      search: `?page=${String(OFFSETS_LARGEST_COUNTABLE_PAGE)}`,
    });
    const beyond = await askList({
      cookie: session.cookie,
      search: `?page=${String(OFFSETS_LARGEST_COUNTABLE_PAGE + 1)}`,
    });

    expect(last.status).toBe(200);
    expect(((await jsonOf(last)) as { kitchens: unknown[] }).kitchens).toEqual(
      [],
    );
    expect(beyond.status).toBe(400);
  });

  const ASTRAL = "\u{1F600}";

  it.each([
    ["100 astral characters", ASTRAL.repeat(100), 200],
    ["101 astral characters", ASTRAL.repeat(101), 400],
    [
      "100 decomposed letters, which compose to 100",
      "e\u0301".repeat(100),
      200,
    ],
    ["101 decomposed letters", "e\u0301".repeat(101), 400],
    [
      "100 letters among format characters",
      `${"a\u200B".repeat(100)}\u202E`,
      200,
    ],
    ["101 letters among format characters", "a\u200B".repeat(101), 400],
    ["a NUL", "ab\u0000cd", 400],
    ["a line feed", "ab\ncd", 400],
    ["a line separator", "ab\u2028cd", 400],
  ])("answers %s with %i", async (_title, text, status) => {
    const { session } = await signedInOperator();

    const answer = await askList({
      cookie: session.cookie,
      search: `?q=${encodeURIComponent(text)}`,
    });

    expect(answer.status).toBe(status);
  });

  it.each([
    ["an overlong UTF-8 encoding", "%C0%AF"],
    ["an encoded surrogate half", "%ED%A0%80"],
    ["a byte that begins no character", "%FF"],
    ["a percent sign with no digits", "%"],
    ["a percent sign with one digit", "%4"],
  ])(
    "answers %s in the search with a 200 or a 400, never a failure",
    async (_title, encoded) => {
      const { session } = await signedInOperator();

      const answer = await askList({
        cookie: session.cookie,
        search: `?q=ab${encoded}cd`,
      });

      expect([200, 400]).toContain(answer.status);
    },
  );

  it("refuses a search of 100 000 characters and of a 2 MB URL with a short body that holds none of it", async () => {
    const { session } = await signedInOperator();
    const consoleCalls = spyOnConsole();

    for (const length of [100_000, 2_000_000]) {
      const marker = "needle9917";
      const text = `${marker}${"b".repeat(length)}`;
      const answer = await askList({
        cookie: session.cookie,
        search: `?q=${text}`,
      });
      const body = await answer.clone().text();

      expect(answer.status).toBe(400);
      expect(JSON.parse(body)).toEqual({
        status: "invalid-input",
        issues: [{ field: "q", code: "TOO_LONG" }],
      });
      expect(everythingOf(answer, body)).not.toContain(marker);
    }
    expect(JSON.stringify(consoleCalls)).not.toContain("needle9917");
    expect(staffWorld.calls).toEqual([]);
  });

  it("reports every wrong member by member name and code alone, and never a value", async () => {
    const { session } = await signedInOperator();

    const answer = await askList({
      cookie: session.cookie,
      search:
        "?segment=Marker9917a&status=Marker9917b&page=Marker9917c&q=%00Marker9917d",
    });

    const body = await answer.clone().text();
    expect(answer.status).toBe(400);
    const reported = JSON.parse(body) as {
      status: string;
      issues: { field: string; code: string }[];
    };
    expect(reported.status).toBe("invalid-input");
    expect(
      reported.issues.map(({ field, code }) => `${field}:${code}`).sort(),
    ).toEqual([
      "page:NOT_A_PAGE_NUMBER",
      "q:FORBIDDEN_CHARACTER",
      "segment:UNKNOWN_VALUE",
      "status:UNKNOWN_VALUE",
    ]);
    expect(
      reported.issues.every((issue) => Object.keys(issue).length === 2),
    ).toBe(true);
    expect(body).not.toContain("Marker9917");
  });
});

describe("the one refusal, over hostile ids", () => {
  const A_VALID_SHAPE = "A".repeat(21);
  const HOSTILE_IDS = [
    ["a valid shape that names nothing", A_VALID_SHAPE],
    ["20 characters", "A".repeat(20)],
    ["22 characters", "A".repeat(22)],
    ["21 characters then a line feed", `${A_VALID_SHAPE}\n`],
    ["a line feed then 21 characters", `\n${A_VALID_SHAPE}`],
    ["21 accented letters", "\u00E9".repeat(21)],
    ["a slash inside", `${"A".repeat(10)}/${"A".repeat(10)}`],
    ["an encoded slash, left as text", `%2F${"A".repeat(18)}`],
    ["two dots", ".."],
    ["a single dot", "."],
    ["a NUL", `${"A".repeat(20)}\u0000`],
    ["a bidi override", `${"A".repeat(20)}\u202E`],
    ["an empty text", ""],
    ["a space", " ".repeat(21)],
    ["10 000 characters", "A".repeat(10_000)],
    ["a script tag", `<script>alert(1)</script>${"A".repeat(5)}`],
  ] as const;

  it.each(HOSTILE_IDS)(
    "answers %s as the unknown id is answered, writes no row, sets no cookie and keeps the body short",
    async (_title, id) => {
      const { session } = await signedInOperator();

      const answer = await askOne(id, { cookie: session.cookie });
      const text = await answer.clone().text();

      expect(answer.status).toBe(404);
      expect(await wireOf(answer)).toBe(
        await wireOf(designNotFoundResponse(id)),
      );
      expect(answer.headers.getSetCookie()).toEqual([]);
      expect(text.length).toBeLessThan(500);
      expect(Object.keys(JSON.parse(text) as object)).toEqual(["error"]);
      expect(heldRows()).toEqual([]);
    },
  );

  it("asks the reader only for an id of the generator's shape", async () => {
    const { session } = await signedInOperator();

    for (const [, id] of HOSTILE_IDS)
      await askOne(id, { cookie: session.cookie });

    expect(staffWorld.calls).toEqual(["reader.readOne"]);
  });

  it("answers every unknown id with one status and one header set; only the echoed text differs", async () => {
    const { session } = await signedInOperator();
    const answers: Response[] = [];

    for (const [, id] of HOSTILE_IDS)
      answers.push(await askOne(id, { cookie: session.cookie }));

    const headerSets = new Set(
      answers.map((answer) =>
        JSON.stringify(
          [...answer.headers]
            .filter(([name]) => name !== "content-length")
            .sort(),
        ),
      ),
    );
    expect(headerSets.size).toBe(1);
    expect(new Set(answers.map(({ status }) => status))).toEqual(
      new Set([404]),
    );
  });

  it("refuses a kitchen its client deleted, and a visitor's draft, however much staff data is planted on them", async () => {
    const { session, account } = await signedInOperator();
    const client = plantClient();
    const deleted = plantKitchen({
      accountId: client.id,
      isDeletedByClient: true,
    });
    const draft = plantKitchen({ accountId: null, isSent: false });
    for (const kitchen of [deleted, draft]) {
      staffWorld.reader.plantRequest({
        clientRequestId: aDesignId(),
        designId: kitchen.id,
        reference: "LM-9917",
        createdAt: SENT_AT,
      });
      staffWorld.reader.plantStatus({
        designId: kitchen.id,
        status: "closed",
        changedByAccountId: account.id,
        changedAt: SENT_AT,
      });
      staffWorld.reader.plantNote({
        id: aDesignId(),
        designId: kitchen.id,
        authorAccountId: account.id,
        text: "Nota-9917",
        createdAt: SENT_AT,
      });
    }

    for (const kitchen of [deleted, draft]) {
      const answer = await askOne(kitchen.id, { cookie: session.cookie });
      expect(await wireOf(answer)).toBe(
        await wireOf(designNotFoundResponse(kitchen.id)),
      );
    }
    expect(heldRows()).toEqual([]);
  });

  it("pins the legacy-id behaviour: the list serves a kitchen whose id is not the generator's shape, and opening it is refused without a read", async () => {
    const { session } = await signedInOperator();
    const legacy = plantKitchen({
      id: "legacy-id01",
      accountId: plantClient().id,
    });

    const list = await askList({ cookie: session.cookie });
    const opened = await askOne(legacy.id, { cookie: session.cookie });

    expect(
      ((await jsonOf(list)) as { kitchens: { id: string }[] }).kitchens.map(
        ({ id }) => id,
      ),
    ).toEqual([legacy.id]);
    expect(opened.status).toBe(404);
    expect(staffWorld.calls).toEqual(["reader.listPage", "audit.record"]);
  });
});
