import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";

import {
  currentAccountWorld,
  freshAccountWorld,
  type AccountWorld,
  type SeededAccount,
} from "../../../support/account-world";
import { signedInAs } from "../../../support/staff-world";
import {
  bodyNamingTheSubmitter,
  callbackBodyNamingTheSubmitter,
  wireOf,
} from "../../../lib/server/contact/submit-contact-harness";

/** The route's refusals with and without a client's cookie, an expired session, the calls a request makes (ADR 0179 d2). */
const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
  senderCreation: "sender" as "sender" | "unavailable",
  load: "found" as "found" | "refused",
  accountStoreAsked: 0,
  accountStoreThrows: false,
}));

const ACCOUNT_STORE_FAILURE_MARKER = "QA-W2A-NO-CONNECTION-MARKER-2210";

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () =>
    fakes.senderCreation === "sender"
      ? { kind: "sender", sender: fakes.sender }
      : { kind: "unavailable", variables: [] },
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve(
      fakes.load === "found"
        ? { kind: "found", design: KITCHEN_L_DESIGN, revision: "1" }
        : { kind: "refused", reason: "unavailable" },
    ),
}));
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) => {
    const real = world.accountStoreModule();
    return {
      ...real,
      getAccountStore: () => {
        fakes.accountStoreAsked += 1;
        if (fakes.accountStoreThrows) {
          throw new Error("QA-W2A-NO-CONNECTION-MARKER-2210");
        }
        return real.getAccountStore();
      },
    };
  }),
);

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

const ROUTE_ADDRESS = "https://lemnaria.test/api/contact-submissions";
const REFERENCE_PATTERN = /LM-[0-9A-Z]+/;
const REFERENCE_PLACEHOLDER = "LM-REFERENCE";
const MILLISECONDS_PER_DAY = 86_400_000;
const THIRTY_ONE_DAYS_MS = 31 * MILLISECONDS_PER_DAY;
const NOTHING_HELD = {
  name: null,
  address: null,
  phone: null,
  phoneNormalForm: null,
};

let world: AccountWorld;
let consoleLines: string;

