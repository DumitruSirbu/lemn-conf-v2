import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";

import {
  DRIVER_FAILURE_MARKER,
  DUPLICATE_BY_ACCOUNT_POLICY_NAME,
  MINT_POLICY_NAME,
  SAVE_BY_ACCOUNT_POLICY_NAME,
  accountRequest,
  aDesign,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedKitchen,
  seedSession,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  setCookieLinesOf,
  wireOf,
  type AccountRequestInit,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
  expectAWaitWithinTheWindowOf,
} from "../../../support/account-world";

vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-kitchen-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountKitchenStoreModule(),
  ),
);

const { PATCH: renameRoute, DELETE: deleteRoute } = await import(
  "@/app/api/account/kitchens/[id]/route"
);
const { POST: duplicateRoute } = await import(
  "@/app/api/account/kitchens/[id]/duplicate/route"
);
const { POST: hideRoute } = await import(
  "@/app/api/account/kitchens/[id]/hide/route"
);

/**
 * E2 rename, E3 duplicate, E4 delete and E5 hide (M8B Lot 2 plan, section 2.2 and criteria 1, 3, 4, 6, 7, 13). One
 * table of the four routes, so every rule that is common to them is asserted of each and none can be forgotten by one.
 */

const KITCHEN_ID = "abcdefghijklmnopqrstu";
const SENT_AT = new Date("2026-10-18T09:00:00.000Z");
const UPDATED_AT = new Date("2026-10-19T09:00:00.000Z");
const NEW_NAME = "Block kitchen";

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  client = await seedVerifiedAccount({ email: "client@example.test" });
  session = await seedSession(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface Mutation {
  readonly label: string;
  readonly event: string;
  readonly isBodied: boolean;
  /** The port method that writes. */
  readonly writeMethod: string;
  /** The policies a request that passes validation counts, in order. */
  readonly counted: readonly string[];
  /** A kitchen of the client that the route can act on. */
  readonly actionableState: { sent: boolean };
  send(id: string, init?: AccountRequestInit): Promise<Response>;
}

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

const MUTATIONS: readonly Mutation[] = [
  {
    label: "rename",
    event: "kitchen-rename",
    isBodied: true,
    writeMethod: "kitchens.rename",
    counted: [SAVE_BY_ACCOUNT_POLICY_NAME],
    actionableState: { sent: false },
    send: (id, init = {}) =>
      renameRoute(
        accountRequest(`/api/account/kitchens/${id}`, {
          method: "PATCH",
          json: { name: NEW_NAME },
          cookie: session.cookie,
          ...init,
        }),
        paramsOf(id),
      ),
  },
  {
    label: "duplicate",
    event: "kitchen-duplicate",
    isBodied: true,
    writeMethod: "kitchens.duplicate",
    counted: [MINT_POLICY_NAME, DUPLICATE_BY_ACCOUNT_POLICY_NAME],
    actionableState: { sent: false },
    send: (id, init = {}) =>
      duplicateRoute(
        accountRequest(`/api/account/kitchens/${id}/duplicate`, {
          method: "POST",
          json: { name: `${NEW_NAME} (copie)` },
          cookie: session.cookie,
          ...init,
        }),
        paramsOf(id),
      ),
  },
  {
    label: "delete",
    event: "kitchen-delete",
    isBodied: false,
    writeMethod: "kitchens.markDeleted",
    counted: [SAVE_BY_ACCOUNT_POLICY_NAME],
    actionableState: { sent: false },
    send: (id, init = {}) =>
      deleteRoute(
        accountRequest(`/api/account/kitchens/${id}`, {
          method: "DELETE",
          cookie: session.cookie,
          ...init,
        }),
        paramsOf(id),
      ),
  },
  {
    label: "hide",
    event: "kitchen-hide",
    isBodied: false,
    writeMethod: "kitchens.hide",
    counted: [SAVE_BY_ACCOUNT_POLICY_NAME],
    actionableState: { sent: true },
    send: (id, init = {}) =>
      hideRoute(
        accountRequest(`/api/account/kitchens/${id}/hide`, {
          method: "POST",
          cookie: session.cookie,
          ...init,
        }),
        paramsOf(id),
      ),
  },
];

function mutationNamed(label: string): Mutation {
  const found = MUTATIONS.find((candidate) => candidate.label === label);
  if (found === undefined) throw new Error(`no mutation ${label}`);
  return found;
}

const BODIED = MUTATIONS.filter(({ isBodied }) => isBodied);

function seedActionable(
  mutation: Mutation,
  extra: Partial<Parameters<typeof seedKitchen>[0]> = {},
) {
  return seedKitchen({
    accountId: client.id,
    id: KITCHEN_ID,
    updatedAt: UPDATED_AT,
    ...(mutation.actionableState.sent ? { sentAt: SENT_AT } : {}),
    ...extra,
  });
}

function everyRow(): unknown[] {
  return [world.kitchens.held(KITCHEN_ID)];
}

describe.each(MUTATIONS)("$label: the order of the checks", (mutation) => {
  it("refuses a cross-site request first: no session read, nothing counted, nothing read or written", async () => {
    seedActionable(mutation);
    const before = everyRow();
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await mutation.send(KITCHEN_ID, { secFetchSite });

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    const foreignOrigin = await mutation.send(KITCHEN_ID, {
      secFetchSite: null,
      headers: { origin: "https://evil.example" },
    });
    expect(foreignOrigin.status).toBe(403);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(everyRow()).toEqual(before);
    expect(world.revokedShareLinks).toEqual([]);
  });

  it("answers 401 to a request with no live session, before any kitchen is read", async () => {
    seedActionable(mutation);
    const ended = await seedSession(client);
    await world.sessions.revokeAllForAccount(client.id);
    world.calls.length = 0;
    const console_ = captureConsole();

    for (const cookie of [
      undefined,
      "__Host-lemnaria_session=garbage",
      ended.cookie,
    ]) {
      const answer = await mutation.send(KITCHEN_ID, {
        ...(cookie === undefined ? { cookie: "" } : { cookie }),
      });

      expect(answer.status).toBe(401);
      expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
    }
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual(
      [],
    );
    expect(limiterLedger.counted).toEqual([]);
    expect(console_.accountLines()).toEqual(
      Array.from({ length: 3 }, () => ({
        event: mutation.event,
        outcome: "refused",
      })),
    );
  });

  it("answers 403, never 200 and never the kitchen refusal, to staff, who hold no design.edit.own", async () => {
    seedActionable(mutation);
    const staff = await seedVerifiedAccount({
      email: "staff@example.test",
      role: "operator",
    });
    const staffSession = await seedSession(staff);
    world.calls.length = 0;
    const console_ = captureConsole();

    const answer = await mutation.send(KITCHEN_ID, {
      cookie: staffSession.cookie,
    });
    expect(console_.accountLines()).toEqual([
      { event: mutation.event, outcome: "refused" },
    ]);

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "forbidden" });
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual(
      [],
    );
    expect(limiterLedger.counted).toEqual([]);
  });

  it("answers 403 to a live session whose address is not confirmed: a design capability needs it", async () => {
    seedActionable(mutation);
    const unconfirmed = await seedUnverifiedAccount("unconfirmed@example.test");
    const unconfirmedSession = await seedSession(unconfirmed);
    const before = everyRow();
    world.calls.length = 0;

    const answer = await mutation.send(KITCHEN_ID, {
      cookie: unconfirmedSession.cookie,
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "forbidden" });
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual(
      [],
    );
    expect(everyRow()).toEqual(before);
  });

  it("answers an id that is not a design id's shape the kitchen refusal, counting nothing and asking no store", async () => {
    world.calls.length = 0;
    for (const badId of [
      "short",
      "a".repeat(22),
      "a".repeat(20),
      "..%2F..",
      "ab cd",
      "é".repeat(21),
      "0".repeat(300),
    ]) {
      const answer = await mutation.send(badId);

      expect(await wireOf(answer)).toBe(
        await wireOf(designNotFoundResponse(badId)),
      );
      expect(answer.status).toBe(404);
    }
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual(
      [],
    );
    expect(limiterLedger.counted).toEqual([]);
  });

  it("answers 503 and leaks no cause when the session store fails, and not 401", async () => {
    seedActionable(mutation);
    const console_ = captureConsole();
    world.failOn("sessions.findLive");

    const answer = await mutation.send(KITCHEN_ID);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.accountLines()).toContainEqual({
      event: mutation.event,
      outcome: "unavailable",
    });
  });

  it("answers 503 and leaks no cause when the kitchen store fails, changing nothing", async () => {
    seedActionable(mutation);
    const before = everyRow();
    const console_ = captureConsole();
    world.failOn(mutation.writeMethod);

    const answer = await mutation.send(KITCHEN_ID);

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(everyRow()).toEqual(before);
  });
});

