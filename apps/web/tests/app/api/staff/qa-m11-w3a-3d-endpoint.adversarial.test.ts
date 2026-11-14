import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Design } from "@lemnaria/configurator-domain";

import { STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { staffInvalidQueryResponse } from "@/lib/server/staff/staff-responses";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  aDesign,
  aDesignId,
  accountRequest,
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  SENT_AT,
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
  type StaffCaller,
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

const threeDModule = await import("@/app/api/staff/kitchens/[id]/3d/route");
const { GET, HEAD } = threeDModule;
const { GET: GET_DETAIL } = await import("@/app/api/staff/kitchens/[id]/route");
const { GET: GET_AUDIT } = await import("@/app/api/staff/audit/route");

// See ADR 0180 d2.

const OPEN_POLICY_NAME = STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY.name;
const NO_STORE = "private, no-store";

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

type RequestInit = Parameters<typeof accountRequest>[1];

function view(id: string, init: RequestInit = {}) {
  const request = accountRequest(`/api/staff/kitchens/${id}/3d`, {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
  return GET(request, { params: Promise.resolve({ id }) });
}

function openDetail(id: string, init: RequestInit = {}) {
  const request = accountRequest(`/api/staff/kitchens/${id}`, {
    ...init,
    search: "",
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
  return GET_DETAIL(request, { params: Promise.resolve({ id }) });
}

function heldRows() {
  return staffWorld.audit.heldEvents();
}

async function signedInOperator(email = "operator@example.test") {
  return signedInAs({ role: "operator" }, email);
}

function plantSentCopyOf(
  designId: string,
  design: Design | null,
  { isRevoked = false }: { isRevoked?: boolean } = {},
): void {
  const clientRequestId = aDesignId();
  staffWorld.reader.plantRequest({
    clientRequestId,
    designId,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
  });
  staffWorld.reader.plantSentCopy({
    clientRequestId,
    createdAt: SENT_AT,
    isRevoked,
    design,
  });
}

const CURRENT_DESIGN = aDesign("current-copy");
const SENT_DESIGN = aDesign("sent-copy");

describe("who may open a kitchen in 3D: the detail endpoint's answers, byte for byte (W3a-3)", () => {
  type CallerName =
    | "anonymous"
    | "a malformed cookie"
    | "a client with a confirmed address"
    | "a client with an unconfirmed address"
    | "an operator with an unconfirmed address"
    | "an administrator with an unconfirmed address"
    | "an operator idle past twelve hours"
    | "an operator whose session was revoked";

  const CALLERS: readonly [CallerName, StaffCaller | undefined][] = [
    ["anonymous", undefined],
    ["a malformed cookie", undefined],
    ["a client with a confirmed address", { role: "client" }],
    [
      "a client with an unconfirmed address",
      { role: "client", isVerified: false },
    ],
    [
      "an operator with an unconfirmed address",
      { role: "operator", isVerified: false },
    ],
    [
      "an administrator with an unconfirmed address",
      { role: "administrator", isVerified: false },
    ],
    ["an operator idle past twelve hours", { role: "operator" }],
    ["an operator whose session was revoked", { role: "operator" }],
  ];

  async function cookieOf(
    name: CallerName,
    caller: StaffCaller | undefined,
  ): Promise<string | undefined> {
    if (name === "anonymous") return undefined;
    if (name === "a malformed cookie") return cookieOfValue("short");
    if (caller === undefined) throw new Error(`no caller for ${name}`);
    const { account, session } = await signedInAs(
      caller,
      `${name.replaceAll(/[^a-z]+/g, "-")}@example.test`,
    );
    if (name === "an operator idle past twelve hours") {
      world.advance(12 * 60 * 60 * 1000 + 1000);
    }
    if (name === "an operator whose session was revoked") {
      await world.sessions.revokeAllForAccount(account.id);
    }
    return session.cookie;
  }

  it.each(CALLERS)(
    "answers %s exactly as GET /api/staff/kitchens/{id} does, with no read, no bucket and no row",
    async (name, caller) => {
      const kitchen = plantKitchen();
      const cookie = await cookieOf(name, caller);
      const init: RequestInit = cookie === undefined ? {} : { cookie };
      limiterLedger.counted.length = 0;

      const threeD = await view(kitchen.id, init);
      const detail = await openDetail(kitchen.id, init);

      expect([401, 403]).toContain(threeD.status);
      expect(await wireOf(threeD)).toBe(await wireOf(detail));
      expect(threeD.headers.get("cache-control")).toBe(NO_STORE);
      expect(staffWorld.calls).toEqual([]);
      expect(heldRows()).toEqual([]);
      expect(limiterLedger.counted).not.toContain(OPEN_POLICY_NAME);
    },
  );

  it.each(CALLERS)(
    "answers %s the same with a bogus version: admission is judged before the parameter",
    async (name, caller) => {
      const kitchen = plantKitchen();
      const cookie = await cookieOf(name, caller);
      const init: RequestInit = cookie === undefined ? {} : { cookie };

      const withBogus = await view(kitchen.id, {
        ...init,
        search: "?version=%00%00bogus&version=",
      });
      const detail = await openDetail(kitchen.id, init);

      expect(await wireOf(withBogus)).toBe(await wireOf(detail));
    },
  );

  it("answers a cross-site request exactly as the detail endpoint does, whatever the version or the id", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    const init = { cookie: session.cookie, secFetchSite: "cross-site" };

    const threeD = await view(kitchen.id, {
      ...init,
      search: "?version=bogus",
    });
    const malformed = await view("abc", init);
    const detail = await openDetail(kitchen.id, init);

    expect(threeD.status).toBe(403);
    expect(await wireOf(threeD)).toBe(await wireOf(detail));
    expect(await wireOf(malformed)).toBe(await wireOf(detail));
  });

  it.each([["same-site"], ["none"], ["cross-site"], ["CROSS-SITE"]])(
    "spends no reads-limiter hit, bucket or row on Sec-Fetch-Site %s when it is refused, with the network source known",
    async (site) => {
      const { session } = await signedInOperator();
      const kitchen = plantKitchen();
      limiterLedger.counted.length = 0;
      world.calls.length = 0;

      const answer = await view(kitchen.id, {
        cookie: session.cookie,
        secFetchSite: site,
      });

      if (answer.status === 403) {
        expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
        expect(limiterLedger.counted).toEqual([]);
        expect(world.calls).toEqual([]);
        expect(staffWorld.calls).toEqual([]);
        expect(heldRows()).toEqual([]);
      }
      expect(answer.headers.get("cache-control")).toBe(NO_STORE);
    },
  );

  it("counts the cross-site request in nothing even when the network source is known and the caller is anonymous", async () => {
    const kitchen = plantKitchen();
    limiterLedger.counted.length = 0;

    const answer = await view(kitchen.id, { secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).toEqual([]);
  });
});

describe("the reads limiter comes before everything, the parameter included (W3a-6)", () => {
  it("answers 429 for ?version=bogus when the network's read limit is spent, as it does for a good version", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);

    const bogus = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?version=bogus",
    });
    const good = await view(kitchen.id, { cookie: session.cookie });

    expect([bogus.status, good.status]).toEqual([429, 429]);
    expect(await wireOf(bogus)).toBe(await wireOf(good));
    expect(heldRows()).toEqual([]);
  });
});

describe("the version parameter (W3a-6)", () => {
  it("answers 400 in the list's shape: the same keys, the same issue members, the same headers", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    const listsRefusal = staffInvalidQueryResponse([
      { field: "segment", code: "UNKNOWN_VALUE" },
    ] as Parameters<typeof staffInvalidQueryResponse>[0]);

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?version=nope",
    });

    const own = (await jsonOf(answer)) as {
      status: string;
      issues: Record<string, unknown>[];
    };
    const theirs = (await jsonOf(listsRefusal)) as typeof own;
    expect(answer.status).toBe(listsRefusal.status);
    expect(Object.keys(own).sort()).toEqual(Object.keys(theirs).sort());
    expect(own.status).toBe(theirs.status);
    expect(Object.keys(own.issues[0] ?? {}).sort()).toEqual(
      Object.keys(theirs.issues[0] ?? {}).sort(),
    );
    expect([...answer.headers].sort()).toEqual(
      [...listsRefusal.headers].sort(),
    );
  });

  it("never echoes the refused value", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?version=Zorila-Quasar-9917",
    });

    expect(answer.status).toBe(400);
    expect(await answer.clone().text()).not.toContain("Zorila");
  });

  it("is judged before the id: a malformed id with a bad version is 400, and a malformed id with a good version is 404", async () => {
    const { session } = await signedInOperator();

    const badVersion = await view("abc", {
      cookie: session.cookie,
      search: "?version=x",
    });
    const goodVersion = await view("abc", {
      cookie: session.cookie,
      search: "?version=current",
    });

    expect([badVersion.status, goodVersion.status]).toEqual([400, 404]);
  });

  it("refuses every string but exactly sent and current, with nothing read, counted or written", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);

    await fc.assert(
      fc.asyncProperty(
        fc
          .oneof(fc.string(), fc.constantFrom("sent", "current"))
          .map((text) => text),
        async (value) => {
          fc.pre(value !== "sent" && value !== "current");
          limiterLedger.counted.length = 0;
          staffWorld.calls.length = 0;

          const answer = await view(kitchen.id, {
            cookie: session.cookie,
            search: `?version=${encodeURIComponent(value)}`,
          });

          expect(answer.status).toBe(400);
          expect(staffWorld.calls).toEqual([]);
          expect(limiterLedger.counted).not.toContain(OPEN_POLICY_NAME);
          expect(heldRows()).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
  });

  it.each([
    [
      "a bracketed name, which is another member and is ignored",
      "?version[]=current",
      "sent",
    ],
    ["a trailing semicolon", "?version=sent;"],
    ["a NUL after the word", "?version=sent%00"],
    ["a plus for a space", "?version=sent+"],
    ["an encoded word", "?version=%73ent", "sent"],
    [
      "a three-times-repeated parameter",
      "?version=sent&version=sent&version=sent",
    ],
    [
      "the empty member between two good ones",
      "?version=sent&version=&version=current",
    ],
    ["no value and no equals sign", "?version"],
  ])("judges %s", async (_title, search, servedVersion?: string) => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);

    const answer = await view(kitchen.id, { cookie: session.cookie, search });

    if (servedVersion === undefined) {
      expect(answer.status).toBe(400);
      expect(heldRows()).toEqual([]);
    } else {
      expect(answer.status).toBe(200);
      expect(heldRows().map(({ detail }) => detail)).toEqual([
        { version: servedVersion },
      ]);
    }
  });

  it("ignores a member other than version, as the list ignores the members it does not read, and serves the default copy", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?Version=current&source=current&role=administrator",
    });

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      design: SENT_DESIGN,
      source: "as-sent",
    });
    expect(heldRows().map(({ detail }) => detail)).toEqual([
      { version: "sent" },
    ]);
  });

  it("serves the as-sent copy when no version is named and the current copy differs", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(await jsonOf(answer)).toEqual({
      design: SENT_DESIGN,
      source: "as-sent",
    });
  });
});

