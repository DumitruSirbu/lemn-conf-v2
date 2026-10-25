import { createHash } from "node:crypto";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  ORIGIN,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import { filesUnder } from "../../../support/files-under";
import {
  BODY_ROUTES,
  NOTES_ROUTE,
  STATUS_ROUTE,
  UNHIDE_ROUTE,
  UNKNOWN_ID,
  WRITE_ROUTES,
} from "../../../support/staff-write-routes";
import {
  freshStaffActionsWorld,
  plantActionKitchen,
  signedInStaffNamed,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import {
  freshStaffWorld,
  plantKitchen,
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

const { GET: READ_ONE } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * Adversarial QA of wave L3-S7 (the staff write routes), part one: the order of the common steps, the request body's
 * edges and the cross-site guard. The order the code keeps is: cross-site, media type, bounded body (the route's), then
 * session, capability, the id's shape, the body's members, the account's bucket and only then the store. The order is
 * pinned here from the Lot 2 common order (`readGuardedBody`: steps 1 to 3 before any session is read), so a request
 * that cannot be read costs neither a session lookup nor a bucket.
 */

const OPERATOR_EMAIL = "operator@example.test";
const MAX_BODY_BYTES = 8 * 1024;

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

async function signedInOperator(email = OPERATOR_EMAIL) {
  return signedInStaffNamed({ role: "operator" }, email);
}

function expectNothingReached(): void {
  expect(actions.calls).toEqual([]);
  expect(staffWorld.audit.heldEvents()).toEqual([]);
  expect(limiterLedger.counted).toEqual([]);
}

function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** The JSON text followed by as many spaces as make the body exactly `bytes` long. */
function paddedTo(bytes: number, json: string): string {
  return json + " ".repeat(bytes - byteLengthOf(json));
}

describe.each(WRITE_ROUTES)(
  "$name: callers that are refused reach nothing",
  (route) => {
    interface Caller {
      readonly title: string;
      readonly expected: 401 | 403;
      readonly cookie: () => Promise<string | undefined>;
    }

    const CALLERS: readonly Caller[] = [
      {
        title: "anonymous",
        expected: 401,
        cookie: () => Promise.resolve(undefined),
      },
      {
        title: "a client",
        expected: 403,
        cookie: async () =>
          (await signedInAs({ role: "client" })).session.cookie,
      },
      {
        title: "an operator whose address is not confirmed",
        expected: 403,
        cookie: async () =>
          (await signedInAs({ role: "operator", isVerified: false })).session
            .cookie,
      },
      {
        title: "an operator idle past twelve hours",
        expected: 401,
        cookie: async () => {
          const { session } = await signedInOperator();
          world.advance(12 * 60 * 60 * 1000 + 1000);
          return session.cookie;
        },
      },
      {
        title: "an operator whose session was revoked",
        expected: 401,
        cookie: async () => {
          const { session, account } = await signedInOperator();
          await world.sessions.revokeAllForAccount(account.id);
          return session.cookie;
        },
      },
      {
        title: "an operator demoted to client after signing in",
        expected: 403,
        cookie: async () => {
          const { session, account } = await signedInOperator();
          world.accounts.setRoleOf(account.id, "client");
          return session.cookie;
        },
      },
    ];

    it.each(CALLERS)(
      "$title: the answer, no bucket counted, no store asked, nothing written, the kitchen unchanged",
      async ({ expected, cookie }) => {
        const id = route.plantReady();
        const before = actions.store.heldKitchen(id);
        const sessionCookie = await cookie();

        const answer = await route.ask(id, {
          ...(sessionCookie === undefined ? {} : { cookie: sessionCookie }),
        });

        expect(answer.status).toBe(expected);
        expectNothingReached();
        expect(actions.store.heldKitchen(id)).toEqual(before);
        expect(actions.store.heldNotes(id)).toEqual([]);
        expect(actions.store.heldStatus(id)).toBeUndefined();
      },
    );

    it("is refused 403 for a demoted caller even when the request carries the old role in a header and the body", async () => {
      const id = route.plantReady();
      const { session, account } = await signedInOperator();
      world.accounts.setRoleOf(account.id, "client");

      const answer = await route.ask(id, {
        cookie: session.cookie,
        headers: { "x-role": "operator" },
      });

      expect(answer.status).toBe(403);
      expectNothingReached();
    });
  },
);

describe.each(BODY_ROUTES)(
  "$name: what is judged before the session, and what after",
  (route) => {
    const NOT_JSON = "{not json";

    it("answers 415 to an anonymous caller who sends the wrong media type, before any session is read and any bucket is counted", async () => {
      const id = route.plantReady();
      world.calls.length = 0;

      const answer = await route.ask(id, {
        json: JSON.stringify(route.validBody),
        contentType: "text/plain",
      });

      expect(answer.status).toBe(415);
      expect(world.calls).toEqual([]);
      expectNothingReached();
    });

    it("answers 413 to an anonymous caller whose body is past 8 KiB, before any session is read and any bucket is counted", async () => {
      const id = route.plantReady();
      world.calls.length = 0;

      const answer = await route.ask(id, {
        json: paddedTo(MAX_BODY_BYTES + 1, JSON.stringify(route.validBody)),
      });

      expect(answer.status).toBe(413);
      expect(world.calls).toEqual([]);
      expectNothingReached();
    });

    it("answers 401 to an anonymous caller and 403 to a client whose body is not JSON: the body is parsed after the caller is admitted", async () => {
      const id = route.plantReady();
      const client = await signedInAs({ role: "client" });

      const anonymous = await route.ask(id, { json: NOT_JSON });
      const asClient = await route.ask(id, {
        json: NOT_JSON,
        cookie: client.session.cookie,
      });

      expect([anonymous.status, asClient.status]).toEqual([401, 403]);
      expectNothingReached();
    });

    it("answers an operator who sends a malformed id and a body that is not JSON with the one kitchen refusal, not 400", async () => {
      const { session } = await signedInOperator();

      const answer = await route.ask("not-an-id", {
        json: NOT_JSON,
        cookie: session.cookie,
      });

      expect(answer.status).toBe(404);
      expectNothingReached();
    });

    it("answers a body whose stream breaks with 400 invalid-request, before any session is read and any bucket is counted", async () => {
      const id = route.plantReady();
      const broken = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"te'));
          controller.error(new Error("connection reset"));
        },
      });
      world.calls.length = 0;

      const answer = await route.askRaw(id, {
        body: broken,
        contentType: "application/json",
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(world.calls).toEqual([]);
      expectNothingReached();
    });
  },
);

describe.each(WRITE_ROUTES)(
  "$name: an id that is not a design id's shape",
  (route) => {
    const SHAPED = "Q".repeat(21);
    const MALFORMED_IDS: readonly (readonly [string, string])[] = [
      ["a trailing line feed", `${SHAPED}\n`],
      ["a trailing space", `${SHAPED} `],
      ["twenty characters", "Q".repeat(20)],
      ["twenty-two characters", "Q".repeat(22)],
      [
        "a Cyrillic capital A in place of a Latin one",
        `${"Q".repeat(20)}\u0410`,
      ],
      ["a full-width letter", `${"Q".repeat(20)}\uFF21`],
      ["a null character", `${"Q".repeat(20)}\u0000`],
      ["a slash inside", `${"Q".repeat(10)}/${"Q".repeat(10)}`],
      ["a percent sign", `${"Q".repeat(20)}%`],
      ["no characters", ""],
      ["dot dot", ".."],
      ["a very long id", "Q".repeat(5000)],
    ];

    it.each(MALFORMED_IDS)(
      "is refused with the read route's own 404, byte for byte, and costs no bucket and no store call: %s",
      async (_title, id) => {
        const { session } = await signedInOperator();
        const readAnswer = await READ_ONE(
          accountRequest("/api/staff/kitchens/x", {
            cookie: session.cookie,
            headers: { "x-forwarded-for": "192.0.2.10" },
          }),
          { params: Promise.resolve({ id }) },
        );
        limiterLedger.counted.length = 0;
        staffWorld.calls.length = 0;

        const answer = await route.ask(id, { cookie: session.cookie });

        expect(answer.status).toBe(404);
        expect(await wireOf(answer)).toBe(await wireOf(readAnswer));
        expect(actions.calls).toEqual([]);
        expect(staffWorld.audit.heldEvents()).toEqual([]);
        expect(limiterLedger.counted).toEqual([]);
      },
    );

    it("is refused with the read route's own 404, byte for byte, when the id has the shape and no kitchen has it", async () => {
      const { session } = await signedInOperator();
      const readAnswer = await READ_ONE(
        accountRequest("/api/staff/kitchens/x", {
          cookie: session.cookie,
          headers: { "x-forwarded-for": "192.0.2.10" },
        }),
        { params: Promise.resolve({ id: UNKNOWN_ID }) },
      );

      const answer = await route.ask(UNKNOWN_ID, { cookie: session.cookie });

      expect(await wireOf(answer)).toBe(await wireOf(readAnswer));
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    });

    it("is refused the same for a kitchen the reader would show: the write route's 404 for a client-deleted kitchen equals the read route's", async () => {
      const { session } = await signedInOperator();
      const planted = plantKitchen({
        accountId: null,
        isDeletedByClient: true,
      });
      plantActionKitchen({ id: planted.id, isDeletedByClient: true });
      const readAnswer = await READ_ONE(
        accountRequest("/api/staff/kitchens/x", {
          cookie: session.cookie,
          headers: { "x-forwarded-for": "192.0.2.10" },
        }),
        { params: Promise.resolve({ id: planted.id }) },
      );

      const answer = await route.ask(planted.id, { cookie: session.cookie });

      expect(readAnswer.status).toBe(404);
      expect(await wireOf(answer)).toBe(await wireOf(readAnswer));
    });
  },
);

describe("what the store is handed", () => {
  function sha256Of(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
  }

  it("is, for a note, the judged text and the kitchen, with the session named by its hash alone and no account member", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const addNote = vi.spyOn(actions.store, "addNote");

    await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: "  re\u0301sume\u0301  " },
    });

    expect(addNote).toHaveBeenCalledTimes(1);
    const [request] = addNote.mock.calls[0] ?? [];
    expect(Object.keys(request ?? {}).sort()).toEqual([
      "designId",
      "session",
      "text",
    ]);
    expect(request?.text).toBe("r\u00E9sum\u00E9");
    expect(request?.designId).toBe(id);
    expect(request?.session.sessionTokenHash).toBe(sha256Of(session.value));
    expect(Object.keys(request?.session ?? {}).sort()).toEqual([
      "idleLifetimeSeconds",
      "sessionTokenHash",
    ]);
    expect(JSON.stringify(request)).not.toContain(session.value);
  });

  it("is, for a status, the listed word, the listed word the page saw and the kitchen, with no account member", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const setStatus = vi.spyOn(actions.store, "setStatus");

    await STATUS_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { status: "offer-sent", from: "new" },
    });

    const [request] = setStatus.mock.calls[0] ?? [];
    expect(Object.keys(request ?? {}).sort()).toEqual([
      "designId",
      "seenStatus",
      "session",
      "status",
    ]);
    expect(request?.status).toBe("offer-sent");
    expect(request?.seenStatus).toBe("new");
    expect(JSON.stringify(request)).not.toContain(session.value);
  });

  it("is, for an unhide, the kitchen and the session alone, whatever the request carried", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    const unhide = vi.spyOn(actions.store, "unhide");

    await UNHIDE_ROUTE.ask(id, {
      cookie: session.cookie,
      headers: { "x-account-id": "someone-else" },
      search: "?accountId=someone-else&id=other",
    });

    const [request] = unhide.mock.calls[0] ?? [];
    expect(Object.keys(request ?? {}).sort()).toEqual(["designId", "session"]);
    expect(request?.designId).toBe(id);
  });
});

