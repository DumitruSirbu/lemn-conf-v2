import { KITCHEN_L_DESIGN, type Role } from "@lemnaria/configurator-domain";
import type { ProfileBlanksFill } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInSession } from "@/lib/server/account/current-session";
import { capabilitiesHeldBy } from "@/lib/server/account/require-capability";
import { PROFILE_FILL_DEADLINE_MS } from "@/lib/server/contact/fill-profile-from-request";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
  type ConsoleSpy,
} from "../mail/mail-test-support";
import {
  NAME_MARKER,
  aHarness,
  bodyOf,
  callbackBodyOf,
  wireOf,
  type Harness,
  type HarnessOptions,
} from "./submit-contact-harness";

/** The profile fill after a request is stored: gated, best-effort, bounded, answer unchanged (ADR 0179 d2). */

const SENTINEL = "PROFILE-DRIVER-FAILURE-MARKER";
const NOT_NOTIFIED = { ok: false, kind: "busy" } as const;
const FILL_EVENT = "contact-profile-fill-failed";
const SUBMITTED_PHONE = "069 000 111";
const SUBMITTED_PHONE_NORMAL_FORM = "+37369000111";
const SUBMITTED_LOCALITY = "Fakeville";
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
/** A reference is drawn at random per request, so the wire is compared with it blanked. */
const REFERENCE_PLACEHOLDER = "LM-REFERENCE";
const SENT_WIRE = JSON.stringify([
  200,
  [
    ["cache-control", "no-store"],
    ["content-type", "application/json"],
  ],
  JSON.stringify({ status: "sent", reference: REFERENCE_PLACEHOLDER }),
]);
const DESIGN_OWNER_ACCOUNT_ID = "o".repeat(21);

let consoleSpies: readonly ConsoleSpy[];