describe("which copy is served, and which copy the row names (W3a-1, W3a-2, W3a-12)", () => {
  type SentCopy = "none" | "unreadable" | "revoked-only" | "readable";
  type CurrentCopy = "unreadable" | "readable";
  type Requested = "absent" | "sent" | "current";

  interface Expected {
    readonly status: 200 | 422;
    readonly source?: "as-sent" | "current";
    readonly rowVersion?: "sent" | "current";
  }

  /** Written from ADR 0180 d2 (6), not from `shownDesignOf`: a readable as-sent copy answers `sent` and an absent
   *  version, `current` answers the current copy when it is readable, and the other copy stands in for an unreadable one. */
  function expectedFor(
    sent: SentCopy,
    current: CurrentCopy,
    requested: Requested,
  ): Expected {
    const hasSent = sent === "readable";
    const hasCurrent = current === "readable";
    if (!hasSent && !hasCurrent) return { status: 422 };
    const prefersCurrent = requested === "current";
    const servesCurrent = hasCurrent && (prefersCurrent || !hasSent);
    return servesCurrent
      ? { status: 200, source: "current", rowVersion: "current" }
      : { status: 200, source: "as-sent", rowVersion: "sent" };
  }

  const SENT_COPIES: readonly SentCopy[] = [
    "none",
    "unreadable",
    "revoked-only",
    "readable",
  ];
  const CURRENT_COPIES: readonly CurrentCopy[] = ["unreadable", "readable"];
  const REQUESTS: readonly Requested[] = ["absent", "sent", "current"];
  const MATRIX = SENT_COPIES.flatMap((sent) =>
    CURRENT_COPIES.flatMap((current) =>
      REQUESTS.map((requested) => [sent, current, requested] as const),
    ),
  );

  it.each(MATRIX)(
    "with an as-sent copy that is %s, a current copy that is %s and version %s",
    async (sent, current, requested) => {
      const { session } = await signedInOperator();
      const kitchen = plantKitchen({
        design: current === "readable" ? CURRENT_DESIGN : null,
      });
      if (sent === "unreadable") plantSentCopyOf(kitchen.id, null);
      if (sent === "revoked-only") {
        plantSentCopyOf(kitchen.id, SENT_DESIGN, { isRevoked: true });
      }
      if (sent === "readable") plantSentCopyOf(kitchen.id, SENT_DESIGN);
      const search = requested === "absent" ? "" : `?version=${requested}`;

      const answer = await view(kitchen.id, { cookie: session.cookie, search });

      const expected = expectedFor(sent, current, requested);
      expect(answer.status).toBe(expected.status);
      expect(answer.headers.get("cache-control")).toBe(NO_STORE);
      if (expected.status === 422) {
        expect(await jsonOf(answer)).toEqual({
          code: "STAFF_KITCHEN_UNREADABLE",
        });
        expect(heldRows()).toEqual([]);
        return;
      }
      const served =
        expected.source === "current" ? CURRENT_DESIGN : SENT_DESIGN;
      expect(await jsonOf(answer)).toEqual({
        design: served,
        source: expected.source,
      });
      expect(heldRows()).toHaveLength(1);
      expect(heldRows()[0]).toMatchObject({
        action: "kitchen-viewed-3d",
        designId: kitchen.id,
        detail: { version: expected.rowVersion },
      });
    },
  );

  it("serves the design the detail endpoint carries for the same copy", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);

    const detail = (await jsonOf(
      await openDetail(kitchen.id, { cookie: session.cookie }),
    )) as { kitchen: { design: unknown; asSent: unknown } };
    const sent = (await jsonOf(
      await view(kitchen.id, {
        cookie: session.cookie,
        search: "?version=sent",
      }),
    )) as { design: unknown };
    const current = (await jsonOf(
      await view(kitchen.id, {
        cookie: session.cookie,
        search: "?version=current",
      }),
    )) as { design: unknown };

    expect(sent.design).toEqual(detail.kitchen.asSent);
    expect(current.design).toEqual(detail.kitchen.design);
  });
});