describe("the body's size, counted in bytes as they are read", () => {
  const NOTE_JSON = JSON.stringify({ text: "A note" });
  const STATUS_JSON = JSON.stringify({ status: "closed", from: "new" });

  it.each([
    ["notes", NOTES_ROUTE, NOTE_JSON, 201],
    ["status", STATUS_ROUTE, STATUS_JSON, 200],
  ] as const)(
    "%s: a body of exactly 8192 bytes is read and judged, and one of 8193 is 413",
    async (_name, route, json, success) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const atTheBound = await route.ask(id, {
        cookie: session.cookie,
        json: paddedTo(MAX_BODY_BYTES, json),
      });
      const pastTheBound = await route.ask(id, {
        cookie: session.cookie,
        json: paddedTo(MAX_BODY_BYTES + 1, json),
      });

      expect(atTheBound.status).toBe(success);
      expect(pastTheBound.status).toBe(413);
      expect(await jsonOf(pastTheBound)).toEqual({ status: "body-too-large" });
    },
  );

  it("notes: a text of 8181 letters makes a body of exactly 8192 bytes, which the bound lets through to the text's own refusal", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const json = JSON.stringify({ text: "a".repeat(8181) });
    expect(byteLengthOf(json)).toBe(MAX_BODY_BYTES);

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "TOO_LONG" }],
    });
  });

  it("notes: 2001 characters of four bytes each fit under the bound and are refused by the text's length, not by the size", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: "\u{1F600}".repeat(2001) },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "TOO_LONG" }],
    });
  });

  it("counts bytes and not characters: fewer than 8192 two-byte letters make a body past the bound", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const json = JSON.stringify({ status: "\u00E9".repeat(4090) });
    expect(json.length).toBeLessThan(MAX_BODY_BYTES);
    expect(byteLengthOf(json)).toBeGreaterThan(MAX_BODY_BYTES);

    const answer = await STATUS_ROUTE.ask(id, { cookie: session.cookie, json });

    expect(answer.status).toBe(413);
  });

  it("reads a four-byte character that arrives one byte to a chunk as one character", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const bytes = new TextEncoder().encode(
      JSON.stringify({ text: "a\u{1F600}b" }),
    );
    const oneByteAtATime = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });

    const answer = await NOTES_ROUTE.askRaw(id, {
      cookie: session.cookie,
      body: oneByteAtATime,
      contentType: "application/json",
    });

    expect(answer.status).toBe(201);
    expect(actions.store.heldNotes(id)[0]?.text).toBe("a\u{1F600}b");
  });

  it("answers 413 for a stream that sends more than the bound in many small chunks", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const chunk = new TextEncoder().encode(" ".repeat(512));
    const manyChunks = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":"closed"}'));
        for (let sent = 0; sent < 17; sent += 1) controller.enqueue(chunk);
        controller.close();
      },
    });

    const answer = await STATUS_ROUTE.askRaw(id, {
      cookie: session.cookie,
      body: manyChunks,
      contentType: "application/json",
    });

    expect(answer.status).toBe(413);
    expect(actions.calls).toEqual([]);
  });
});