beforeEach(() => {
  consoleSpies = spyOnEveryConsoleMethod();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type FillBehaviour = (
  real: Harness["accounts"],
  blanks: ProfileBlanksFill,
) => Promise<unknown>;

interface Fills {
  readonly asked: ProfileBlanksFill[];
}

const PASS_THROUGH: FillBehaviour = (real, blanks) =>
  real.fillProfileBlanks(blanks);

interface Scenario {
  readonly harness: Harness;
  readonly fills: Fills;
  readonly accountId: string;
}

interface ScenarioOptions {
  readonly role?: Role;
  readonly isEmailVerified?: boolean;
  readonly fill?: FillBehaviour;
  readonly isSignedIn?: boolean;
  readonly profile?: { name?: string; address?: string };
  readonly harness?: Omit<HarnessOptions, "profiles" | "readSession">;
  readonly readSession?: HarnessOptions["readSession"];
}

async function aScenario(options: ScenarioOptions = {}): Promise<Scenario> {
  const fills: Fills = { asked: [] };
  const behaviour = options.fill ?? PASS_THROUGH;
  const sessionHolder: { session?: SignedInSession } = {};
  const readSession = options.readSession ?? readSessionOf(sessionHolder);
  const harness: Harness = aHarness({
    ...options.harness,
    profiles: (accounts, calls) => ({
      fillProfileBlanks: (blanks) => {
        calls.push("fill-profile");
        fills.asked.push(blanks);
        return behaviour(accounts, blanks) as ReturnType<
          Harness["accounts"]["fillProfileBlanks"]
        >;
      },
    }),
    readSession: () => {
      harness.calls.push("read-session");
      return readSession();
    },
  });
  const accountId = await seedAccount(harness, options.profile);
  if (options.isSignedIn !== false) {
    sessionHolder.session = sessionOf(accountId, options);
  }
  return { harness, fills, accountId };
}

function readSessionOf(holder: { session?: SignedInSession }) {
  return () =>
    Promise.resolve(holder.session ?? ({ kind: "anonymous" } as const));
}

async function seedAccount(
  harness: Harness,
  profile: ScenarioOptions["profile"],
): Promise<string> {
  const created = await harness.accounts.createUnverified({
    email: "submitter@example.invalid",
    emailNormalForm: "submitter@example.invalid",
    phone: undefined,
    locale: "ro",
    privacyNoticeVersion: "2026-10-draft",
    passwordHash: PASSWORD_HASH,
  });
  if (created.kind !== "created") throw new Error("the address was taken");
  await harness.accounts.updateProfile({
    accountId: created.accountId,
    changes: profile ?? {},
  });
  return created.accountId;
}

function sessionOf(
  accountId: string,
  { role = "client", isEmailVerified = true }: ScenarioOptions,
): SignedInSession {
  return {
    kind: "signed-in",
    accountId,
    role,
    capabilities: capabilitiesHeldBy({ role, isEmailVerified }),
    isEmailVerified,
    email: "submitter@example.invalid",
  };
}

function profileOf(scenario: Scenario) {
  return scenario.harness.accounts.heldProfileOf(scenario.accountId);
}

const NOTHING_HELD = {
  name: null,
  address: null,
  phone: null,
  phoneNormalForm: null,
};

function linesOfEvent(event: string): unknown[] {
  return consoleCallsOf(consoleSpies)
    .flat()
    .filter(
      (argument) =>
        typeof argument === "object" &&
        argument !== null &&
        (argument as { event?: unknown }).event === event,
    );
}

describe("a confirmed client's request, stored", () => {
  it("fills the blank name, address and phone pair from the request, in the entered and normal forms", async () => {
    const scenario = await aScenario();

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(profileOf(scenario)).toEqual({
      name: NAME_MARKER,
      address: SUBMITTED_LOCALITY,
      phone: SUBMITTED_PHONE,
      phoneNormalForm: SUBMITTED_PHONE_NORMAL_FORM,
    });
  });

  it("keeps a name the profile already holds and fills the other blanks", async () => {
    const scenario = await aScenario({ profile: { name: "Held Name" } });

    await scenario.harness.submit(bodyOf());

    expect(profileOf(scenario)).toEqual({
      name: "Held Name",
      address: SUBMITTED_LOCALITY,
      phone: SUBMITTED_PHONE,
      phoneNormalForm: SUBMITTED_PHONE_NORMAL_FORM,
    });
  });

  it("writes no address for a request with an empty locality", async () => {
    const scenario = await aScenario();

    await scenario.harness.submit(
      bodyOf({
        contact: {
          name: NAME_MARKER,
          phone: SUBMITTED_PHONE,
          locality: "",
          channel: "phone",
          consent: true,
          consentTextVersion: "placeholder",
        },
      }),
    );

    expect(profileOf(scenario)?.address).toBeNull();
    expect(profileOf(scenario)?.name).toBe(NAME_MARKER);
  });

  it("fills from a callback request too, which names no design", async () => {
    const scenario = await aScenario();

    const answer = await scenario.harness.submit(callbackBodyOf());

    expect(answer.status).toBe(200);
    expect(profileOf(scenario)?.name).toBe(NAME_MARKER);
  });

  it("fills the session's own account and never the design's owner, whoever owns the design", async () => {
    const scenario = await aScenario();
    scenario.harness.kitchens.seed({
      id: "abcdefghijklmnopqrstu",
      accountId: DESIGN_OWNER_ACCOUNT_ID,
      design: KITCHEN_L_DESIGN,
    });

    await scenario.harness.submit(bodyOf());

    expect(scenario.fills.asked.map(({ accountId }) => accountId)).toEqual([
      scenario.accountId,
    ]);
  });

  it("reads the session and fills after the record and the sent mark, before the notice goes out", async () => {
    const scenario = await aScenario();

    await scenario.harness.submit(bodyOf());

    expect(scenario.harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "load",
      "judge:new",
      "record",
      "read-session",
      "fill-profile",
      "record-view",
      "send",
      "mark",
    ]);
  });
});

describe("a session that does not hold design.edit.own writes nothing", () => {
  it.each([
    ["an operator", { role: "operator" }],
    ["an administrator", { role: "administrator" }],
    ["an unconfirmed client", { role: "client", isEmailVerified: false }],
    ["a visitor with no session", { isSignedIn: false }],
  ] as const)("%s", async (_label, who) => {
    const scenario = await aScenario(who);

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(scenario.fills.asked).toEqual([]);
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);
  });

  it("an expired or unreadable session reads as a visitor's and writes nothing", async () => {
    const scenario = await aScenario({
      readSession: () => Promise.resolve({ kind: "anonymous" }),
    });

    await scenario.harness.submit(bodyOf());

    expect(scenario.fills.asked).toEqual([]);
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);
  });
});