describe("the audit row is committed before the design leaves (W3a-2)", () => {
  it("does not answer while the row's write is still pending, and answers once it commits", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((open) => {
      release = open;
    });
    const real = staffWorld.auditPort.record.bind(staffWorld.auditPort);
    vi.spyOn(staffWorld.auditPort, "record").mockImplementation(
      async (record) => {
        await gate;
        return real(record);
      },
    );
    let isAnswered = false;

    const pending = view(kitchen.id, { cookie: session.cookie }).then(
      (answer) => {
        isAnswered = true;
        return answer;
      },
    );
    await new Promise((settle) => setTimeout(settle, 25));
    const wasAnsweredBeforeCommit = isAnswered;
    const rowsBeforeCommit = heldRows().length;
    release();
    const answer = await pending;

    expect(wasAnsweredBeforeCommit).toBe(false);
    expect(rowsBeforeCommit).toBe(0);
    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("answers 503 with no design when the write rejects after the body was shaped, and reports no success", async () => {
    const logged = captureConsole();
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    staffWorld.auditBehaviour = "reject";

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain("placements");
    expect(
      logged
        .accountLines()
        .filter(
          ({ event, outcome }) =>
            event === "staff-kitchen" && outcome === "succeeded",
        ),
    ).toEqual([]);
  });

  it("answers 503 and no design when the reader itself fails, with no row and no driver text", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    staffWorld.failReader = true;

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(answer.headers.get("cache-control")).toBe(NO_STORE);
    expect(heldRows()).toEqual([]);
  });

  it("writes exactly one row for each of many concurrent views, each naming its own copy", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);
    const searches = ["", "?version=sent", "?version=current"];

    const answers = await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        view(kitchen.id, {
          cookie: session.cookie,
          search: searches[index % searches.length] ?? "",
        }),
      ),
    );

    expect(answers.map(({ status }) => status)).toEqual(
      Array.from({ length: 12 }, () => 200),
    );
    const versions = heldRows().map(
      ({ detail }) => (detail as { version: string }).version,
    );
    expect(versions.filter((version) => version === "sent")).toHaveLength(8);
    expect(versions.filter((version) => version === "current")).toHaveLength(4);
  });

  it("names the actor of the session that asked, for two different staff members", async () => {
    const first = await signedInOperator("first@example.test");
    const second = await signedInAs(
      { role: "administrator" },
      "second@example.test",
    );
    const kitchen = plantKitchen();

    await view(kitchen.id, { cookie: first.session.cookie });
    await view(kitchen.id, { cookie: second.session.cookie });

    expect(heldRows().map(({ actorAccountId }) => actorAccountId)).toEqual([
      first.account.id,
      second.account.id,
    ]);
  });
});

