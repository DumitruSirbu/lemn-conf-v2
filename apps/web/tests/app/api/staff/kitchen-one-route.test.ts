import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  aDesign,
  aDesignId,
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

const { GET } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * `GET /api/staff/kitchens/{id}` (M8B Lot 3, E-L3-2; ADR 0173). Opening a client's kitchen writes a `kitchen-opened` row
 * before the kitchen is sent, and an id that names nothing a staff member may read gets one refusal and no row.
 */

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

function openRequest(
  id: string,
  init: Parameters<typeof accountRequest>[1] = {},
) {
  return accountRequest(`/api/staff/kitchens/${id}`, {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

function open(id: string, init: Parameters<typeof accountRequest>[1] = {}) {
  return GET(openRequest(id, init), { params: Promise.resolve({ id }) });
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

describe("the order of the checks", () => {
  it("refuses a cross-site request first: nothing is counted, no session is read, no store is asked", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await open(id, { cookie: session.cookie, secFetchSite });

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("counts the network's read limit before it reads the session, so a refusal is the same for every caller", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);
    world.calls.length = 0;

    const signedIn = await open(id, { cookie: session.cookie });
    const anonymous = await open(id);

    for (const answer of [signedIn, anonymous]) {
      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, READ_POLICY_NAME);
    }
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
  });

  it("serves a kitchen when the read limiter cannot be judged: a read fails open", async () => {
    const { session } = await signedInOperator();
    const { id } = plantKitchen();
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await open(id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
  });

  it("answers 401 to an anonymous caller whatever the id: the session is judged before the id", async () => {
    const { id } = plantKitchen();

    const answers = [
      await open(id),
      await open("not-an-id"),
      await open(aDesignId()),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 401, 401]);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers 403 to a client, however the id is spelled, and reads nothing", async () => {
    const client = await signedInAs({ role: "client" });
    const { id } = plantKitchen();

    const answers = [
      await open(id, { cookie: client.session.cookie }),
      await open("not-an-id", { cookie: client.session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([403, 403]);
    expect(staffWorld.calls).toEqual([]);
  });

  it("answers 503, never 401, when the session store cannot be read", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const { id } = plantKitchen();
    world.failOn("sessions.findLive");

    const answer = await open(id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(console_.accountLines()).toContainEqual({
      event: "staff-kitchen",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("the one refusal", () => {
  it("is byte-identical for an unknown id, a kitchen its client deleted and a visitor's unsent draft, under one id", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const id = aDesignId();

    const unknown = await open(id, { cookie: session.cookie });
    plantKitchen({ id, accountId: client.id, isDeletedByClient: true });
    const deleted = await open(id, { cookie: session.cookie });
    plantKitchen({ id, accountId: null, isSent: false });
    const visitorDraft = await open(id, { cookie: session.cookie });

    expect(unknown.status).toBe(404);
    expect(await wireOf(deleted)).toBe(await wireOf(unknown));
    expect(await wireOf(visitorDraft)).toBe(await wireOf(unknown));
    expect(await wireOf(unknown)).toBe(
      await wireOf(designNotFoundResponse(id)),
    );
    expect(heldRows()).toEqual([]);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "A".repeat(22)],
    ["path-like", "..%2F..%2Fetc"],
    ["outside the alphabet", "has space and *"],
    ["a legacy id the reader would accept", "legacy-id01"],
  ])(
    "answers an id that is %s as the unknown id is answered, without asking the reader, and writes no row",
    async (_title, id) => {
      const { session } = await signedInOperator();
      plantKitchen({ id });

      const answer = await open(id, { cookie: session.cookie });

      expect(answer.status).toBe(404);
      expect(await wireOf(answer)).toBe(
        await wireOf(designNotFoundResponse(id)),
      );
      expect(staffWorld.calls).toEqual([]);
      expect(heldRows()).toEqual([]);
    },
  );
});

describe("a kitchen is opened", () => {
  it("reads a kitchen its client hid, and writes one kitchen-opened row naming the actor, the kitchen and the client", async () => {
    const { account, session } = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchen({ accountId: client.id, isHidden: true });

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(
      ((await jsonOf(answer)) as { kitchen: { isHidden: boolean } }).kitchen
        .isHidden,
    ).toBe(true);
    expect(heldRows()).toEqual([
      expect.objectContaining({
        actorAccountId: account.id,
        action: "kitchen-opened",
        designId: kitchen.id,
        subjectAccountId: client.id,
        detail: null,
      }),
    ]);
  });

  it("names no subject for a kitchen no account owns", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen({ accountId: null });

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(heldRows()[0]).toMatchObject({
      designId: kitchen.id,
      subjectAccountId: null,
    });
  });

  it("writes one row for each opening", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();

    await open(kitchen.id, { cookie: session.cookie });
    await open(kitchen.id, { cookie: session.cookie });

    expect(heldRows()).toHaveLength(2);
  });

  it("answers 200 with a null design and null as-sent copy when the stored document cannot be read, keeping the rest", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchen({ accountId: client.id, design: null });

    const answer = await open(kitchen.id, { cookie: session.cookie });
    const body = (await jsonOf(answer)) as {
      kitchen: { design: unknown; asSent: unknown };
      client: { email: string };
    };

    expect(answer.status).toBe(200);
    expect(body.kitchen.design).toBeNull();
    expect(body.kitchen.asSent).toBeNull();
    expect(body.client.email).toBe(client.email);
    expect(heldRows()).toHaveLength(1);
  });
});

describe("every opening is audited before the kitchen is sent", () => {
  it("answers 503 with no document, no address and no name, and keeps no row, when the audit row cannot be written", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const client = plantClient({
      email: "seen-only-in-a-kitchen@example.test",
    });
    const kitchen = plantKitchen({
      accountId: client.id,
      name: "Bucatarie secreta",
    });
    staffWorld.auditBehaviour = "reject";

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    const text = await answer.clone().text();
    for (const secret of [
      client.email,
      client.phone,
      "Bucatarie secreta",
      "placements",
      DRIVER_FAILURE_MARKER,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(heldRows()).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 and serves nothing when the actor's session ended before the row was written", async () => {
    const { account, session } = await signedInOperator();
    const kitchen = plantKitchen();
    staffWorld.auditBehaviour = "lose-session";
    staffWorld.signedOutAccountId = account.id;

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(heldRows()).toEqual([]);
  });

  it("has the row committed by the time the answer exists: the write is awaited, not started", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    staffWorld.auditBehaviour = "commit-late";

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(200);
    expect(heldRows()).toHaveLength(1);
  });

  it("answers 503 with no row when the reader fails", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantKitchen();
    staffWorld.failReader = true;

    const answer = await open(kitchen.id, { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(heldRows()).toEqual([]);
  });

  it("writes a row only for the request answered 200", async () => {
    const { session } = await signedInOperator();
    const client = await signedInAs({ role: "client" });
    const kitchen = plantKitchen();

    const answers = [
      await open(kitchen.id),
      await open(kitchen.id, { cookie: client.session.cookie }),
      await open(aDesignId(), { cookie: session.cookie }),
      await open(kitchen.id, { cookie: session.cookie }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 403, 404, 200]);
    expect(heldRows()).toHaveLength(1);
  });
});

describe("what the answer holds", () => {
  async function plantARichKitchen() {
    const staff = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchen({
      accountId: client.id,
      name: "Bucataria din Botanica",
    });
    const clientRequestId = aDesignId();
    staffWorld.reader.plantRequest({
      clientRequestId,
      designId: kitchen.id,
      reference: "LM-2026-0042",
      createdAt: SENT_AT,
    });
    staffWorld.reader.plantSentCopy({
      clientRequestId,
      createdAt: SENT_AT,
      isRevoked: false,
      design: aDesign("as-sent"),
    });
    staffWorld.reader.plantStatus({
      designId: kitchen.id,
      status: "contacted",
      changedByAccountId: staff.account.id,
      changedAt: SENT_AT,
    });
    staffWorld.reader.plantNote({
      id: aDesignId(),
      designId: kitchen.id,
      authorAccountId: staff.account.id,
      text: "Suna marti",
      createdAt: SENT_AT,
    });
    return { staff, client, kitchen };
  }

  it("is private, no-store, with exactly the kitchen, client, request, status, notes and the truncation flag", async () => {
    const { staff, kitchen } = await plantARichKitchen();

    const answer = await open(kitchen.id, { cookie: staff.session.cookie });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const body = (await jsonOf(answer)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "client",
      "kitchen",
      "notes",
      "notesTruncated",
      "request",
      "status",
    ]);
  });

  it("names every member at every level and no account id or postal address anywhere", async () => {
    const { staff, client, kitchen } = await plantARichKitchen();

    const answer = await open(kitchen.id, { cookie: staff.session.cookie });
    const body = (await jsonOf(answer)) as {
      kitchen: Record<string, unknown>;
      client: Record<string, unknown>;
      request: Record<string, unknown>;
      status: Record<string, unknown>;
      notes: Record<string, unknown>[];
    };

    expect(Object.keys(body.kitchen).sort()).toEqual([
      "asSent",
      "design",
      "id",
      "isHidden",
      "isSent",
      "name",
      "sentAt",
      "updatedAt",
    ]);
    expect(body.client).toEqual({
      email: client.email,
      name: client.name,
      phone: client.phone,
    });
    expect(body.request).toEqual({
      reference: "LM-2026-0042",
      sentAt: SENT_AT.toISOString(),
    });
    expect(body.status).toEqual({
      value: "contacted",
      changedBy: { email: staff.account.email, name: "Operator Name" },
      changedAt: SENT_AT.toISOString(),
    });
    expect(body.notes).toHaveLength(1);
    expect(Object.keys(body.notes[0] ?? {}).sort()).toEqual([
      "author",
      "createdAt",
      "id",
      "text",
    ]);
    expect(body.notes[0]).toMatchObject({
      text: "Suna marti",
      createdAt: SENT_AT.toISOString(),
      author: { email: staff.account.email, name: "Operator Name" },
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain(client.id);
    expect(text).not.toContain(staff.account.id);
    expect(text).not.toContain(client.postalAddress);
  });

  it("carries the as-sent copy beside the current document", async () => {
    const { staff, kitchen } = await plantARichKitchen();

    const body = (await jsonOf(
      await open(kitchen.id, { cookie: staff.session.cookie }),
    )) as {
      kitchen: { design: { presetId: string }; asSent: { presetId: string } };
    };

    expect(body.kitchen.asSent.presetId).toBe("preset-as-sent");
    expect(body.kitchen.design.presetId).not.toBe("preset-as-sent");
  });

  it("answers a draft with no request and no status", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const draft = plantKitchen({ accountId: client.id, isSent: false });

    const body = (await jsonOf(
      await open(draft.id, { cookie: session.cookie }),
    )) as { request: unknown; status: unknown; kitchen: { sentAt: unknown } };

    expect([body.request, body.status, body.kitchen.sentAt]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("flags a kitchen that holds more notes than it carries", async () => {
    const { session, account } = await signedInOperator();
    const kitchen = plantKitchen({ accountId: plantClient().id });
    for (let index = 0; index < 101; index += 1) {
      staffWorld.reader.plantNote({
        id: aDesignId(),
        designId: kitchen.id,
        authorAccountId: account.id,
        text: `note ${String(index)}`,
        createdAt: new Date(SENT_AT.getTime() + index * 1000),
      });
    }

    const body = (await jsonOf(
      await open(kitchen.id, { cookie: session.cookie }),
    )) as { notes: { text: string }[]; notesTruncated: boolean };

    expect(body.notes).toHaveLength(100);
    expect(body.notes[0]?.text).toBe("note 100");
    expect(body.notesTruncated).toBe(true);
  });

  it("names an unrecognised stored status as such, and never as new", async () => {
    const { session, account } = await signedInOperator();
    const kitchen = plantKitchen({ accountId: plantClient().id });
    staffWorld.reader.plantStatus({
      designId: kitchen.id,
      status: "from-a-later-build",
      changedByAccountId: account.id,
      changedAt: SENT_AT,
    });

    const body = (await jsonOf(
      await open(kitchen.id, { cookie: session.cookie }),
    )) as { status: { value: string } };

    expect(body.status.value).toBe("unrecognised");
  });

  it("logs no address, kitchen name or note text", async () => {
    const console_ = captureConsole();
    const { staff, client, kitchen } = await plantARichKitchen();

    await open(kitchen.id, { cookie: staff.session.cookie });

    const logged = console_.everything();
    for (const secret of [
      client.email,
      "Bucataria din Botanica",
      "Suna marti",
      kitchen.id,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
