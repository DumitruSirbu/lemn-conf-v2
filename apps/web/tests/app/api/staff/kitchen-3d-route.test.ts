import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Design } from "@lemnaria/configurator-domain";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { STAFF_KITCHEN_OPEN_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
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

const { GET, HEAD } = await import("@/app/api/staff/kitchens/[id]/3d/route");
const { GET: GET_DETAIL } = await import("@/app/api/staff/kitchens/[id]/route");

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

function viewRequest(
  id: string,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return accountRequest(`/api/staff/kitchens/${id}/3d`, {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

function view(id: string, init: Parameters<typeof accountRequest>[1] = {}) {
  return GET(viewRequest(id, init), { params: Promise.resolve({ id }) });
}

function openDetail(id: string, cookie: string) {
  const request = accountRequest(`/api/staff/kitchens/${id}`, {
    cookie,
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
  return GET_DETAIL(request, { params: Promise.resolve({ id }) });
}

async function signedInOperator(email = "operator@example.test") {
  const staff = await signedInAs({ role: "operator" }, email);
  staffWorld.reader.plantAccount({
    id: staff.account.id,
    email,
    name: "Operator Name",
    phone: null,
  });
  return staff;
}

function heldRows() {
  return staffWorld.audit.heldEvents();
}

function plantSentCopyOf(designId: string, design: Design | null): void {
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
    isRevoked: false,
    design,
  });
}

const CURRENT_DESIGN = aDesign("current-copy");
const SENT_DESIGN = aDesign("sent-copy");

/** A kitchen whose two copies differ, so "which copy was served" can fail. */
function plantKitchenWithTwoCopies(
  fields: Parameters<typeof plantKitchen>[0] = {},
) {
  const kitchen = plantKitchen({ design: CURRENT_DESIGN, ...fields });
  plantSentCopyOf(kitchen.id, SENT_DESIGN);
  return kitchen;
}

interface ServedBody {
  readonly design: Design;
  readonly source: string;
}

describe("the copy served", () => {
  it.each([
    ["no version", "", SENT_DESIGN, "as-sent", "sent"],
    ["version=sent", "?version=sent", SENT_DESIGN, "as-sent", "sent"],
    [
      "version=current",
      "?version=current",
      CURRENT_DESIGN,
      "current",
      "current",
    ],
  ])(
    "serves the right copy of a kitchen holding both, for %s, and names it in the row",
    async (_title, search, expected, source, version) => {
      const { session } = await signedInOperator();
      const kitchen = plantKitchenWithTwoCopies();

      const answer = await view(kitchen.id, { cookie: session.cookie, search });

      expect(answer.status).toBe(200);
      const body = (await jsonOf(answer)) as ServedBody;
      expect(body.design).toEqual(expected);
      expect(body.source).toBe(source);
      expect(heldRows().map(({ detail }) => detail)).toEqual([{ version }]);
    },
  );

  it("falls back to the current copy for version=sent when the kitchen has no as-sent copy, and the row names the copy served", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: CURRENT_DESIGN });

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?version=sent",
    });

    expect(((await jsonOf(answer)) as ServedBody).source).toBe("current");
    expect(heldRows().map(({ detail }) => detail)).toEqual([
      { version: "current" },
    ]);
  });

  it("falls back to the as-sent copy for version=current when the current document cannot be read, and the row names the copy served", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: null });
    plantSentCopyOf(kitchen.id, SENT_DESIGN);

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      search: "?version=current",
    });

    const body = (await jsonOf(answer)) as ServedBody;
    expect([body.source, body.design]).toEqual(["as-sent", SENT_DESIGN]);
    expect(heldRows().map(({ detail }) => detail)).toEqual([
      { version: "sent" },
    ]);
  });

  it("carries the design and its source and no other member", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();

    const body = await jsonOf(
      await view(kitchen.id, { cookie: session.cookie }),
    );

    expect(Object.keys(body as object).sort()).toEqual(["design", "source"]);
  });
});

