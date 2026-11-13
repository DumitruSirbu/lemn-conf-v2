import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";

import {
  DRIVER_FAILURE_MARKER,
  cookieOfValue,
  currentAccountWorld,
  freshAccountWorld,
  seedVerifiedAccount,
  type AccountWorld,
  type SeededAccount,
} from "../../../support/account-world";
import { signedInAs } from "../../../support/staff-world";
import {
  NAME_MARKER,
  bodyNamingTheSubmitter,
  callbackBodyNamingTheSubmitter,
  wireOf,
} from "../../../lib/server/contact/submit-contact-harness";

/**
 * The route with the real orchestration, the real session read and the real capability table, over the persistence
 * package's fake session and account stores (M11 wave W2a): a stored request fills a confirmed client's blanks, every
 * other session writes nothing, and the answer is the same with a cookie and without one.
 */
const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
}));

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: fakes.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "1",
    }),
}));
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

const REFERENCE_PATTERN = /LM-[0-9A-Z]+/;
const REFERENCE_PLACEHOLDER = "LM-REFERENCE";
const SUBMITTED = {
  name: NAME_MARKER,
  address: "Fakeville",
  phone: "069 000 111",
  phoneNormalForm: "+37369000111",
};
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

function post(body: string, cookie?: string): Promise<Response> {
  return POST(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...(cookie === undefined ? {} : { cookie }),
      },
    }),
  );
}

async function aConfirmedClientCookie(): Promise<{
  account: SeededAccount;
  cookie: string;
}> {
  const { account, session } = await signedInAs({ role: "client" });
  return { account, cookie: session.cookie };
}

function profileOf(account: SeededAccount) {
  return currentAccountWorld().accounts.heldProfileOf(account.id);
}

function fillsAsked(): number {
  return world.calls.filter((call) => call === "accounts.fillProfileBlanks")
    .length;
}

describe("a request sent with a session cookie", () => {
  it("fills a confirmed client's blanks from the stored request", async () => {
    const { account, cookie } = await aConfirmedClientCookie();

    const answer = await post(
      bodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      cookie,
    );

    expect(answer.status).toBe(200);
    expect(profileOf(account)).toEqual({
      name: SUBMITTED.name,
      address: SUBMITTED.address,
      phone: SUBMITTED.phone,
      phoneNormalForm: SUBMITTED.phoneNormalForm,
    });
  });

  it("fills the client's profile from a callback too", async () => {
    const { account, cookie } = await aConfirmedClientCookie();

    await post(
      callbackBodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      cookie,
    );

    expect(profileOf(account)?.name).toBe(SUBMITTED.name);
  });

  it.each([
    ["an operator", { role: "operator" }],
    ["an administrator", { role: "administrator" }],
    ["an unconfirmed client", { role: "client", isVerified: false }],
  ] as const)("writes nothing for %s", async (_label, caller) => {
    const { account, session } = await signedInAs(caller);

    const answer = await post(bodyNamingTheSubmitter(), session.cookie);

    expect(answer.status).toBe(200);
    expect(fillsAsked()).toBe(0);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("writes nothing for a session that was revoked", async () => {
    const { account, session } = await signedInAs({ role: "client" });
    await world.sessions.revokeAllForAccount(account.id);

    const answer = await post(bodyNamingTheSubmitter(), session.cookie);

    expect(answer.status).toBe(200);
    expect(fillsAsked()).toBe(0);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("writes nothing for a cookie that names no session", async () => {
    const answer = await post(
      bodyNamingTheSubmitter(),
      cookieOfValue("z".repeat(43)),
    );

    expect(answer.status).toBe(200);
    expect(fillsAsked()).toBe(0);
  });

  it("writes nothing when the session read fails, and still answers as sent", async () => {
    const { account, cookie } = await aConfirmedClientCookie();
    world.failOn("sessions.findLive");

    const answer = await post(bodyNamingTheSubmitter(), cookie);

    expect(answer.status).toBe(200);
    expect(fillsAsked()).toBe(0);
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });

  it("fills the session's own account and not another client's", async () => {
    const { account, cookie } = await aConfirmedClientCookie();
    const neighbour = await seedVerifiedAccount({
      email: "neighbour@example.test",
    });

    await post(
      bodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      cookie,
    );

    expect(profileOf(account)?.name).toBe(SUBMITTED.name);
    expect(profileOf(neighbour)).toEqual(NOTHING_HELD);
  });

  it("only reads the session: it is never touched", async () => {
    const { cookie } = await aConfirmedClientCookie();

    await post(bodyNamingTheSubmitter(), cookie);

    expect(world.calls).toContain("sessions.findLive");
    expect(world.calls).not.toContain("sessions.touch");
  });
});

describe("the answer does not depend on the session", () => {
  const SENT_WIRE = JSON.stringify([
    200,
    [
      ["cache-control", "no-store"],
      ["content-type", "application/json"],
    ],
    JSON.stringify({ status: "sent", reference: REFERENCE_PLACEHOLDER }),
  ]);

  async function wireWithCookie(cookie: string | undefined): Promise<string> {
    const answer = await post(bodyNamingTheSubmitter(), cookie);
    expect(answer.headers.get("set-cookie")).toBeNull();
    return (await wireOf(answer)).replace(
      REFERENCE_PATTERN,
      REFERENCE_PLACEHOLDER,
    );
  }

  it("is the sent answer, with no cookie set, for a confirmed client", async () => {
    const { cookie } = await aConfirmedClientCookie();

    expect(await wireWithCookie(cookie)).toBe(SENT_WIRE);
  });

  it("is the same answer for an operator", async () => {
    const { session } = await signedInAs({ role: "operator" });

    expect(await wireWithCookie(session.cookie)).toBe(SENT_WIRE);
  });

  it("is the same answer for a visitor with no cookie", async () => {
    expect(await wireWithCookie(undefined)).toBe(SENT_WIRE);
  });

  it("is the same answer for a client whose fill throws", async () => {
    const { cookie } = await aConfirmedClientCookie();
    world.failOn("accounts.fillProfileBlanks");

    expect(await wireWithCookie(cookie)).toBe(SENT_WIRE);
  });

  it("is not a 5xx when the fill throws, and the thrown message reaches no line", async () => {
    const { account, cookie } = await aConfirmedClientCookie();
    world.failOn("accounts.fillProfileBlanks");

    const answer = await post(
      bodyNamingTheSubmitter({ profileAccountEmail: account.email }),
      cookie,
    );

    expect(answer.status).toBe(200);
    expect(consoleLines).toContain("contact-profile-fill-failed");
    expect(consoleLines).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("no refusal of the route fills the profile", () => {
  it.each([
    [
      "a cross-site request",
      { "sec-fetch-site": "cross-site" },
      bodyNamingTheSubmitter(),
    ],
    [
      "another content type",
      { "content-type": "text/plain" },
      bodyNamingTheSubmitter(),
    ],
    ["a body past its bound", {}, "a".repeat(9 * 1024)],
    ["a body that does not parse", {}, "{{{ not json"],
  ] as const)("%s", async (_label, headers, body) => {
    const { account, cookie } = await aConfirmedClientCookie();

    const answer = await POST(
      new NextRequest("https://lemnaria.test/api/contact-submissions", {
        method: "POST",
        body,
        headers: {
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie,
          ...headers,
        },
      }),
    );

    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(fillsAsked()).toBe(0);
    expect(world.calls).not.toContain("sessions.findLive");
    expect(profileOf(account)).toEqual(NOTHING_HELD);
  });
});
