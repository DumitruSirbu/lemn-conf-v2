import {
  PROFILE_ADDRESS_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  PROFILE_POLICY_NAME,
  READ_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  wireOf,
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

const { GET, PATCH } = await import("@/app/api/account/profile/route");

/**
 * `GET` and `PATCH /api/account/profile` (M8B Lot 2, E6; criterion 12). Both are open to every role: the capability is
 * `account.manage.own`, which staff hold too.
 */

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  client = await seedVerifiedAccount({ email: "client@example.test" });
  session = await seedSession(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function read(init: Parameters<typeof accountRequest>[1] = {}) {
  return GET(
    accountRequest("/api/account/profile", {
      cookie: session.cookie,
      headers: { "x-forwarded-for": "192.0.2.10" },
      ...init,
    }),
  );
}

function save(json: unknown, init: Parameters<typeof accountRequest>[1] = {}) {
  return PATCH(
    accountRequest("/api/account/profile", {
      method: "PATCH",
      json,
      cookie: session.cookie,
      ...init,
    }),
  );
}

async function profileNow() {
  return (await jsonOf(await read())) as Record<string, unknown>;
}

describe("GET: the order of the checks", () => {
  it("refuses a cross-site request first, with no limiter, session or store", async () => {
    world.calls.length = 0;

    const answer = await read({ secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("counts the read limit before it reads the session, the same answer for every caller", async () => {
    limiterLedger.refusing.set(READ_POLICY_NAME, 90);
    world.calls.length = 0;

    const signedIn = await read();
    const anonymous = await read({ cookie: "" });

    expect(signedIn.status).toBe(429);
    expectAWaitWithinTheWindowOf(signedIn, READ_POLICY_NAME);
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(world.calls).toEqual([]);
  });

  it("answers a limited read in the account routes' own words, {status: rate-limited}, as E1 does (plan 2.2: the built account-responses words)", async () => {
    limiterLedger.refusing.set(READ_POLICY_NAME, 90);

    const answer = await read();

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
  });

  it("answers 401 with no live session, and reads no profile", async () => {
    world.calls.length = 0;

    const answer = await read({ cookie: "" });

    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
    expect(world.calls).not.toContain("accounts.findProfile");
  });

  it("answers 503, not 401, when the session store fails, and 503 when the account store fails", async () => {
    const console_ = captureConsole();
    world.failOn("sessions.findLive");
    const sessionDown = await read();
    world = freshAccountWorld();
    client = await seedVerifiedAccount({ email: "client@example.test" });
    session = await seedSession(client);
    world.failOn("accounts.findProfile");
    const accountDown = await read();

    expect(sessionDown.status).toBe(503);
    expect(accountDown.status).toBe(503);
    expect(await jsonOf(accountDown)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 for a live session whose account the table has lost", async () => {
    world.intercept("accounts.findProfile", () =>
      Promise.resolve({ kind: "none" }),
    );

    const answer = await read();

    expect(answer.status).toBe(401);
  });
});

describe("GET: what leaves", () => {
  it("answers exactly name, address and phone, null for each never given, private and no-store", async () => {
    const answer = await read();

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({
      name: null,
      address: null,
      phone: null,
    });
  });

  it("answers staff their own details too", async () => {
    const staff = await seedVerifiedAccount({
      email: "staff@example.test",
      role: "operator",
    });
    const staffSession = await seedSession(staff);

    const answer = await read({ cookie: staffSession.cookie });

    expect(answer.status).toBe(200);
  });

  it("holds no address, hash, id or role", async () => {
    await save({
      name: "Ion Popescu",
      address: "Chisinau",
      phone: "+37369123456",
    });

    const text = JSON.stringify(await profileNow());

    expect(text).not.toContain(client.email);
    expect(text).not.toContain(client.id);
    expect(text).not.toContain("argon2");
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual([
      "address",
      "name",
      "phone",
    ]);
  });

  it("shows only the session's own details", async () => {
    await save({ name: "Ion Popescu" });
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    const otherSession = await seedSession(other);

    const theirs = (await jsonOf(
      await read({
        cookie: otherSession.cookie,
        search: `?accountId=${client.id}`,
      }),
    )) as { name: unknown };

    expect(theirs.name).toBeNull();
  });
});

describe("PATCH: the order of the checks", () => {
  it("refuses a cross-site request before reading anything", async () => {
    world.calls.length = 0;

    const answer = await save({ name: "x" }, { secFetchSite: "cross-site" });

    expect(answer.status).toBe(403);
    expect(world.calls).toEqual([]);
  });

  it("answers 415 and 413 before the session is read", async () => {
    world.calls.length = 0;

    const notJson = await save("{}", { contentType: "text/plain", cookie: "" });
    const tooLarge = await save(JSON.stringify({ name: "x".repeat(9000) }), {
      cookie: "",
    });

    expect(notJson.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(world.calls).toEqual([]);
  });

  it("answers 401 with no live session and 503 when the session store fails", async () => {
    const anonymous = await save({ name: "x" }, { cookie: "" });
    world.failOn("sessions.findLive");
    const down = await save({ name: "x" });

    expect(anonymous.status).toBe(401);
    expect(down.status).toBe(503);
  });

  it.each([
    ["an empty body", ""],
    ["text", "not json"],
    ["an array", "[]"],
    ["null", "null"],
  ])(
    "answers 400 invalid-request to %s, counting nothing",
    async (_label, body) => {
      const answer = await save(body);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(limiterLedger.counted).toEqual([]);
    },
  );

  it("judges the fields before it counts the limiter, and counts nothing for a refused field", async () => {
    const answer = await save({ name: 5 });

    expect(answer.status).toBe(400);
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).not.toContain("accounts.updateProfile");
  });

  it("counts the account's profile bucket once before the write, and answers 429 with Retry-After when it refuses, writing nothing", async () => {
    await save({ name: "Primul" });
    limiterLedger.counted.length = 0;
    limiterLedger.refusing.set(PROFILE_POLICY_NAME, 77);
    world.calls.length = 0;

    const answer = await save({ name: "Al doilea" });

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, PROFILE_POLICY_NAME);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expect(limiterLedger.counted).toEqual([PROFILE_POLICY_NAME]);
    expect(world.calls).not.toContain("accounts.updateProfile");
    limiterLedger.refusing.clear();
    expect((await profileNow()).name).toBe("Primul");
  });

  it("fails closed, 503 and no write, when the limiter cannot judge", async () => {
    limiterLedger.unavailable.add(PROFILE_POLICY_NAME);

    const answer = await save({ name: "Nou" });

    expect(answer.status).toBe(503);
    limiterLedger.unavailable.clear();
    expect((await profileNow()).name).toBeNull();
  });

  it("answers 503 and leaks no cause when the write fails", async () => {
    const console_ = captureConsole();
    world.failOn("accounts.updateProfile");

    const answer = await save({ name: "Nou" });

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 for a live session whose account the table has lost", async () => {
    world.intercept("accounts.updateProfile", () =>
      Promise.resolve({ kind: "none" }),
    );

    const answer = await save({ name: "Nou" });

    expect(answer.status).toBe(401);
  });
});

describe("PATCH: the fields", () => {
  it("saves what is named and answers {status: saved}, private and no-store", async () => {
    const answer = await save({
      name: "Ion Popescu",
      address: "Main Street 1, Chisinau",
      phone: "+37369123456",
    });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await jsonOf(answer)).toEqual({ status: "saved" });
    expect(limiterLedger.counted).toEqual([PROFILE_POLICY_NAME]);
    expect(await profileNow()).toEqual({
      name: "Ion Popescu",
      address: "Main Street 1, Chisinau",
      phone: "+37369123456",
    });
  });

  it("leaves a column alone when its member is absent", async () => {
    await save({ name: "Ion", address: "Adresa", phone: "+37369123456" });

    await save({ name: "Ion II" });

    expect(await profileNow()).toEqual({
      name: "Ion II",
      address: "Adresa",
      phone: "+37369123456",
    });
  });

  it("clears a column when its member is empty, and the phone's two columns together", async () => {
    await save({ name: "Ion", address: "Adresa", phone: "+37369123456" });
    const changes: unknown[] = [];
    world.intercept("accounts.updateProfile", (real, args) => {
      changes.push((args[0] as { changes: unknown }).changes);
      return real();
    });

    await save({ phone: "", address: "   " });

    expect(await profileNow()).toEqual({
      name: "Ion",
      address: null,
      phone: null,
    });
    expect(changes).toEqual([
      { address: "", phone: { phone: null, phoneNormalForm: null } },
    ]);
  });

  it("changes nothing for an empty object, and still answers saved", async () => {
    await save({ name: "Ion" });

    const answer = await save({});

    expect(answer.status).toBe(200);
    expect(await profileNow()).toMatchObject({ name: "Ion" });
  });

  it("hands the store the domain's changes alone: the email, a role and an id in the body never reach it", async () => {
    const handed: { accountId: string; changes: Record<string, unknown> }[] =
      [];
    world.intercept("accounts.updateProfile", (real, args) => {
      handed.push(args[0] as never);
      return real();
    });
    const other = await seedVerifiedAccount({ email: "other@example.test" });

    const answer = await save({
      name: "Ion",
      email: "stolen@example.test",
      emailNormalForm: "stolen@example.test",
      role: "administrator",
      accountId: other.id,
      passwordHash: "x",
    });

    expect(answer.status).toBe(200);
    expect(handed).toHaveLength(1);
    expect(handed[0]?.accountId).toBe(client.id);
    expect(Object.keys(handed[0]?.changes ?? {})).toEqual(["name"]);
    const account = await world.accounts.findById(client.id);
    expect(account).toMatchObject({
      kind: "found",
      account: { email: client.email, role: "client" },
    });
    expect(await world.accounts.findById(other.id)).toMatchObject({
      kind: "found",
      account: { email: other.email },
    });
  });

  it("ignores an inherited member as it ignores an absent one", async () => {
    await save({ name: "Ion" });

    await save(
      JSON.parse('{"__proto__":{"name":"Hijack","address":"Hijack"}}'),
    );

    expect(await profileNow()).toMatchObject({ name: "Ion", address: null });
  });

  it("stores the trimmed, NFC form", async () => {
    await save({ name: "  Ana\u200b Mariá  " });

    expect((await profileNow()).name).toBe("Ana Mariá");
  });

  it("accepts a name and an address at their bounds in code points, and refuses one more", async () => {
    const astral = "\u{1F600}";
    const atBounds = await save({
      name: astral.repeat(PROFILE_NAME_MAX_LENGTH),
      address: astral.repeat(PROFILE_ADDRESS_MAX_LENGTH),
    });
    const over = await save({
      name: astral.repeat(PROFILE_NAME_MAX_LENGTH + 1),
      address: astral.repeat(PROFILE_ADDRESS_MAX_LENGTH + 1),
    });

    expect(atBounds.status).toBe(200);
    expect(over.status).toBe(400);
    expect(await jsonOf(over)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "name", code: "TOO_LONG" },
        { field: "address", code: "TOO_LONG" },
      ],
    });
  });

  it.each([
    ["a number", { name: 5 }, [{ field: "name", code: "NOT_TEXT" }]],
    ["null", { address: null }, [{ field: "address", code: "NOT_TEXT" }]],
    [
      "a control character",
      { name: "a\u0007" },
      [{ field: "name", code: "FORBIDDEN_CHARACTER" }],
    ],
    [
      "a phone that is not text",
      { phone: 123456789 },
      [{ field: "phone", code: "NOT_TEXT" }],
    ],
  ])(
    "answers 400 invalid-input, in field order and without the value, to %s",
    async (_label, body, issues) => {
      const answer = await save(body);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-input", issues });
    },
  );

  it("answers a phone no number can be made of with a phone issue, and echoes nothing", async () => {
    const answer = await save({ phone: "not-a-phone-MARKER" });

    expect(answer.status).toBe(400);
    const body = (await jsonOf(answer)) as {
      issues: { field: string; code: string }[];
    };
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]?.field).toBe("phone");
    expect(JSON.stringify(body)).not.toContain("MARKER");
  });

  it("refuses all of a request when any member is refused: nothing of it is saved", async () => {
    await save({ name: "Ion" });

    const answer = await save({ name: "Ion II", address: 5 });

    expect(answer.status).toBe(400);
    expect(await profileNow()).toMatchObject({ name: "Ion" });
  });

  it("lets staff keep their own details", async () => {
    const staff = await seedVerifiedAccount({
      email: "staff@example.test",
      role: "operator",
    });
    const staffSession = await seedSession(staff);

    const answer = await save(
      { name: "Staff" },
      { cookie: staffSession.cookie },
    );

    expect(answer.status).toBe(200);
  });
});