describe("the audit row", () => {
  it("is one kitchen-viewed-3d row naming the actor, the kitchen and the client's account", async () => {
    const { account, session } = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchenWithTwoCopies({ accountId: client.id });

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(heldRows()).toEqual([
      expect.objectContaining({
        actorAccountId: account.id,
        action: "kitchen-viewed-3d",
        designId: kitchen.id,
        subjectAccountId: client.id,
        detail: { version: "sent" },
      }),
    ]);
  });

  it("names no subject for a kitchen no account owns, and writes a row for each view", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies({ accountId: null });

    await view(kitchen.id, { cookie: session.cookie });
    await view(kitchen.id, { cookie: session.cookie });

    expect(heldRows()).toHaveLength(2);
    expect(heldRows()[0]).toMatchObject({ subjectAccountId: null });
  });

  it("answers 503 with no design, and keeps no row, when the row cannot be written", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    staffWorld.auditBehaviour = "reject";

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    const text = await answer.clone().text();
    expect(text).not.toContain("placements");
    expect(text).not.toContain(DRIVER_FAILURE_MARKER);
    expect(heldRows()).toEqual([]);
  });

  it("answers 503 and serves nothing when the actor's session ended before the row was written", async () => {
    const { account, session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    staffWorld.auditBehaviour = "lose-session";
    staffWorld.signedOutAccountId = account.id;

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(heldRows()).toEqual([]);
  });

  it("writes a row only for the request answered 200", async () => {
    const { session } = await signedInOperator();
    const client = await signedInAs({ role: "client" });
    const kitchen = plantKitchenWithTwoCopies();

    const answers = [
      await view(kitchen.id),
      await view(kitchen.id, { cookie: client.session.cookie }),
      await view(aDesignId(), { cookie: session.cookie }),
      await view(kitchen.id, { cookie: session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 403, 404, 200]);
    expect(heldRows()).toHaveLength(1);
  });
});

describe("the refusals of the detail endpoint, byte for byte", () => {
  it("answers an unknown id, a client-deleted kitchen and a visitor's unsent draft as GET /api/staff/kitchens/{id} does, and writes no row", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const id = aDesignId();

    const unknown = await view(id, { cookie: session.cookie });
    const unknownDetail = await openDetail(id, session.cookie);
    plantKitchen({ id, accountId: client.id, isDeletedByClient: true });
    const deleted = await view(id, { cookie: session.cookie });
    plantKitchen({ id, accountId: null, isSent: false });
    const draft = await view(id, { cookie: session.cookie });

    expect(unknown.status).toBe(404);
    expect(await wireOf(unknown)).toBe(await wireOf(unknownDetail));
    expect(await wireOf(deleted)).toBe(await wireOf(unknownDetail));
    expect(await wireOf(draft)).toBe(await wireOf(unknownDetail));
    expect(await wireOf(unknown)).toBe(
      await wireOf(designNotFoundResponse(id)),
    );
    expect(heldRows()).toEqual([]);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "A".repeat(22)],
    ["outside the alphabet", "has space and *"],
    ["a legacy id", "legacy-id01"],
  ])(
    "answers an id that is %s as the detail endpoint does, costing no bucket and asking no reader",
    async (_title, id) => {
      const { session } = await signedInOperator();

      const answer = await view(id, { cookie: session.cookie });
      const detail = await openDetail(id, session.cookie);

      expect(answer.status).toBe(404);
      expect(await wireOf(answer)).toBe(await wireOf(detail));
      expect(staffWorld.calls).toEqual([]);
      expect(limiterLedger.counted).not.toContain(OPEN_POLICY_NAME);
      expect(heldRows()).toEqual([]);
    },
  );

  it("serves a kitchen its client hid", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies({
      accountId: plantClient().id,
      isHidden: true,
    });

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("answers 401 to no session and 403 to a client and to an unconfirmed staff address, writing no row", async () => {
    const client = await signedInAs({ role: "client" });
    const unconfirmed = await signedInAs({
      role: "operator",
      isVerified: false,
    });
    const kitchen = plantKitchenWithTwoCopies();

    const answers = [
      await view(kitchen.id),
      await view(kitchen.id, { cookie: client.session.cookie }),
      await view(kitchen.id, { cookie: unconfirmed.session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 403, 403]);
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  });
});