describe("a body that is JSON but not what the route takes", () => {
  const SHAPES_OF_JSON_VALUE: readonly (readonly [string, string])[] = [
    ["a number", "1"],
    ["true", "true"],
    ["a string", '"text"'],
    ["null", "null"],
    ["an empty array", "[]"],
    ["an array holding the member", '[{"text":"x"}]'],
    ["an object with nothing in it, which is a missing member", "{}"],
  ];

  it.each(BODY_ROUTES)(
    "$name: reads a value that is not an object as 400 invalid-request and names nothing",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      for (const [, json] of SHAPES_OF_JSON_VALUE.slice(0, 6)) {
        const answer = await route.ask(id, { cookie: session.cookie, json });
        expect(answer.status).toBe(400);
        expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      }
      expectNothingReached();
    },
  );

  it.each([
    ["notes", NOTES_ROUTE, ["text"]],
    ["status", STATUS_ROUTE, ["status", "from"]],
  ] as const)(
    "%s: takes an empty object as missing members, not as an invalid request",
    async (_name, route, fields) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await route.ask(id, {
        cookie: session.cookie,
        json: "{}",
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: fields.map((field) => ({ field, code: "REQUIRED" })),
      });
    },
  );

  it.each(BODY_ROUTES)(
    "$name: refuses a prototype-shaped member as an unexpected member, whatever it holds",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();
      const field = Object.keys(route.validBody ?? {})[0] ?? "";
      const value = JSON.stringify(Object.values(route.validBody ?? {})[0]);

      for (const json of [
        `{"__proto__":{"${field}":${value}}}`,
        `{"constructor":{"prototype":{"${field}":${value}}}}`,
        `{"${field}":${value},"__proto__":null}`,
        `{"${field}":${value},"constructor":1}`,
        `{"${field}":${value},"toString":1}`,
        `{"__proto__":${value}}`,
      ]) {
        const answer = await route.ask(id, { cookie: session.cookie, json });
        expect(answer.status).toBe(400);
        expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      }
      expectNothingReached();
    },
  );

  it.each([
    ["a number past the range of a double", '{"text":1e400}', "NOT_TEXT"],
    ["a very long integer", `{"text":${"9".repeat(4000)}}`, "NOT_TEXT"],
    ["a negative zero", '{"text":-0}', "NOT_TEXT"],
    [
      "deeply nested arrays as the member",
      `{"text":${"[".repeat(3000)}${"]".repeat(3000)}}`,
      "NOT_TEXT",
    ],
    [
      "deeply nested objects as the member",
      `{"text":${'{"a":'.repeat(1300)}1${"}".repeat(1300)}}`,
      "NOT_TEXT",
    ],
  ])(
    "notes: %s is a text that is not text, 400 and not 503",
    async (_title, json, code) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await NOTES_ROUTE.ask(id, {
        cookie: session.cookie,
        json,
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "text", code }],
      });
    },
  );

  it.each(BODY_ROUTES)(
    "$name: reads a body of 4000 opening brackets, nesting past what the bound allows to close, as 400 and not 503",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await route.ask(id, {
        cookie: session.cookie,
        json: "[".repeat(4000),
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    },
  );

  it.each(BODY_ROUTES)(
    "$name: refuses text after the JSON value, and accepts only whitespace after it",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();
      const valid = JSON.stringify(route.validBody);

      const garbage = await route.ask(id, {
        cookie: session.cookie,
        json: `${valid}garbage`,
      });
      const secondValue = await route.ask(id, {
        cookie: session.cookie,
        json: `${valid}${valid}`,
      });
      const leading = await route.ask(id, {
        cookie: session.cookie,
        json: `x${valid}`,
      });
      const whitespace = await route.ask(id, {
        cookie: session.cookie,
        json: ` \n\t${valid} \r\n`,
      });

      expect([garbage.status, secondValue.status, leading.status]).toEqual([
        400, 400, 400,
      ]);
      expect(whitespace.status).toBe(route.success);
    },
  );

  it.each(BODY_ROUTES)(
    "$name: takes the last of two members of one name (observed behaviour of JSON.parse, not a ruling), and judges that one",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();
      const [[field = "", first] = [], ...others] = Object.entries(
        route.validBody ?? {},
      );
      const valid = JSON.stringify(first);
      const rest = others
        .map(([name, value]) => `,"${name}":${JSON.stringify(value)}`)
        .join("");

      const lastIsValid = await route.ask(id, {
        cookie: session.cookie,
        json: `{"${field}":5,"${field}":${valid}${rest}}`,
      });
      const lastIsNot = await route.ask(id, {
        cookie: session.cookie,
        json: `{"${field}":${valid},"${field}":5${rest}}`,
      });

      expect(lastIsValid.status).toBe(route.success);
      expect(lastIsNot.status).toBe(400);
      expect(await jsonOf(lastIsNot)).toEqual({
        status: "invalid-input",
        issues: [{ field, code: "NOT_TEXT" }],
      });
    },
  );

  it("notes: stores the second of two texts of one name", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: '{"text":"first","text":"second"}',
    });

    expect(answer.status).toBe(201);
    expect(actions.store.heldNotes(id).map(({ text }) => text)).toEqual([
      "second",
    ]);
  });

  it("notes: reads a body that begins with a byte order mark as the body without it (observed: the decoder drops it)", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: `\uFEFF{"text":"after a mark"}`,
    });

    expect(answer.status).toBe(201);
    expect(actions.store.heldNotes(id)[0]?.text).toBe("after a mark");
  });

  it("notes: stores a text without the format characters the domain strips, and refuses a text that is nothing else", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const inside = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: "b\uFEFFa\u200Bc" },
    });
    const only = await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: { text: "\uFEFF\u200B" },
    });

    expect(inside.status).toBe(201);
    expect(actions.store.heldNotes(id).map(({ text }) => text)).toEqual([
      "bac",
    ]);
    expect(only.status).toBe(400);
    expect(await jsonOf(only)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "REQUIRED" }],
    });
  });

  it("notes: reads a byte that is not UTF-8 as the replacement character and stores the note (observed behaviour, not a ruling: the body is never refused for its encoding)", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('{"text":"a'),
      0xff,
      ...new TextEncoder().encode('b"}'),
    ]);

    const answer = await NOTES_ROUTE.askRaw(id, {
      cookie: session.cookie,
      body: bytes,
      contentType: "application/json",
    });

    expect(answer.status).toBe(201);
    expect(actions.store.heldNotes(id)[0]?.text).toBe("a\uFFFDb");
  });
});