describe.each(BODIED)("$label: the body", (mutation) => {
  it("checks the id's shape before the body: a bad id with a bad name is still the kitchen refusal", async () => {
    for (const json of [{ name: "" }, "not json", "[]"]) {
      const answer = await mutation.send("short", { json });

      expect(answer.status).toBe(404);
    }
  });

  it("answers 415 to a body that is not JSON, before the session is read", async () => {
    world.calls.length = 0;

    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "application/jsonp",
      null,
    ]) {
      const answer = await mutation.send(KITCHEN_ID, {
        cookie: "",
        contentType,
        json: JSON.stringify({ name: NEW_NAME }),
      });

      expect(answer.status).toBe(415);
      expect(await jsonOf(answer)).toEqual({
        status: "unsupported-media-type",
      });
    }
    expect(world.calls).toEqual([]);
  });

  it("accepts the JSON media type whatever its case or parameters", async () => {
    seedActionable(mutation);

    for (const contentType of [
      "application/json; charset=utf-8",
      "APPLICATION/JSON",
      " application/json ;x=y",
    ]) {
      const answer = await mutation.send(KITCHEN_ID, { contentType });

      expect([200, 201]).toContain(answer.status);
    }
  });

  it("answers 413 to a body past 8 KiB, before the session is read", async () => {
    world.calls.length = 0;

    const answer = await mutation.send(KITCHEN_ID, {
      cookie: "",
      json: JSON.stringify({ name: "x", filler: "y".repeat(8 * 1024) }),
    });

    expect(answer.status).toBe(413);
    expect(await jsonOf(answer)).toEqual({ status: "body-too-large" });
    expect(world.calls).toEqual([]);
  });

  it.each([
    ["an empty body", ""],
    ["text that is not JSON", "not json"],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
    ["a JSON string", '"a name"'],
    ["a JSON number", "5"],
  ])(
    "answers 400 invalid-request to %s, counting nothing and writing nothing",
    async (_label, text) => {
      seedActionable(mutation);
      const before = everyRow();

      const answer = await mutation.send(KITCHEN_ID, { json: text });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(limiterLedger.counted).toEqual([]);
      expect(everyRow()).toEqual(before);
    },
  );

  const ASTRAL = "\u{1F600}";
  it.each([
    ["no name member", {}, "REQUIRED"],
    ["an empty name", { name: "" }, "REQUIRED"],
    [
      "a name of spaces, including a no-break and an em space",
      { name: "   \u00a0\u2003 " },
      "REQUIRED",
    ],
    ["a name with a tab", { name: "a\tb" }, "FORBIDDEN_CHARACTER"],
    ["a name of zero-width characters only", { name: "​‍﻿" }, "REQUIRED"],
    [
      "an inherited name only",
      JSON.parse('{"__proto__":{"name":"inherited"}}') as object,
      "REQUIRED",
    ],
    ["a name of 121 characters", { name: "n".repeat(121) }, "TOO_LONG"],
    [
      "a name of 121 astral characters",
      { name: ASTRAL.repeat(121) },
      "TOO_LONG",
    ],
    [
      "a name of 121 characters padded with spaces",
      { name: ` ${"n".repeat(121)} ` },
      "TOO_LONG",
    ],
    [
      "a name with a control character",
      { name: "a\u0007b" },
      "FORBIDDEN_CHARACTER",
    ],
    [
      "a name with a null character",
      { name: "a\u0000b" },
      "FORBIDDEN_CHARACTER",
    ],
    ["a name with a line break", { name: "a\nb" }, "FORBIDDEN_CHARACTER"],
    [
      "a name with a lone surrogate",
      { name: "a\ud800b" },
      "FORBIDDEN_CHARACTER",
    ],
    ["a number", { name: 5 }, "NOT_TEXT"],
    ["null", { name: null }, "NOT_TEXT"],
    ["a boolean", { name: true }, "NOT_TEXT"],
    ["an array", { name: ["a"] }, "NOT_TEXT"],
    ["an object", { name: { a: "b" } }, "NOT_TEXT"],
  ])(
    "answers 400 invalid-input, the field name and the code, to %s",
    async (_label, body, code) => {
      seedActionable(mutation);
      const before = everyRow();

      const answer = await mutation.send(KITCHEN_ID, { json: body });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "name", code }],
      });
      expect(limiterLedger.counted).toEqual([]);
      expect(
        world.calls.filter((call) => call.startsWith("kitchens.")),
      ).toEqual([]);
      expect(everyRow()).toEqual(before);
    },
  );

  it("never echoes the refused name", async () => {
    const answer = await mutation.send(KITCHEN_ID, {
      json: { name: `${"n".repeat(121)}-MARKER` },
    });

    expect(await answer.clone().text()).not.toContain("MARKER");
  });

  it("accepts 120 characters, in code points: 120 astral characters are 240 UTF-16 units and are accepted", async () => {
    seedActionable(mutation);
    const name = "\u{1F600}".repeat(120);

    const answer = await mutation.send(KITCHEN_ID, { json: { name } });

    expect([200, 201]).toContain(answer.status);
    if (answer.status === 200) expect(await jsonOf(answer)).toEqual({ name });
  });

  it("stores and answers the judged form: NFC, without format characters, trimmed", async () => {
    seedActionable(mutation);

    const answer = await mutation.send(KITCHEN_ID, {
      json: { name: "  Café​ de la mama  " },
    });

    expect([200, 201]).toContain(answer.status);
    const body = (await jsonOf(answer)) as { name?: string; id?: string };
    const stored =
      mutation.label === "rename"
        ? world.kitchens.held(KITCHEN_ID)
        : world.kitchens.held(body.id ?? "");
    expect(stored?.name).toBe("Café de la mama");
    if (mutation.label === "rename") expect(body.name).toBe("Café de la mama");
  });

  it("reads no member but the name: an account, a role, a document, a revision or a mark in the body changes nothing", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const theirs = seedKitchen({
      accountId: stranger.id,
      updatedAt: UPDATED_AT,
    });
    seedActionable(mutation);
    const theirsBefore = world.kitchens.held(theirs);
    const source = world.kitchens.held(KITCHEN_ID);

    const answer = await mutation.send(KITCHEN_ID, {
      json: {
        name: NEW_NAME,
        accountId: stranger.id,
        designId: theirs,
        role: "administrator",
        document: aDesign("injected"),
        revision: "99",
        sentAt: "2020-01-01T00:00:00.000Z",
        hiddenAt: "2020-01-01T00:00:00.000Z",
        deletedAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    });

    expect([200, 201]).toContain(answer.status);
    expect(world.kitchens.held(theirs)).toEqual(theirsBefore);
    const after = world.kitchens.held(KITCHEN_ID);
    expect(after?.design).toEqual(source?.design);
    expect(after?.accountId).toBe(client.id);
    expect(after?.updatedAt).toEqual(source?.updatedAt);
    expect(after?.sentAt).toEqual(source?.sentAt);
    expect(after?.hiddenAt).toBeUndefined();
    expect(after?.deletedAt).toBeUndefined();
  });

  it("counts nothing for a name it refuses and nothing for an id it refuses, though both precede the limiter", async () => {
    await mutation.send("nope", { json: { name: NEW_NAME } });
    await mutation.send(KITCHEN_ID, { json: { name: "" } });

    expect(limiterLedger.counted).toEqual([]);
  });
});

