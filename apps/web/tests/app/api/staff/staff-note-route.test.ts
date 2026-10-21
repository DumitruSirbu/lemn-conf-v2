import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffActionsWorld,
  noteRequest,
  plantActionKitchen,
  signedInStaffNamed,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import { freshStaffWorld, type StaffWorld } from "../../../support/staff-world";

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

const route = await import("@/app/api/staff/kitchens/[id]/notes/route");
const { POST } = route;

/**
 * `POST /api/staff/kitchens/{id}/notes` (M8B Lot 3, E-L3-3, K-8; ADR 0173). A note is judged by the domain before the
 * store is asked, is written with its audit row or not at all, and is answered, text included, only in the `201`.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;
let actions: StaffActionsWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
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

const OPERATOR_EMAIL = "operator@example.test";
const OPERATOR_NAME = "Olga Operator";
const ISO_INSTANT = /^\d{4}-\d\d-\d\dT.*Z$/;

async function signedInOperator() {
  return signedInStaffNamed(
    { role: "operator" },
    OPERATOR_EMAIL,
    OPERATOR_NAME,
  );
}

async function addNote(
  id: string,
  cookie: string,
  json: unknown,
  init: Parameters<typeof noteRequest>[1] = {},
) {
  return POST(noteRequest(id, { cookie, json, ...init }), {
    params: Promise.resolve({ id }),
  });
}

function heldEvents() {
  return staffWorld.audit.heldEvents();
}

describe("a note that is accepted", () => {
  it("is answered 201 with the stored note field by field, its author by address and name and never by account id", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "Called the client",
    });

    expect(answer.status).toBe(201);
    const body = (await jsonOf(answer)) as {
      note: { id: string; createdAt: string };
    };
    expect(Object.keys(body)).toEqual(["note"]);
    expect(Object.keys(body.note).sort()).toEqual([
      "author",
      "createdAt",
      "id",
      "text",
    ]);
    const { id: noteId, createdAt, ...fixedMembers } = body.note;
    expect(noteId).toMatch(/^[\w-]{21}$/);
    expect(createdAt).toMatch(ISO_INSTANT);
    expect(fixedMembers).toEqual({
      text: "Called the client",
      author: { email: OPERATOR_EMAIL, name: OPERATOR_NAME },
    });
    expect(JSON.stringify(body)).not.toContain(account.id);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is written with exactly one audit row, naming the actor and the kitchen and holding no detail", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();

    await addNote(id, session.cookie, { text: "Called the client" });

    expect(heldEvents()).toEqual([
      expect.objectContaining({
        action: "note-added",
        actorAccountId: account.id,
        designId: id,
        detail: null,
      }),
    ]);
    expect(actions.store.heldNotes(id)).toHaveLength(1);
  });

  it("stores and answers the judged form: NFC, trimmed, a newline kept", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "  re\u0301sume\u0301\nline two  ",
    });

    expect(answer.status).toBe(201);
    const { note } = (await jsonOf(answer)) as { note: { text: string } };
    expect(note.text).toBe("r\u00e9sum\u00e9\nline two");
    expect(actions.store.heldNotes(id)[0]?.text).toBe(note.text);
  });

  it.each([
    ["a draft", { isSent: false }],
    ["a kitchen its client hid", { isHidden: true }],
  ] as const)("is accepted on %s", async (_title, fixture) => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen(fixture);

    const answer = await addNote(id, session.cookie, { text: "Note" });

    expect(answer.status).toBe(201);
  });
});

describe("the text's length, counted in code points after NFC", () => {
  it("accepts 2000 characters", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "a".repeat(2000),
    });

    expect(answer.status).toBe(201);
  });

  it("refuses 2001 characters with field text and the code TOO_LONG, and writes nothing", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "a".repeat(2001),
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "TOO_LONG" }],
    });
    expect(actions.calls).toEqual([]);
    expect(heldEvents()).toEqual([]);
  });

  it("accepts 2000 characters of four bytes each: about 8 KB of body is inside the body's bound", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "\u{1F600}".repeat(2000),
    });

    expect(answer.status).toBe(201);
  });

  it("counts a decomposed text after it is composed: 2000 letters written as 4000 code points are accepted", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "e\u0301".repeat(2000),
    });

    expect(answer.status).toBe(201);
    expect(actions.store.heldNotes(id)[0]?.text).toBe("\u00e9".repeat(2000));
  });

  it("refuses 2001 composed letters written in the decomposed form", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "e\u0301".repeat(2001),
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "TOO_LONG" }],
    });
  });
});

describe("a text that is refused", () => {
  const SECRET_TEXT = "SECRET-NOTE-TEXT-7741";

  it.each([
    ["an empty text", "", "REQUIRED"],
    ["a text of spaces", "   ", "REQUIRED"],
    ["a text of line feeds", "\n\n", "REQUIRED"],
    ["a tab", `${SECRET_TEXT}\tx`, "FORBIDDEN_CHARACTER"],
    ["a carriage return", `${SECRET_TEXT}\rx`, "FORBIDDEN_CHARACTER"],
    ["a null character", `${SECRET_TEXT}\u0000x`, "FORBIDDEN_CHARACTER"],
    ["a bidi override", `${SECRET_TEXT}\u202Ex`, "FORBIDDEN_CHARACTER"],
    ["a bidi isolate", `${SECRET_TEXT}\u2066x`, "FORBIDDEN_CHARACTER"],
    ["a lone surrogate", `${SECRET_TEXT}\uD800x`, "FORBIDDEN_CHARACTER"],
  ] as const)(
    "is %s: 400 naming the field and a code",
    async (_title, text, code) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await addNote(id, session.cookie, { text });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "text", code }],
      });
      expect(actions.calls).toEqual([]);
      expect(heldEvents()).toEqual([]);
    },
  );

  it.each([
    ["absent", {}, "REQUIRED"],
    ["a number", { text: 5 }, "NOT_TEXT"],
    ["null", { text: null }, "NOT_TEXT"],
    ["an array", { text: ["a"] }, "NOT_TEXT"],
    ["an object", { text: { a: "b" } }, "NOT_TEXT"],
  ] as const)(
    "is %s: 400 with the domain's code",
    async (_title, json, code) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await addNote(id, session.cookie, json);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "text", code }],
      });
    },
  );

  it("never echoes the refused value in the answer or in a log line", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: `${SECRET_TEXT}\t`,
    });

    expect(await answer.clone().text()).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
  });
});

describe("a body that is not the one member the route takes", () => {
  it.each([
    ["an extra member", { text: "x", role: "administrator" }],
    ["an extra member named like a prototype", '{"text":"x","__proto__":{}}'],
    ["another member only", { note: "x" }],
    ["a member that names an account", { text: "x", accountId: "someone" }],
    ["an array", ["x"]],
    ["a bare string", '"x"'],
    ["null", "null"],
    ["text that is not JSON", "{not json"],
    ["an empty body", ""],
  ] as const)(
    "is 400 invalid-request, naming nothing: %s",
    async (_title, json) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await addNote(id, session.cookie, json);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(actions.calls).toEqual([]);
      expect(heldEvents()).toEqual([]);
    },
  );

  it("does not echo the name of an unexpected member", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "x",
      SECRET_MEMBER_NAME_5512: 1,
    });

    expect(await answer.clone().text()).not.toContain(
      "SECRET_MEMBER_NAME_5512",
    );
  });

  it("is 415 for a body that is not JSON, before any session is read", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    world.calls.length = 0;

    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      null,
    ]) {
      const answer = await addNote(id, session.cookie, '{"text":"x"}', {
        contentType,
      });
      expect(answer.status).toBe(415);
    }
    expect(world.calls).toEqual([]);
    expect(actions.calls).toEqual([]);
  });

  it("reads the media type by its type alone, whatever parameters follow and in whatever case", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(
      id,
      session.cookie,
      { text: "x" },
      {
        contentType: "Application/JSON; charset=utf-8",
      },
    );

    expect(answer.status).toBe(201);
  });

  it("is 413 for a body past 8 KiB, and writes nothing", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, {
      text: "a".repeat(8 * 1024),
    });

    expect(answer.status).toBe(413);
    expect(await jsonOf(answer)).toEqual({ status: "body-too-large" });
    expect(actions.calls).toEqual([]);
  });
});

describe("the one kitchen refusal (K-4)", () => {
  it("is byte-identical for an unknown id, a malformed id, a client-deleted kitchen and a visitor's unsent draft", async () => {
    const { session } = await signedInOperator();
    const unknown = "U".repeat(21);
    const deleted = plantActionKitchen({ isDeletedByClient: true });
    const visitorDraft = plantActionKitchen({ isSent: false, accountId: null });

    const answers = {
      unknown: await addNote(unknown, session.cookie, { text: "x" }),
      deleted: await addNote(deleted.id, session.cookie, { text: "x" }),
      visitorDraft: await addNote(visitorDraft.id, session.cookie, {
        text: "x",
      }),
    };

    expect(answers.unknown.status).toBe(404);
    expect(await wireOf(answers.unknown)).toBe(
      await wireOf(designNotFoundResponse(unknown)),
    );
    expect(await wireOf(answers.deleted)).toBe(
      await wireOf(designNotFoundResponse(deleted.id)),
    );
    expect(await wireOf(answers.visitorDraft)).toBe(
      await wireOf(designNotFoundResponse(visitorDraft.id)),
    );
    expect(heldEvents()).toEqual([]);
    expect(actions.store.heldNotes(deleted.id)).toEqual([]);
  });

  it("answers a malformed id without asking the store", async () => {
    const { session } = await signedInOperator();

    const answer = await addNote("not-an-id", session.cookie, { text: "x" });

    expect(answer.status).toBe(404);
    expect(actions.calls).toEqual([]);
  });

  it("judges the text before the kitchen exists: a refused text on an unknown id is 400 and says nothing of the kitchen", async () => {
    const { session } = await signedInOperator();

    const answer = await addNote("U".repeat(21), session.cookie, { text: "" });

    expect(answer.status).toBe(400);
  });
});

describe("what the note's text reaches", () => {
  const SECRET_TEXT = "SECRET-NOTE-TEXT-9082";

  it("is in the 201 and in the store alone: not in an audit row, a log line or any other answer", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await addNote(id, session.cookie, { text: SECRET_TEXT });

    expect(answer.status).toBe(201);
    expect(JSON.stringify(heldEvents())).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
  });

  it("is in no log line or answer when the store fails", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    actions.failStore = true;

    const answer = await addNote(id, session.cookie, { text: SECRET_TEXT });

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(SECRET_TEXT);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("a write and its audit row are one thing (K-3, at the route)", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and no note is visible", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    vi.spyOn(staffWorld.audit, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await addNote(id, session.cookie, { text: "Note" });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(actions.store.heldNotes(id)).toEqual([]);
    expect(heldEvents()).toEqual([]);
    expect(actions.calls).toEqual(["actions.addNote"]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 and does not try the store again when it fails", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    actions.failStore = true;

    const answer = await addNote(id, session.cookie, { text: "Note" });

    expect(answer.status).toBe(503);
    expect(actions.calls).toEqual(["actions.addNote"]);
  });

  it("answers 401 when the session ended after the route read it and before the store wrote, and writes nothing", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();
    const realAddNote = actions.store.addNote.bind(actions.store);
    vi.spyOn(actions.store, "addNote").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(account.id);
      return realAddNote(request);
    });

    const answer = await addNote(id, session.cookie, { text: "Note" });

    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
    expect(actions.store.heldNotes(id)).toEqual([]);
    expect(heldEvents()).toEqual([]);
  });

  it("answers 503 when the session store cannot be read, and not 401", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    world.failOn("sessions.findLive");

    const answer = await addNote(id, session.cookie, { text: "Note" });

    expect(answer.status).toBe(503);
    expect(actions.calls).toEqual([]);
  });
});

describe("the route's inventory and headers", () => {
  it("answers to POST alone: no PATCH, PUT or DELETE (a note is not edited or removed)", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "runtime"]);
  });

  it("refuses a cross-site request first: no session is read and no store is asked", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await addNote(
        id,
        session.cookie,
        { text: "x" },
        { secFetchSite },
      );
      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    expect(world.calls).toEqual([]);
    expect(actions.calls).toEqual([]);
  });

  it.each([
    ["a success", { text: "x" }, 201],
    ["a refused text", { text: "" }, 400],
    ["an unknown kitchen", { text: "x" }, 404],
  ] as const)(
    "answers %s with private, no-store",
    async (_title, json, status) => {
      const { session } = await signedInOperator();
      const id = status === 404 ? "U".repeat(21) : plantActionKitchen().id;

      const answer = await addNote(id, session.cookie, json);

      expect(answer.status).toBe(status);
      expect(answer.headers.get("cache-control")).toContain("no-store");
      expect(answer.headers.get("cache-control")).toContain("private");
    },
  );
});