describe("the media type", () => {
  it.each(BODY_ROUTES)(
    "$name: is 415 for a type that merely contains or resembles json",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();
      const json = JSON.stringify(route.validBody);

      for (const contentType of [
        "application/json-patch+json",
        "application/jsonp",
        "application/json5",
        "application/x-json",
        "application/vnd.api+json",
        "text/json",
        "text/plain; application/json",
        "json",
        "application/*",
        "",
        "application/json,text/plain",
        "application/json text/plain",
      ]) {
        const answer = await route.ask(id, {
          cookie: session.cookie,
          json,
          contentType,
        });
        expect([contentType, answer.status]).toEqual([contentType, 415]);
      }
      expectNothingReached();
    },
  );

  it.each(BODY_ROUTES)(
    "$name: takes the type alone, whatever its case, its spaces and its parameters",
    async (route) => {
      const { session } = await signedInOperator();
      const json = JSON.stringify(route.validBody);

      for (const contentType of [
        "application/json",
        "APPLICATION/JSON",
        "Application/Json; charset=UTF-8",
        "application/json;charset=utf-8",
        "  application/json  ",
        "application/json; boundary=something; q=0.5",
        "application/json;",
      ]) {
        // A kitchen of its own for each, since a second save of the same body is a page that read an older status.
        const { id } = plantActionKitchen();
        const answer = await route.ask(id, {
          cookie: session.cookie,
          json,
          contentType,
        });
        expect([contentType, answer.status]).toEqual([
          contentType,
          route.success,
        ]);
      }
    },
  );

  it.each(BODY_ROUTES)(
    "$name: is 415 for a body sent with no media type at all",
    async (route) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await route.ask(id, {
        cookie: session.cookie,
        json: JSON.stringify(route.validBody),
        contentType: null,
      });

      expect(answer.status).toBe(415);
      expectNothingReached();
    },
  );
});