describe("no refusal and no conflict fills the profile", () => {
  async function expectNoFillAfter(
    scenario: Scenario,
    body: string,
  ): Promise<void> {
    const answer = await scenario.harness.submit(body);

    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(scenario.fills.asked).toEqual([]);
    expect(scenario.harness.calls).not.toContain("read-session");
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);
  }

  it("the honeypot", async () => {
    await expectNoFillAfter(
      await aScenario(),
      bodyOf({ honeypot: "http://spam.example" }),
    );
  });

  it("the time", async () => {
    await expectNoFillAfter(await aScenario(), bodyOf({ elapsedMs: 10 }));
  });

  it("a body the schema refuses", async () => {
    await expectNoFillAfter(await aScenario(), bodyOf({ locale: "xx" }));
  });

  it("a design the owned load refuses", async () => {
    await expectNoFillAfter(
      await aScenario({
        harness: {
          loadOwned: () =>
            Promise.resolve({ kind: "refused", reason: "unavailable" }),
        },
      }),
      bodyOf(),
    );
  });

  it("a record that answers a conflict", async () => {
    await expectNoFillAfter(
      await aScenario({
        harness: {
          store: (inner) => ({
            lookUp: (request) => inner.lookUp(request),
            record: () => Promise.resolve({ kind: "conflict" }),
            markNotified: (id) => inner.markNotified(id),
          }),
        },
      }),
      bodyOf(),
    );
  });

  it("a record that fails", async () => {
    await expectNoFillAfter(
      await aScenario({
        harness: {
          store: (inner) => ({
            lookUp: (request) => inner.lookUp(request),
            record: () => Promise.reject(new Error("store down")),
            markNotified: (id) => inner.markNotified(id),
          }),
        },
      }),
      bodyOf(),
    );
  });

  it("a stored id sent again with another payload, which fills nothing the second time", async () => {
    const scenario = await aScenario();
    await scenario.harness.submit(bodyOf());
    scenario.fills.asked.length = 0;
    const changed = bodyOf({
      contact: {
        name: "Someone Else",
        phone: "069 999 888",
        locality: "Elsewhere",
        channel: "phone",
        consent: true,
        consentTextVersion: "placeholder",
      },
    });

    const answer = await scenario.harness.submit(changed);

    expect(answer.status).toBe(409);
    expect(scenario.fills.asked).toEqual([]);
    expect(profileOf(scenario)?.name).toBe(NAME_MARKER);
  });
});

describe("a retry of a stored request", () => {
  it("fills again with the same result when its notice was still owed and its design is read again", async () => {
    const scenario = await aScenario({
      harness: { outcomes: [NOT_NOTIFIED] },
    });
    expect((await scenario.harness.submit(bodyOf())).status).toBe(502);
    const afterFirst = profileOf(scenario);

    const retried = await scenario.harness.submit(bodyOf());

    expect(retried.status).toBe(200);
    expect(scenario.fills.asked).toHaveLength(2);
    expect(profileOf(scenario)).toEqual(afterFirst);
  });

  it("repairs a fill that was lost the first time", async () => {
    let attempt = 0;
    const scenario = await aScenario({
      harness: { outcomes: [NOT_NOTIFIED] },
      fill: (real, blanks) =>
        ++attempt === 1
          ? Promise.reject(new Error(SENTINEL))
          : real.fillProfileBlanks(blanks),
    });
    await scenario.harness.submit(bodyOf());
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);

    await scenario.harness.submit(bodyOf());

    expect(profileOf(scenario)?.name).toBe(NAME_MARKER);
  });

  it("does not fill when its design can no longer be read", async () => {
    let reads = 0;
    const scenario = await aScenario({
      harness: {
        outcomes: [NOT_NOTIFIED],
        loadOwned: () =>
          ++reads === 1
            ? Promise.resolve({
                kind: "found",
                design: KITCHEN_L_DESIGN,
                revision: "1",
              })
            : Promise.resolve({ kind: "refused", reason: "unavailable" }),
      },
    });
    await scenario.harness.submit(bodyOf());
    scenario.fills.asked.length = 0;

    const retried = await scenario.harness.submit(bodyOf());

    expect(retried.status).toBeGreaterThanOrEqual(400);
    expect(scenario.fills.asked).toEqual([]);
  });

  it("does not fill when its notice already went out", async () => {
    const scenario = await aScenario();
    await scenario.harness.submit(bodyOf());
    scenario.fills.asked.length = 0;

    const again = await scenario.harness.submit(bodyOf());

    expect(again.status).toBe(200);
    expect(scenario.fills.asked).toEqual([]);
  });
});