describe.each(MUTATIONS)("$label: the limiter", (mutation) => {
  it("counts the policies of the plan once each, in order, for a request that reaches the store", async () => {
    seedActionable(mutation);

    const answer = await mutation.send(KITCHEN_ID);

    expect([200, 201, 204]).toContain(answer.status);
    expect(limiterLedger.counted).toEqual(mutation.counted);
  });

  it("counts them for a kitchen the store then refuses too: the bucket is spent before the store is asked", async () => {
    const answer = await mutation.send(KITCHEN_ID);

    expect(answer.status).toBe(404);
    expect(limiterLedger.counted).toEqual(mutation.counted);
  });

  it.each(mutation.counted.map((policy, index) => [policy, index] as const))(
    "answers 429 with Retry-After when %s refuses, before the store is asked and with nothing written",
    async (policy, index) => {
      seedActionable(mutation);
      const before = everyRow();
      limiterLedger.refusing.set(policy, 321);
      world.calls.length = 0;

      const answer = await mutation.send(KITCHEN_ID);

      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, policy);
      expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
      expect(limiterLedger.counted).toEqual(
        mutation.counted.slice(0, index + 1),
      );
      expect(world.calls).not.toContain(mutation.writeMethod);
      expect(everyRow()).toEqual(before);
      expect(world.revokedShareLinks).toEqual([]);
    },
  );

  it.each(mutation.counted.map((policy) => policy))(
    "fails closed, 503 and no write, when %s cannot be judged",
    async (policy) => {
      seedActionable(mutation);
      const before = everyRow();
      limiterLedger.unavailable.add(policy);

      const answer = await mutation.send(KITCHEN_ID);

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(everyRow()).toEqual(before);
    },
  );
});