describe("the opening bucket (W3a-4)", () => {
  beforeEach(() => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  });

  it.each([
    ["a good request", ""],
    ["a request for the current copy", "?version=current"],
  ])("counts exactly one bucket for %s", async (_title, search) => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    limiterLedger.counted.length = 0;

    await view(kitchen.id, { cookie: session.cookie, search });

    expect(
      limiterLedger.counted.filter((name) => name === OPEN_POLICY_NAME),
    ).toHaveLength(1);
  });

  it("counts the bucket for an unknown id and for a kitchen with no readable copy (after the shape, before the read)", async () => {
    const { session } = await signedInOperator();
    const unreadable = plantKitchen({ design: null });
    limiterLedger.counted.length = 0;

    await view(aDesignId(), { cookie: session.cookie });
    await view(unreadable.id, { cookie: session.cookie });

    expect(
      limiterLedger.counted.filter((name) => name === OPEN_POLICY_NAME),
    ).toHaveLength(2);
  });

  it("shares its bucket with the detail endpoint: a spent bucket refuses both the same way", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    limiterLedger.refusing.set(OPEN_POLICY_NAME, 1);

    const threeD = await view(kitchen.id, { cookie: session.cookie });
    const detail = await openDetail(kitchen.id, { cookie: session.cookie });

    expect(threeD.status).toBe(429);
    expect(await wireOf(threeD)).toBe(await wireOf(detail));
    expect(threeD.headers.get("retry-after")).toBe(
      detail.headers.get("retry-after"),
    );
  });

  it("fails closed with the same answer as the detail endpoint, no read and no row", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    limiterLedger.unavailable.add(OPEN_POLICY_NAME);

    const threeD = await view(kitchen.id, { cookie: session.cookie });
    const detail = await openDetail(kitchen.id, { cookie: session.cookie });

    expect(threeD.status).toBe(503);
    expect(await wireOf(threeD)).toBe(await wireOf(detail));
    expect(heldRows()).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
  });
});