describe("the answer is the one the request would have had without the fill", () => {
  it("is byte-identical for a confirmed client, a visitor and a client whose fill throws", async () => {
    const signedIn = await aScenario();
    const visitor = await aScenario({ isSignedIn: false });
    const broken = await aScenario({
      fill: () => Promise.reject(new Error(SENTINEL)),
    });

    const wires = (
      await Promise.all(
        [signedIn, visitor, broken].map(async ({ harness }) =>
          wireOf(await harness.submit(bodyOf())),
        ),
      )
    ).map((wire) => wire.replace(/LM-[0-9A-Z]+/, REFERENCE_PLACEHOLDER));

    expect(wires).toEqual([SENT_WIRE, SENT_WIRE, SENT_WIRE]);
  });

  it("sets no cookie, whoever sends it", async () => {
    const scenario = await aScenario();

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.headers.get("set-cookie")).toBeNull();
  });
});

describe("a fill that fails is a line from a closed list and never an answer", () => {
  it("answers as sent, writes one line with the reference and the cause, and still sends the notice", async () => {
    const scenario = await aScenario({
      fill: () => Promise.reject(new Error(SENTINEL)),
    });

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { reference: string };
    expect(scenario.harness.sender.sent).toHaveLength(1);
    expect(linesOfEvent(FILL_EVENT)).toEqual([
      { event: FILL_EVENT, cause: "unexpected", reference: body.reference },
    ]);
  });

  it("writes nothing the failure said, in any line", async () => {
    const scenario = await aScenario({
      fill: () => Promise.reject(new Error(SENTINEL)),
    });

    await scenario.harness.submit(bodyOf());

    expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
      SENTINEL,
    );
  });

  it("answers as sent when the store throws before it returns a promise", async () => {
    const scenario = await aScenario({
      fill: () => {
        throw new Error(SENTINEL);
      },
    });

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
      SENTINEL,
    );
  });

  it("answers as sent when the session read throws, writing nothing it said", async () => {
    const scenario = await aScenario({
      readSession: () => Promise.reject(new Error(SENTINEL)),
    });

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(linesOfEvent(FILL_EVENT)).toHaveLength(1);
    expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
      SENTINEL,
    );
  });
});

describe(`a fill that hangs is bounded at ${String(PROFILE_FILL_DEADLINE_MS)} ms`, () => {
  const NEVER_ANSWERS: FillBehaviour = () => new Promise(() => undefined);

  async function answerAfterDeadline(
    scenario: Scenario,
  ): Promise<{ answered: () => Response | undefined }> {
    vi.useFakeTimers();
    let answered: Response | undefined;
    void scenario.harness.submit(bodyOf()).then((answer) => {
      answered = answer;
    });
    await vi.advanceTimersByTimeAsync(PROFILE_FILL_DEADLINE_MS - 1);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    return { answered: () => answered };
  }

  it("holds the answer for the deadline and no longer, then answers as sent with a timeout line", async () => {
    const scenario = await aScenario({ fill: NEVER_ANSWERS });

    const { answered } = await answerAfterDeadline(scenario);

    expect(answered()?.status).toBe(200);
    expect(scenario.harness.sender.sent).toHaveLength(1);
    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ event: FILL_EVENT, cause: "timeout" }),
    ]);
  });

  it("bounds a session read that never answers by the same deadline", async () => {
    const scenario = await aScenario({
      readSession: () => new Promise(() => undefined),
    });

    const { answered } = await answerAfterDeadline(scenario);

    expect(answered()?.status).toBe(200);
    expect(scenario.fills.asked).toEqual([]);
    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ cause: "timeout" }),
    ]);
  });

  it("answers at once when the fill is quick: no timer is waited out", async () => {
    vi.useFakeTimers();
    const scenario = await aScenario();

    const answer = await scenario.harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