describe("the query string and the method", () => {
  it.each(WRITE_ROUTES)(
    "$name: ignores every member of the query string",
    async (route) => {
      const { session } = await signedInOperator();
      const id = route.plantReady();

      const answer = await route.ask(id, {
        cookie: session.cookie,
        search:
          "?text=FROM-QUERY&status=closed&id=Z&accountId=A&role=administrator&capabilities=audit.read",
      });

      expect(answer.status).toBe(route.success);
      expect(actions.store.heldNotes(id).map(({ text }) => text)).toEqual(
        route.name === "notes" ? ["A note"] : [],
      );
      expect(actions.store.heldStatus(id)?.status).toBe(
        route.name === "status" ? "contacted" : undefined,
      );
    },
  );

  it("exports one method for each route and no route file beside the three under the kitchen's write paths", () => {
    const appRoot = join(__dirname, "../../../../src/app/api/staff/kitchens");
    const routeFiles = filesUnder(appRoot, /^route\.ts$/)
      .map((path) => path.slice(appRoot.length))
      .sort();

    expect(routeFiles).toEqual([
      "/[id]/notes/route.ts",
      "/[id]/route.ts",
      "/[id]/status/route.ts",
      "/[id]/unhide/route.ts",
      "/route.ts",
    ]);
  });

  it("exports no method beyond the one each route takes (no PUT or PATCH or DELETE on notes, no POST on status)", async () => {
    const notes = await import("@/app/api/staff/kitchens/[id]/notes/route");
    const status = await import("@/app/api/staff/kitchens/[id]/status/route");
    const unhide = await import("@/app/api/staff/kitchens/[id]/unhide/route");

    expect(Object.keys(notes).sort()).toEqual(["POST", "dynamic", "runtime"]);
    expect(Object.keys(status).sort()).toEqual(["PUT", "dynamic", "runtime"]);
    expect(Object.keys(unhide).sort()).toEqual(["POST", "dynamic", "runtime"]);
  });
});