describe("what the body holds (W3a-5)", () => {
  it("is exactly the served design and its source, whatever else the kitchen holds", async () => {
    const staff = await signedInOperator();
    const client = plantClient({
      email: "sentinel-email@client-sentinel.test",
      name: "Sentinel Clientname",
      phone: "+37369555123",
    });
    const kitchen = plantKitchen({
      design: CURRENT_DESIGN,
      accountId: client.id,
      name: "Sentinel Kitchenname",
      isHidden: true,
    });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);
    staffWorld.reader.plantNote({
      id: aDesignId(),
      designId: kitchen.id,
      authorAccountId: staff.account.id,
      text: "Sentinel note text",
      createdAt: SENT_AT,
    });

    for (const [search, design, source] of [
      ["", SENT_DESIGN, "as-sent"],
      ["?version=current", CURRENT_DESIGN, "current"],
    ] as const) {
      const answer = await view(kitchen.id, {
        cookie: staff.session.cookie,
        search,
      });
      expect(await jsonOf(answer)).toEqual({ design, source });
    }
  });

  it("holds no member of the served design that the design schema does not define", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });

    const body = (await jsonOf(
      await view(kitchen.id, {
        cookie: session.cookie,
        search: "?version=current",
      }),
    )) as { design: Record<string, unknown> };

    expect(Object.keys(body.design).sort()).toEqual(
      Object.keys(CURRENT_DESIGN).sort(),
    );
  });
});