describe("duplicate: a copy is a mint, so the network's mint bucket comes first and the account's second", () => {
  const duplicate = mutationNamed("duplicate");

  function rowCount(): Promise<number> {
    return world.kitchens.countListed(client.id);
  }

  it("counts exactly the mint bucket then the account's copy bucket, and makes one row", async () => {
    seedActionable(duplicate);

    const answer = await duplicate.send(KITCHEN_ID);

    expect(answer.status).toBe(201);
    expect(limiterLedger.counted).toEqual([
      MINT_POLICY_NAME,
      DUPLICATE_BY_ACCOUNT_POLICY_NAME,
    ]);
    expect(await rowCount()).toBe(2);
  });

  it("stops at the mint bucket when it refuses: the account's bucket is not counted and no row is made", async () => {
    seedActionable(duplicate);
    limiterLedger.refusing.set(MINT_POLICY_NAME, 60);

    const answer = await duplicate.send(KITCHEN_ID);

    expect(answer.status).toBe(429);
    expect(limiterLedger.counted).toEqual([MINT_POLICY_NAME]);
    expect(await rowCount()).toBe(1);
  });

  it("stops at the account's bucket when only it refuses: both were asked, and no row is made", async () => {
    seedActionable(duplicate);
    limiterLedger.refusing.set(DUPLICATE_BY_ACCOUNT_POLICY_NAME, 60);

    const answer = await duplicate.send(KITCHEN_ID);

    expect(answer.status).toBe(429);
    expect(limiterLedger.counted).toEqual([
      MINT_POLICY_NAME,
      DUPLICATE_BY_ACCOUNT_POLICY_NAME,
    ]);
    expect(await rowCount()).toBe(1);
  });

  it("makes a new kitchen of the session's account whose document equals the source and whose every mark is clear", async () => {
    seedActionable(duplicate, { sentAt: SENT_AT, name: "Original" });
    const source = world.kitchens.held(KITCHEN_ID);

    const answer = await duplicate.send(KITCHEN_ID, {
      json: { name: "Original (copie)" },
    });
    const { id } = (await jsonOf(answer)) as { id: string };

    expect(answer.status).toBe(201);
    expect(Object.keys((await jsonOf(answer)) as object)).toEqual(["id"]);
    expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(id).not.toBe(KITCHEN_ID);
    const copy = world.kitchens.held(id);
    expect(copy).toMatchObject({
      accountId: client.id,
      name: "Original (copie)",
      design: source?.design,
    });
    expect(copy?.sentAt).toBeUndefined();
    expect(copy?.hiddenAt).toBeUndefined();
    expect(copy?.deletedAt).toBeUndefined();
    expect(world.kitchens.held(KITCHEN_ID)).toEqual(source);
  });

  it("never truncates a name: the client composes the whole of it, and the server refuses 121", async () => {
    seedActionable(duplicate);

    const refused = await duplicate.send(KITCHEN_ID, {
      json: { name: "c".repeat(121) },
    });
    const accepted = await duplicate.send(KITCHEN_ID, {
      json: { name: "c".repeat(120) },
    });
    const { id } = (await jsonOf(accepted)) as { id: string };

    expect(refused.status).toBe(400);
    expect(world.kitchens.held(id)?.name).toBe("c".repeat(120));
  });

  it("requires a name: a copy has none to inherit", async () => {
    seedActionable(duplicate);

    const answer = await duplicate.send(KITCHEN_ID, { json: {} });

    expect(answer.status).toBe(400);
    expect(await rowCount()).toBe(1);
  });

  it("copies a kitchen that was sent, as an unsent one", async () => {
    seedActionable(duplicate, { sentAt: SENT_AT });

    const answer = await duplicate.send(KITCHEN_ID);
    const { id } = (await jsonOf(answer)) as { id: string };

    expect(world.kitchens.held(id)?.sentAt).toBeUndefined();
  });
});