describe("a status word that is nearly a listed one", () => {
  const NEARLY: readonly (readonly [string, string])[] = [
    ["capitals", "NEW"],
    ["a leading space", " new"],
    ["a trailing line feed", "new\n"],
    ["a trailing null character", "new\u0000"],
    ["a zero-width space inside", "ne\u200Bw"],
    ["a zero-width joiner after", "new\u200D"],
    ["a Cyrillic e", "n\u0435w"],
    ["a full-width n", "\uFF4Eew"],
    ["a decomposed accent", "ne\u0301w"],
    ["the word of an old list", "won"],
    ["a listed word with an underscore for the hyphen", "offer_sent"],
    ["a listed word with a non-breaking hyphen", "offer\u2011sent"],
    ["two listed words", "new,closed"],
    ["the word 'undefined'", "undefined"],
    ["__proto__", "__proto__"],
    ["hasOwnProperty", "hasOwnProperty"],
  ];

  it.each(NEARLY)(
    "is 400 STATUS_NOT_IN_LIST and writes nothing: %s",
    async (_title, status) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await STATUS_ROUTE.ask(id, {
        cookie: session.cookie,
        json: { status, from: "new" },
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "status", code: "STATUS_NOT_IN_LIST" }],
      });
      expectNothingReached();
      expect(actions.store.heldStatus(id)).toBeUndefined();
    },
  );
});