beforeEach(() => {
  world = freshAccountWorld();
  fakes.store = new FakeContactSubmissionStore();
  fakes.sender = createFakeMailSender();
  fakes.senderCreation = "sender";
  fakes.load = "found";
  fakes.accountStoreAsked = 0;
  fakes.accountStoreThrows = false;
  consoleLines = "";
  const record = (...lines: unknown[]) => {
    consoleLines += JSON.stringify(lines);
  };
  vi.spyOn(console, "warn").mockImplementation(record);
  vi.spyOn(console, "error").mockImplementation(record);
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Sent {
  readonly body: BodyInit;
  readonly headers?: Record<string, string>;
}

function post(sent: Sent, cookie?: string): Promise<Response> {
  return POST(
    new NextRequest(ROUTE_ADDRESS, {
      method: "POST",
      body: sent.body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...sent.headers,
        ...(cookie === undefined ? {} : { cookie }),
      },
    }),
  );
}

async function normalisedWire(answer: Response): Promise<string> {
  return (await wireOf(answer)).replace(
    REFERENCE_PATTERN,
    REFERENCE_PLACEHOLDER,
  );
}

function profileOf(account: SeededAccount) {
  return currentAccountWorld().accounts.heldProfileOf(account.id);
}

function callsOf(prefix: string): string[] {
  return world.calls.filter((call) => call.startsWith(prefix));
}

describe("a session that is no longer live fills nothing and the answer is the visitor's", () => {
  it("an absolutely expired session (31 days on) reads as a visitor", async () => {
    const { account, session } = await signedInAs({ role: "client" });
    world.advance(THIRTY_ONE_DAYS_MS);

    const answer = await post(
      { body: bodyNamingTheSubmitter() },
      session.cookie,
    );

    expect(answer.status).toBe(200);
    expect(callsOf("accounts.fillProfileBlanks")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("a session older than the account's last password change reads as a visitor", async () => {
    const { account, session } = await signedInAs({ role: "client" });
    await world.accounts.changePassword({
      accountId: account.id,
      expectedPasswordHash: world.accounts.passwordHashOf(account.id) ?? "",
      passwordHash: `$argon2id$v=19$m=19456,t=2,p=1$${"C".repeat(22)}$${"D".repeat(43)}`,
    });

    const answer = await post(
      { body: bodyNamingTheSubmitter() },
      session.cookie,
    );

    expect(answer.status).toBe(200);
    expect(callsOf("accounts.fillProfileBlanks")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });
});

describe("what a request does with the session and the accounts, exactly (W2a-9, W2a-10)", () => {
  it("a confirmed client's stored request reads the session once and writes only the fill: no touch, no other account call", async () => {
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    const answer = await post(
      {
        body: bodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      },
      session.cookie,
    );

    expect(answer.status).toBe(200);
    expect(callsOf("sessions.")).toEqual(["sessions.findLive"]);
    expect(callsOf("accounts.")).toEqual(["accounts.fillProfileBlanks"]);
    expect(answer.headers.get("set-cookie")).toBeNull();
    expect(profileOf(account)?.name).not.toBeNull();
  });

  it("a callback by a confirmed client does the same and nothing more", async () => {
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    await post(
      {
        body: callbackBodyNamingTheSubmitter({
          profileAccountEmail: account.email,
        }),
      },
      session.cookie,
    );

    expect(callsOf("sessions.")).toEqual(["sessions.findLive"]);
    expect(callsOf("accounts.")).toEqual(["accounts.fillProfileBlanks"]);
  });
});

describe("the account store is reached only by a stored request of a confirmed client (production ports are lazy)", () => {
  it.each([
    ["a visitor", undefined],
    ["an operator", { role: "operator" }],
    ["an unconfirmed client", { role: "client", isVerified: false }],
  ] as const)("%s never asks for the account store", async (_label, caller) => {
    const cookie =
      caller === undefined
        ? undefined
        : (await signedInAs(caller)).session.cookie;

    const answer = await post({ body: bodyNamingTheSubmitter() }, cookie);

    expect(answer.status).toBe(200);
    expect(fakes.accountStoreAsked).toBe(0);
  });

  it("a confirmed client whose account store cannot be made is still answered as sent, with a closed-list line and nothing the failure said", async () => {
    fakes.accountStoreThrows = true;
    const { account, session } = await signedInAs({ role: "client" });

    const answer = await post(
      {
        body: bodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      },
      session.cookie,
    );

    expect(answer.status).toBe(200);
    expect(((await answer.json()) as { status: string }).status).toBe("sent");
    expect(fakes.accountStoreAsked).toBe(1);
    expect(consoleLines).toContain("contact-profile-fill-failed");
    expect(consoleLines).not.toContain(ACCOUNT_STORE_FAILURE_MARKER);
  });
});

describe("every refusal answers a confirmed client's cookie as it answers no cookie, and writes nothing", () => {
  const BIG = "a".repeat(9 * 1024);
  const REFUSALS: readonly [string, Sent, number][] = [
    [
      "a cross-site request",
      {
        body: bodyNamingTheSubmitter(),
        headers: { "sec-fetch-site": "cross-site" },
      },
      403,
    ],
    [
      "another content type",
      {
        body: bodyNamingTheSubmitter(),
        headers: { "content-type": "text/plain" },
      },
      415,
    ],
    ["a body past its bound", { body: BIG }, 413],
    ["a body that does not parse", { body: "{{{ not json" }, 400],
    [
      "the honeypot",
      { body: bodyNamingTheSubmitter({ honeypot: "http://spam.example" }) },
      400,
    ],
    ["the time", { body: bodyNamingTheSubmitter({ elapsedMs: 10 }) }, 400],
    [
      "a schema refusal",
      { body: bodyNamingTheSubmitter({ locale: "xx" }) },
      400,
    ],
  ];

  it.each(REFUSALS)("%s", async (_label, sent, status) => {
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    const withCookie = await post(sent, session.cookie);
    const withoutCookie = await post(sent);

    expect(withCookie.status).toBe(status);
    expect(withCookie.headers.get("set-cookie")).toBeNull();
    expect(await normalisedWire(withCookie)).toBe(
      await normalisedWire(withoutCookie),
    );
    expect(callsOf("sessions.")).toEqual([]);
    expect(callsOf("accounts.")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("a design the owned load refuses (409)", async () => {
    fakes.load = "refused";
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    const withCookie = await post(
      { body: bodyNamingTheSubmitter() },
      session.cookie,
    );
    const withoutCookie = await post({ body: bodyNamingTheSubmitter() });

    expect(withCookie.status).toBe(409);
    expect(await normalisedWire(withCookie)).toBe(
      await normalisedWire(withoutCookie),
    );
    expect(callsOf("accounts.")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("an unusable mail sender (503 before a reference)", async () => {
    fakes.senderCreation = "unavailable";
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    const withCookie = await post(
      { body: bodyNamingTheSubmitter() },
      session.cookie,
    );
    const withoutCookie = await post({ body: bodyNamingTheSubmitter() });

    expect(withCookie.status).toBe(503);
    expect(await normalisedWire(withCookie)).toBe(
      await normalisedWire(withoutCookie),
    );
    expect(callsOf("sessions.")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("the every-request bucket refusing (429)", async () => {
    vi.spyOn(getRateLimitStore(), "recordHits").mockResolvedValue([1_000_000]);
    const { account, session } = await signedInAs({ role: "client" });
    world.calls.length = 0;

    const withCookie = await post(
      { body: bodyNamingTheSubmitter() },
      session.cookie,
    );
    const withoutCookie = await post({ body: bodyNamingTheSubmitter() });

    expect(withCookie.status).toBe(429);
    expect(await normalisedWire(withCookie)).toBe(
      await normalisedWire(withoutCookie),
    );
    expect(callsOf("sessions.")).toEqual([]);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });
});