describe("rename touches the name and nothing else", () => {
  const rename = mutationNamed("rename");

  it("answers 200 with the stored name and leaves document, instant, owner and every mark as they were", async () => {
    seedActionable(rename, { name: "Veche", sentAt: SENT_AT });
    const before = world.kitchens.held(KITCHEN_ID);

    const answer = await rename.send(KITCHEN_ID);

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ name: NEW_NAME });
    expect(world.kitchens.held(KITCHEN_ID)).toEqual({
      ...before,
      name: NEW_NAME,
    });
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual([
      "kitchens.rename",
    ]);
  });

  it("renames a sent kitchen: the name is the one thing a sent kitchen may change", async () => {
    seedActionable(rename, { sentAt: SENT_AT });

    const answer = await rename.send(KITCHEN_ID);

    expect(answer.status).toBe(200);
  });
});

describe("delete and hide: a mark, the share link stops with it, and a conflict is answered only to the owner", () => {
  const remove = mutationNamed("delete");
  const hide = mutationNamed("hide");

  it("delete answers 204 with no body, marks the kitchen deleted and revokes its share link once", async () => {
    seedActionable(remove);

    const answer = await remove.send(KITCHEN_ID);

    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const held = world.kitchens.held(KITCHEN_ID);
    expect(held?.deletedAt).toBeInstanceOf(Date);
    expect(held?.hiddenAt).toBeUndefined();
    expect(world.revokedShareLinks.map(({ designId }) => designId)).toEqual([
      KITCHEN_ID,
    ]);
  });

  it("hide answers 204 with no body, marks the kitchen hidden and revokes its share link once", async () => {
    seedActionable(hide);

    const answer = await hide.send(KITCHEN_ID);

    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    const held = world.kitchens.held(KITCHEN_ID);
    expect(held?.hiddenAt).toBeInstanceOf(Date);
    expect(held?.deletedAt).toBeUndefined();
    expect(world.revokedShareLinks.map(({ designId }) => designId)).toEqual([
      KITCHEN_ID,
    ]);
  });

  it("delete answers 409 sent for the owner's sent kitchen, and changes and revokes nothing", async () => {
    seedActionable(remove, { sentAt: SENT_AT });
    const before = world.kitchens.held(KITCHEN_ID);

    const answer = await remove.send(KITCHEN_ID);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "sent" });
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(world.kitchens.held(KITCHEN_ID)).toEqual(before);
    expect(world.revokedShareLinks).toEqual([]);
  });

  it("hide answers 409 not-sent for the owner's unsent kitchen, and changes and revokes nothing", async () => {
    seedKitchen({
      accountId: client.id,
      id: KITCHEN_ID,
      updatedAt: UPDATED_AT,
    });
    const before = world.kitchens.held(KITCHEN_ID);

    const answer = await hide.send(KITCHEN_ID);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "not-sent" });
    expect(world.kitchens.held(KITCHEN_ID)).toEqual(before);
    expect(world.revokedShareLinks).toEqual([]);
  });

  it("answers a second delete the kitchen refusal: a deleted kitchen is no longer the owner's to act on", async () => {
    seedActionable(remove);
    await remove.send(KITCHEN_ID);

    const second = await remove.send(KITCHEN_ID);

    expect(second.status).toBe(404);
    expect(world.revokedShareLinks).toHaveLength(1);
  });

  it("answers a second hide the kitchen refusal, and a delete of a hidden kitchen too", async () => {
    seedActionable(hide);
    await hide.send(KITCHEN_ID);

    const secondHide = await hide.send(KITCHEN_ID);
    const deleteHidden = await remove.send(KITCHEN_ID);

    expect(secondHide.status).toBe(404);
    expect(deleteHidden.status).toBe(404);
    expect(world.revokedShareLinks).toHaveLength(1);
  });

  it("closes every other route to a marked kitchen: rename, duplicate, delete and hide all answer the refusal", async () => {
    seedActionable(remove);
    await remove.send(KITCHEN_ID);

    for (const mutation of MUTATIONS) {
      const answer = await mutation.send(KITCHEN_ID);

      expect(answer.status, mutation.label).toBe(404);
    }
  });

  it("writes a 409 down as a refusal, by event and outcome alone", async () => {
    const console_ = captureConsole();
    seedActionable(remove, { sentAt: SENT_AT });
    seedKitchen({
      accountId: client.id,
      id: "bbbbbbbbbbbbbbbbbbbbb",
      updatedAt: UPDATED_AT,
    });

    await remove.send(KITCHEN_ID);
    await hide.send("bbbbbbbbbbbbbbbbbbbbb");

    expect(console_.accountLines()).toEqual([
      { event: "kitchen-delete", outcome: "refused" },
      { event: "kitchen-hide", outcome: "refused" },
    ]);
  });

  it("counts the account's saves bucket before a 409 is decided", async () => {
    seedActionable(remove, { sentAt: SENT_AT });

    await remove.send(KITCHEN_ID);

    expect(limiterLedger.counted).toEqual([SAVE_BY_ACCOUNT_POLICY_NAME]);
  });
});