describe("the cross-site guard", () => {
  const FOREIGN = "https://evil.example";
  const SIBLING = "https://admin.lemnaria.test";

  interface Case {
    readonly title: string;
    readonly secFetchSite: string | null;
    readonly origin?: string;
    readonly isRefused: boolean;
  }

  const CASES: readonly Case[] = [
    {
      title: "a foreign Origin alone",
      secFetchSite: null,
      origin: FOREIGN,
      isRefused: true,
    },
    {
      title: "Origin: null alone",
      secFetchSite: null,
      origin: "null",
      isRefused: true,
    },
    {
      title: "a sibling subdomain's Origin alone",
      secFetchSite: null,
      origin: SIBLING,
      isRefused: true,
    },
    {
      title: "the same host over http, Origin alone",
      secFetchSite: null,
      origin: "http://lemnaria.test",
      isRefused: true,
    },
    {
      title: "the same host on another port, Origin alone",
      secFetchSite: null,
      origin: `${ORIGIN}:8443`,
      isRefused: true,
    },
    {
      title: "an empty Origin alone",
      secFetchSite: null,
      origin: "",
      isRefused: true,
    },
    {
      title: "Sec-Fetch-Site: cross-site with the matching Origin",
      secFetchSite: "cross-site",
      origin: ORIGIN,
      isRefused: true,
    },
    {
      title: "Sec-Fetch-Site: same-site with the matching Origin",
      secFetchSite: "same-site",
      origin: ORIGIN,
      isRefused: true,
    },
    {
      title: "Sec-Fetch-Site: none (typed address)",
      secFetchSite: "none",
      isRefused: true,
    },
    {
      title: "Sec-Fetch-Site in capitals",
      secFetchSite: "Same-Origin",
      isRefused: true,
    },
    { title: "an empty Sec-Fetch-Site", secFetchSite: "", isRefused: true },
    {
      title: "neither header (a caller that is not a browser)",
      secFetchSite: null,
      isRefused: false,
    },
    {
      title: "the matching Origin alone",
      secFetchSite: null,
      origin: ORIGIN,
      isRefused: false,
    },
    {
      title:
        "Sec-Fetch-Site: same-origin with a foreign Origin (the fetch metadata wins)",
      secFetchSite: "same-origin",
      origin: FOREIGN,
      isRefused: false,
    },
    {
      title: "Sec-Fetch-Site: same-origin with Origin: null",
      secFetchSite: "same-origin",
      origin: "null",
      isRefused: false,
    },
  ];

  describe.each(WRITE_ROUTES)("$name", (route) => {
    it.each(CASES)("$title", async ({ secFetchSite, origin, isRefused }) => {
      const { session } = await signedInOperator();
      const id = route.plantReady();
      world.calls.length = 0;

      const answer = await route.ask(id, {
        cookie: session.cookie,
        secFetchSite,
        ...(origin === undefined ? {} : { headers: { origin } }),
      });

      if (isRefused) {
        expect(answer.status).toBe(403);
        expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
        expect(world.calls).toEqual([]);
        expectNothingReached();
        return;
      }
      expect(answer.status).toBe(route.success);
    });
  });
});