describe("the opening bucket", () => {
  beforeEach(() => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
  });

  it("is counted once per request, after the id's shape", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();

    await view("abc", { cookie: session.cookie });
    const beforeAny = limiterLedger.counted.filter(
      (name) => name === OPEN_POLICY_NAME,
    );
    await view(kitchen.id, { cookie: session.cookie });
    await view(aDesignId(), { cookie: session.cookie });
    const afterTwo = limiterLedger.counted.filter(
      (name) => name === OPEN_POLICY_NAME,
    );

    expect(beforeAny).toEqual([]);
    expect(afterTwo).toEqual([OPEN_POLICY_NAME, OPEN_POLICY_NAME]);
  });

  it("refuses with 429 before the reader is asked when the bucket is spent", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    limiterLedger.refusing.set(OPEN_POLICY_NAME, 1);

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(429);
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  });

  it("fails closed: a bucket that cannot be counted is 503, with no read, no row and no design", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    limiterLedger.unavailable.add(OPEN_POLICY_NAME);

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  });
});

describe("the body holds the design and nothing of the client", () => {
  it("carries none of the client's e-mail, name, phone or address, the request reference, a note, the kitchen's name or an estimate", async () => {
    const staff = await signedInOperator();
    const client = plantClient({
      email: "sentinel-email@client-sentinel.test",
      name: "Sentinel Clientname",
      phone: "+37369555123",
    });
    const kitchen = plantKitchenWithTwoCopies({
      accountId: client.id,
      name: "Sentinel Kitchenname",
    });
    staffWorld.reader.plantRequest({
      clientRequestId: aDesignId(),
      designId: kitchen.id,
      reference: "LM-SENTINEL-REF",
      createdAt: SENT_AT,
      pricedTotal: { totalMinor: 7_654_321, currency: "MDL" },
    });
    staffWorld.reader.plantNote({
      id: aDesignId(),
      designId: kitchen.id,
      authorAccountId: staff.account.id,
      text: "Sentinel note text",
      createdAt: SENT_AT,
    });

    const answer = await view(kitchen.id, { cookie: staff.session.cookie });
    const text = await answer.clone().text();

    expect(answer.status).toBe(200);
    for (const sentinel of [
      "sentinel-email",
      "Sentinel Clientname",
      "37369555123",
      client.postalAddress,
      "LM-SENTINEL-REF",
      "Sentinel note text",
      "Sentinel Kitchenname",
      "7654321",
      "operator@example.test",
    ]) {
      expect(text).not.toContain(sentinel);
    }
  });
});

describe("the version parameter", () => {
  it.each([
    ["an empty value", "?version="],
    ["a repeated parameter", "?version=sent&version=current"],
    ["a repeated parameter of one value", "?version=sent&version=sent"],
    ["an unknown word", "?version=latest"],
    ["the wire's word for the sent copy", "?version=as-sent"],
    ["a capital", "?version=Sent"],
    ["an edge space", "?version=sent%20"],
  ])(
    "answers %s with 400 in the list's shape, reading nothing, counting no bucket and writing no row",
    async (_title, search) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
      const { session } = await signedInOperator();
      const kitchen = plantKitchenWithTwoCopies();
      limiterLedger.counted.length = 0;

      const answer = await view(kitchen.id, { cookie: session.cookie, search });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "version", code: "UNKNOWN_VALUE" }],
      });
      expect(staffWorld.calls).toEqual([]);
      expect(limiterLedger.counted).not.toContain(OPEN_POLICY_NAME);
      expect(heldRows()).toEqual([]);
    },
  );

  it("is judged after admission: no session is 401 and a client is 403, whatever the version", async () => {
    const client = await signedInAs({ role: "client" });
    const kitchen = plantKitchenWithTwoCopies();

    const answers = [
      await view(kitchen.id, { search: "?version=bogus" }),
      await view(kitchen.id, {
        cookie: client.session.cookie,
        search: "?version=bogus",
      }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 403]);
    expect(
      answers.map((answer) => answer.headers.get("cache-control")),
    ).toEqual([NO_STORE, NO_STORE]);
  });

  it("is judged before the id's shape: a bad version on a malformed id is 400", async () => {
    const { session } = await signedInOperator();

    const answer = await view("abc", {
      cookie: session.cookie,
      search: "?version=bogus",
    });

    expect(answer.status).toBe(400);
  });
});