describe.each(MUTATIONS)(
  "$label: one refusal for every kitchen that is not the caller's to act on",
  (mutation) => {
    interface Scenario {
      readonly label: string;
      seed(stranger: SeededAccount): void;
    }
    const UNKNOWN_ID: Scenario = {
      label: "an id no row has",
      seed: () => undefined,
    };
    const SCENARIOS: readonly Scenario[] = [
      UNKNOWN_ID,
      {
        label: "another account's kitchen in the state the route acts on",
        seed: (stranger) =>
          seedKitchen({
            accountId: stranger.id,
            id: KITCHEN_ID,
            updatedAt: UPDATED_AT,
            ...(mutation.actionableState.sent ? { sentAt: SENT_AT } : {}),
          }),
      },
      {
        label:
          "another account's kitchen in the other state, which would be a 409 for its owner",
        seed: (stranger) =>
          seedKitchen({
            accountId: stranger.id,
            id: KITCHEN_ID,
            updatedAt: UPDATED_AT,
            ...(mutation.actionableState.sent ? {} : { sentAt: SENT_AT }),
          }),
      },
      {
        label: "the caller's own hidden kitchen",
        seed: () =>
          seedKitchen({
            accountId: client.id,
            id: KITCHEN_ID,
            updatedAt: UPDATED_AT,
            sentAt: SENT_AT,
            hiddenAt: SENT_AT,
          }),
      },
      {
        label: "the caller's own deleted kitchen",
        seed: () =>
          seedKitchen({
            accountId: client.id,
            id: KITCHEN_ID,
            updatedAt: UPDATED_AT,
            deletedAt: SENT_AT,
          }),
      },
    ];

    async function answerFor(scenario: Scenario) {
      world = freshAccountWorld();
      client = await seedVerifiedAccount({ email: "client@example.test" });
      session = await seedSession(client);
      const stranger = await seedVerifiedAccount({
        email: "stranger@example.test",
      });
      scenario.seed(stranger);
      const before = everyRow();
      const listedBefore = await world.kitchens.countListed(client.id);
      const answer = await mutation.send(KITCHEN_ID);
      return { answer, before, after: everyRow(), listedBefore };
    }

    it("gives each of them the unknown id's status, headers and body, byte for byte", async () => {
      const unknown = await answerFor(UNKNOWN_ID);
      const unknownWire = await wireOf(unknown.answer);
      expect(unknown.answer.status).toBe(404);
      expect(unknown.answer.headers.get("cache-control")).toBe(
        "private, no-store",
      );
      expect(unknown.answer.headers.get("vary")).toBe("Cookie");
      expect(setCookieLinesOf(unknown.answer)).toEqual([]);

      for (const scenario of SCENARIOS.slice(1)) {
        const { answer } = await answerFor(scenario);

        expect(await wireOf(answer), scenario.label).toBe(unknownWire);
      }
    });

    it("changes nothing, revokes no share link and writes no copy, whichever it was", async () => {
      for (const scenario of SCENARIOS) {
        const { before, after, listedBefore } = await answerFor(scenario);

        expect(after, scenario.label).toEqual(before);
        expect(world.revokedShareLinks, scenario.label).toEqual([]);
        expect(
          await world.kitchens.countListed(client.id),
          scenario.label,
        ).toBe(listedBefore);
      }
    });
  },
);