describe("the capabilities the routes name", () => {
  it("exist in the domain table and are held by the operator and the administrator and by no client", async () => {
    const { CAPABILITIES, hasCapability } = await import(
      "@lemnaria/configurator-domain"
    );

    for (const route of WRITE_ROUTES) {
      expect(CAPABILITIES).toContain(route.capability);
      expect(hasCapability("operator", route.capability)).toBe(true);
      expect(hasCapability("administrator", route.capability)).toBe(true);
      expect(hasCapability("client", route.capability)).toBe(false);
      expect(hasCapability("", route.capability)).toBe(false);
      expect(hasCapability("__proto__", route.capability)).toBe(false);
    }
  });

  it("keeps the operator out of the capabilities that are not a kitchen write (K-1: audit, presets, team)", async () => {
    const { hasCapability } = await import("@lemnaria/configurator-domain");

    for (const capability of [
      "audit.read",
      "preset.manage",
      "user.manage",
    ] as const) {
      expect(hasCapability("operator", capability)).toBe(false);
    }
  });
});

describe("the log of a request that is read and refused", () => {
  it("writes no line at all for a cross-site request, a wrong media type or a body past the bound", async () => {
    const { session } = await signedInOperator();
    const id = plantActionKitchen().id;

    await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      secFetchSite: "cross-site",
    });
    await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: "{}",
      contentType: "text/plain",
    });
    await NOTES_ROUTE.ask(id, {
      cookie: session.cookie,
      json: paddedTo(MAX_BODY_BYTES + 1, "{}"),
    });

    expect(console_.accountLines()).toEqual([]);
    expect(JSON.parse(console_.everything())).toEqual([]);
  });
});