describe("the route file", () => {
  it("exports GET and HEAD and no other method, so nothing else can reach the read", () => {
    const methods = Object.keys(threeDModule).filter((name) =>
      /^[A-Z]+$/.test(name),
    );

    expect(methods.sort()).toEqual(["GET", "HEAD"]);
  });

  it("answers HEAD whatever the cookie, version and id, without touching a store", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    limiterLedger.counted.length = 0;
    const head = HEAD as unknown as (
      request: unknown,
      context: unknown,
    ) => Response;

    const answer = head(
      accountRequest(`/api/staff/kitchens/${kitchen.id}/3d`, {
        method: "HEAD",
        cookie: session.cookie,
        search: "?version=current",
      }),
      { params: Promise.resolve({ id: kitchen.id }) },
    );

    expect(answer.status).toBe(405);
    expect(answer.headers.get("allow")).toBe("GET");
    expect(await answer.clone().text()).toBe("");
    expect(staffWorld.calls).toEqual([]);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(heldRows()).toEqual([]);
  });

  it("is dynamic and on the Node runtime", () => {
    expect(threeDModule.dynamic).toBe("force-dynamic");
    expect(threeDModule.runtime).toBe("nodejs");
  });
});

describe("no share link is minted or read (ADR 0180 d7)", () => {
  it("touches no share-link store, and revokes none, in 200, 400, 404 and 422", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    const unreadable = plantKitchen({ design: null });

    await view(kitchen.id, { cookie: session.cookie });
    await view(kitchen.id, { cookie: session.cookie, search: "?version=x" });
    await view(aDesignId(), { cookie: session.cookie });
    await view(unreadable.id, { cookie: session.cookie });

    expect(world.calls.filter((call) => /share|token/i.test(call))).toEqual([]);
    expect(world.revokedShareLinks).toEqual([]);
  });
});

describe("the audit log carries the row (W3a-7)", () => {
  it("lists the row through the audit endpoint's action filter as recognised, with the version and no client contact", async () => {
    const administrator = await signedInAs(
      { role: "administrator" },
      "administrator@example.test",
    );
    staffWorld.reader.plantAccount({
      id: administrator.account.id,
      email: "administrator@example.test",
      name: "Admin",
      phone: null,
    });
    const client = plantClient({
      email: "sentinel-email@client-sentinel.test",
      name: "Sentinel Clientname",
      phone: "+37369555123",
    });
    const kitchen = plantKitchen({
      design: CURRENT_DESIGN,
      accountId: client.id,
    });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);
    await view(kitchen.id, {
      cookie: administrator.session.cookie,
      search: "?version=current",
    });
    await openDetail(kitchen.id, { cookie: administrator.session.cookie });

    const answer = await GET_AUDIT(
      accountRequest("/api/staff/audit", {
        cookie: administrator.session.cookie,
        search: "?action=kitchen-viewed-3d",
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );

    expect(answer.status).toBe(200);
    const page = (await jsonOf(answer)) as {
      total: number;
      events: { entry: unknown }[];
    };
    expect(page.total).toBe(1);
    expect(page.events.map(({ entry }) => entry)).toEqual([
      {
        kind: "recognised",
        action: "kitchen-viewed-3d",
        detail: { version: "current" },
      },
    ]);
    expect(await answer.clone().text()).not.toContain("37369555123");
  });
});

describe("the detail endpoint is unchanged (W3a-8)", () => {
  it("still writes one kitchen-opened row, and none for 3D, and ignores a version member", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();

    const answer = await GET_DETAIL(
      accountRequest(`/api/staff/kitchens/${kitchen.id}`, {
        cookie: session.cookie,
        search: "?version=bogus",
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
      { params: Promise.resolve({ id: kitchen.id }) },
    );

    expect(answer.status).toBe(200);
    expect(heldRows().map(({ action, detail }) => [action, detail])).toEqual([
      ["kitchen-opened", null],
    ]);
  });

  it("does not let a view stand in for an open: the two rows are told apart", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();

    await view(kitchen.id, { cookie: session.cookie });
    await openDetail(kitchen.id, { cookie: session.cookie });

    expect(heldRows().map(({ action }) => action)).toEqual([
      "kitchen-viewed-3d",
      "kitchen-opened",
    ]);
  });
});