describe("the account is the session's alone", () => {
  it.each(MUTATIONS)(
    "$label: a second account's session cannot reach the first account's kitchen",
    async (mutation) => {
      seedActionable(mutation);
      const stranger = await seedVerifiedAccount({
        email: "stranger@example.test",
      });
      const strangerSession = await seedSession(stranger);
      const before = everyRow();

      const answer = await mutation.send(KITCHEN_ID, {
        cookie: strangerSession.cookie,
      });

      expect(answer.status).toBe(404);
      expect(everyRow()).toEqual(before);
    },
  );
});

describe("the log line of a refusal and a success names the event and the outcome alone", () => {
  it.each(MUTATIONS)(
    "$label: writes event and outcome, and no id, name or address",
    async (mutation) => {
      seedActionable(mutation);
      const console_ = captureConsole();

      await mutation.send(KITCHEN_ID);
      await mutation.send("zzzzzzzzzzzzzzzzzzzzz");

      const lines = console_
        .accountLines()
        .filter(({ event }) => event === mutation.event);
      expect(lines.map(({ outcome }) => outcome)).toEqual([
        "succeeded",
        "refused",
      ]);
      for (const line of lines) {
        expect(Object.keys(line).sort()).toEqual(["event", "outcome"]);
      }
      expect(console_.everything()).not.toContain(KITCHEN_ID);
      expect(console_.everything()).not.toContain(NEW_NAME);
      expect(console_.everything()).not.toContain(client.email);
    },
  );
});