describe("a kitchen with no copy this build can read", () => {
  it("answers 422 with a closed code and no design, after its bucket is counted, and writes no row", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ design: null });
    plantSentCopyOf(kitchen.id, null);

    const answer = await view(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(422);
    expect(await jsonOf(answer)).toEqual({ code: "STAFF_KITCHEN_UNREADABLE" });
    expect(answer.headers.get("cache-control")).toBe(NO_STORE);
    expect(limiterLedger.counted).toContain(OPEN_POLICY_NAME);
    expect(staffWorld.calls).toEqual(["reader.readOne"]);
    expect(heldRows()).toEqual([]);
  });
});

describe("the route file's own guards", () => {
  it("answers a cross-site request before anything is counted, read or written", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    limiterLedger.counted.length = 0;
    world.calls.length = 0;

    const answer = await view(kitchen.id, {
      cookie: session.cookie,
      secFetchSite: "cross-site",
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
    expect(heldRows()).toEqual([]);
  });

  it("answers HEAD 405 with Allow: GET, reading nothing, counting no bucket and writing no row", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    await signedInOperator();
    plantKitchenWithTwoCopies();
    limiterLedger.counted.length = 0;

    const answer = HEAD();

    expect(answer.status).toBe(405);
    expect(answer.headers.get("allow")).toBe("GET");
    expect(answer.headers.get("cache-control")).toBe(NO_STORE);
    expect(staffWorld.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(heldRows()).toEqual([]);
  });
});

describe("every answer is private, no-store", () => {
  it("holds for 200, 400, 401, 403, 404, 422, 429, 503 and a cross-site refusal", async () => {
    const { session } = await signedInOperator();
    const client = await signedInAs({ role: "client" });
    const kitchen = plantKitchenWithTwoCopies();
    const unreadable = plantKitchen({ design: null });
    const answers: Response[] = [];

    answers.push(await view(kitchen.id, { cookie: session.cookie }));
    answers.push(
      await view(kitchen.id, { cookie: session.cookie, search: "?version=x" }),
    );
    answers.push(await view(kitchen.id));
    answers.push(await view(kitchen.id, { cookie: client.session.cookie }));
    answers.push(await view(aDesignId(), { cookie: session.cookie }));
    answers.push(await view(unreadable.id, { cookie: session.cookie }));
    limiterLedger.refusing.set(OPEN_POLICY_NAME, 1);
    answers.push(await view(kitchen.id, { cookie: session.cookie }));
    limiterLedger.refusing.delete(OPEN_POLICY_NAME);
    staffWorld.auditBehaviour = "reject";
    answers.push(await view(kitchen.id, { cookie: session.cookie }));
    answers.push(
      await view(kitchen.id, {
        cookie: session.cookie,
        secFetchSite: "cross-site",
      }),
    );

    expect(answers.map(({ status }) => status)).toEqual([
      200, 400, 401, 403, 404, 422, 429, 503, 403,
    ]);
    expect(
      answers.map((answer) => answer.headers.get("cache-control")),
    ).toEqual(answers.map(() => NO_STORE));
  });

  it("counts the network's read limit first, so a refusal is the same for every caller", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchenWithTwoCopies();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);

    const signedIn = await view(kitchen.id, { cookie: session.cookie });
    const anonymous = await view(kitchen.id);

    expect([signedIn.status, anonymous.status]).toEqual([429, 429]);
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(staffWorld.calls).toEqual([]);
  });
});
