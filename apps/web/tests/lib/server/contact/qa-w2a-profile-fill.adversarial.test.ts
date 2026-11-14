import type { Role } from "@lemnaria/configurator-domain";
import {
  AccountStoreError,
  type ProfileBlanksFill,
  type SentMarkStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInSession } from "@/lib/server/account/current-session";
import { capabilitiesHeldBy } from "@/lib/server/account/require-capability";
import { PROFILE_FILL_DEADLINE_MS } from "@/lib/server/contact/fill-profile-from-request";
import {
  CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
  CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
  type ConsoleSpy,
} from "../mail/mail-test-support";
import {
  NAME_MARKER,
  aHarness,
  bodyNamingTheSubmitter,
  callbackBodyNamingTheSubmitter,
  wireOf,
  type Harness,
  type HarnessOptions,
} from "./submit-contact-harness";

/** Each refusal as a client and as a visitor, both hanging steps, unreadable thrown values, retry (ADR 0179 d2). */

const SENTINEL = "QA-W2A-THROWN-VALUE-MARKER-9137";
const FILL_EVENT = "contact-profile-fill-failed";
const MARK_EVENT = "contact-sent-mark-failed";
const NOT_NOTIFIED = { ok: false, kind: "busy" } as const;
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const NOTHING_HELD = {
  name: null,
  address: null,
  phone: null,
  phoneNormalForm: null,
};
const REFERENCE_PATTERN = /LM-[0-9A-Z]+/;
const REFERENCE_PLACEHOLDER = "LM-REFERENCE";

let consoleSpies: readonly ConsoleSpy[];

beforeEach(() => {
  consoleSpies = spyOnEveryConsoleMethod();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Who {
  session: SignedInSession | { kind: "anonymous" };
}

interface Scenario {
  readonly harness: Harness;
  readonly fills: ProfileBlanksFill[];
  readonly sessionReads: { count: number };
  readonly who: Who;
  readonly accountId: string;
  asAClient(): void;
  asAVisitor(): void;
}

function clientSessionOf(
  accountId: string,
  role: Role = "client",
  isEmailVerified = true,
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

async function aScenario(
  options: Omit<HarnessOptions, "profiles" | "readSession"> = {},
): Promise<Scenario> {
  const fills: ProfileBlanksFill[] = [];
  const sessionReads = { count: 0 };
  const who: Who = { session: { kind: "anonymous" } };
  const harness = aHarness({
    ...options,
    profiles: (accounts, calls) => ({
      fillProfileBlanks: (blanks) => {
        calls.push("fill-profile");
        fills.push(blanks);
        return accounts.fillProfileBlanks(blanks);
      },
    }),
    readSession: () => {
      sessionReads.count += 1;
      harness.calls.push("read-session");
      return Promise.resolve(who.session);
    },
  });
  const created = await harness.accounts.createUnverified({
    email: "submitter@example.invalid",
    emailNormalForm: "submitter@example.invalid",
    phone: undefined,
    locale: "ro",
    privacyNoticeVersion: "2026-10-draft",
    passwordHash: PASSWORD_HASH,
  });
  if (created.kind !== "created") throw new Error("the address was taken");
  return {
    harness,
    fills,
    sessionReads,
    who,
    accountId: created.accountId,
    asAClient: () => {
      who.session = clientSessionOf(created.accountId);
    },
    asAVisitor: () => {
      who.session = { kind: "anonymous" };
    },
  };
}

function profileOf(scenario: Scenario) {
  return scenario.harness.accounts.heldProfileOf(scenario.accountId);
}

function linesOfEvent(event: string): Record<string, unknown>[] {
  return consoleCallsOf(consoleSpies)
    .flat()
    .filter(
      (argument): argument is Record<string, unknown> =>
        typeof argument === "object" &&
        argument !== null &&
        (argument as { event?: unknown }).event === event,
    );
}

async function normalisedWire(answer: Response): Promise<string> {
  return (await wireOf(answer)).replace(
    REFERENCE_PATTERN,
    REFERENCE_PLACEHOLDER,
  );
}

/** `readsBefore` is the session reads that happened before the request under test: those of a visitor's earlier ones. */
function expectNothingFilled(scenario: Scenario, readsBefore = 0): void {
  expect(scenario.fills).toEqual([]);
  expect(scenario.sessionReads.count).toBe(readsBefore);
  expect(profileOf(scenario)).toEqual(NOTHING_HELD);
}

describe("a refusal answers a confirmed client exactly as it answers a visitor, and fills nothing (W2a-7, W2a-8)", () => {
  const REFUSALS: readonly [
    string,
    Omit<HarnessOptions, "profiles" | "readSession">,
    string,
    number,
  ][] = [
    [
      "the honeypot",
      {},
      bodyNamingTheSubmitter({ honeypot: "http://spam.example" }),
      400,
    ],
    ["the time", {}, bodyNamingTheSubmitter({ elapsedMs: 10 }), 400],
    ["a schema refusal", {}, bodyNamingTheSubmitter({ locale: "xx" }), 400],
    [
      "a design the owned load refuses (CONTACT_DESIGN_NOT_CURRENT)",
      {
        loadOwned: () =>
          Promise.resolve({ kind: "refused", reason: "unavailable" }),
      },
      bodyNamingTheSubmitter(),
      409,
    ],
    [
      "an unusable sender (503 before a reference)",
      { createSender: () => ({ kind: "unavailable", variables: [] }) },
      bodyNamingTheSubmitter(),
      503,
    ],
    [
      "an unusable digest secret (503 before a reference)",
      { digester: { status: "unavailable", variable: "DIGEST_SECRET" } },
      bodyNamingTheSubmitter(),
      503,
    ],
    [
      "a notice that cannot be made (503 before a reference)",
      { noticeContent: { leadNotice: null } as never },
      bodyNamingTheSubmitter(),
      503,
    ],
  ];

  it.each(REFUSALS)(
    "%s",
    async (_label, harnessOptions, body, expectedStatus) => {
      const asVisitor = await aScenario(harnessOptions);
      const asClient = await aScenario(harnessOptions);
      asClient.asAClient();

      const visitorWire = await normalisedWire(
        await asVisitor.harness.submit(body),
      );
      const clientAnswer = await asClient.harness.submit(body);

      expect(clientAnswer.status).toBe(expectedStatus);
      expect(clientAnswer.headers.get("set-cookie")).toBeNull();
      expect(await normalisedWire(clientAnswer)).toBe(visitorWire);
      expectNothingFilled(asClient);
    },
  );

  it("the every-request bucket refusing (429)", async () => {
    const scenario = await aScenario();
    scenario.asAClient();
    scenario.harness.recorded.mockResolvedValue([1_000_000]);

    const answer = await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(answer.status).toBe(429);
    expectNothingFilled(scenario);
  });

  it("a new request refused by the bucket of new requests (429), answered as it is a visitor", async () => {
    const scenario = await aScenario();
    for (
      let request = 0;
      request < CONTACT_NEW_PER_BLOCK_HOUR_FIGURE;
      request += 1
    ) {
      await scenario.harness.submit(
        callbackBodyNamingTheSubmitter({
          clientRequestId: `req_00000000000000${String(request).padStart(2, "0")}`,
        }),
      );
    }
    const refusedAsVisitor = await scenario.harness.submit(
      callbackBodyNamingTheSubmitter({
        clientRequestId: "req_eeeeeeeeeeeeeeee",
      }),
    );
    scenario.asAClient();
    const readsBefore = scenario.sessionReads.count;

    const refusedAsClient = await scenario.harness.submit(
      callbackBodyNamingTheSubmitter({
        clientRequestId: "req_ffffffffffffffff",
      }),
    );

    expect(refusedAsClient.status).toBe(429);
    expect(await normalisedWire(refusedAsClient)).toBe(
      await normalisedWire(refusedAsVisitor),
    );
    expectNothingFilled(scenario, readsBefore);
  });

  it("a retry refused by the tries bucket (429), after the first try stored the request", async () => {
    const scenario = await aScenario({ outcomes: [NOT_NOTIFIED] });
    await scenario.harness.submit(bodyNamingTheSubmitter());
    for (
      let attempt = 0;
      attempt <= CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE;
      attempt += 1
    ) {
      await scenario.harness.submit(bodyNamingTheSubmitter());
    }
    scenario.asAClient();
    const readsBefore = scenario.sessionReads.count;

    const refused = await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(refused.status).toBe(429);
    expectNothingFilled(scenario, readsBefore);
  });

  it("a stored id sent with other contents (409 CONTACT_REQUEST_CONFLICT) answers a client as a visitor", async () => {
    const scenario = await aScenario();
    await scenario.harness.submit(bodyNamingTheSubmitter());
    const changed = bodyNamingTheSubmitter({
      contact: {
        name: "Someone Else",
        phone: "069 999 888",
        locality: "Elsewhere",
        channel: "phone",
        consent: true,
        consentTextVersion: "placeholder",
      },
    });
    const conflictAsVisitor = await scenario.harness.submit(changed);
    scenario.asAClient();
    const readsBefore = scenario.sessionReads.count;

    const conflictAsClient = await scenario.harness.submit(changed);

    expect(conflictAsClient.status).toBe(409);
    expect(await normalisedWire(conflictAsClient)).toBe(
      await normalisedWire(conflictAsVisitor),
    );
    expectNothingFilled(scenario, readsBefore);
  });
});

describe("a confirmed client's callback with no locality writes no address", () => {
  it("leaves the blank address null and fills the name and the phone pair", async () => {
    const scenario = await aScenario();
    scenario.asAClient();

    await scenario.harness.submit(
      callbackBodyNamingTheSubmitter({
        contact: {
          name: NAME_MARKER,
          phone: "069 000 111",
          channel: "phone",
          consent: true,
          consentTextVersion: "placeholder",
        },
      }),
    );

    expect(profileOf(scenario)).toEqual({
      name: NAME_MARKER,
      address: null,
      phone: "069 000 111",
      phoneNormalForm: "+37369000111",
    });
  });
});

describe("a request whose twin landed first (the record answers stored and already notified)", () => {
  it("still fills the submitter's blanks, once, and sends nothing", async () => {
    const scenario = await aScenario({
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: async (submission) => {
          const recorded = await inner.record(submission);
          return recorded.kind === "stored"
            ? { ...recorded, isNew: false, isNotified: true }
            : recorded;
        },
        markNotified: (id) => inner.markNotified(id),
      }),
    });
    scenario.asAClient();

    const answer = await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(answer.status).toBe(200);
    expect(scenario.harness.sender.sent).toHaveLength(0);
    expect(scenario.fills).toHaveLength(1);
    expect(profileOf(scenario)?.name).toBe(NAME_MARKER);
  });
});

describe("a retry fills the profile of the session that retries, never another's", () => {
  async function aStoredUnnotifiedRequest(): Promise<Scenario> {
    const scenario = await aScenario({ outcomes: [NOT_NOTIFIED] });
    expect(
      (await scenario.harness.submit(bodyNamingTheSubmitter())).status,
    ).toBe(502);
    return scenario;
  }

  it("an anonymous retry fills nothing and answers as sent", async () => {
    const scenario = await aStoredUnnotifiedRequest();

    const retried = await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(retried.status).toBe(200);
    expect(scenario.fills).toEqual([]);
  });

  it("an operator's retry of a stored request fills nothing", async () => {
    const scenario = await aStoredUnnotifiedRequest();
    scenario.who.session = clientSessionOf(scenario.accountId, "operator");

    await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(scenario.fills).toEqual([]);
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);
  });

  it("a confirmed client B retrying with the same id and body fills B's blanks and no one else's", async () => {
    const scenario = await aStoredUnnotifiedRequest();
    const other = await scenario.harness.accounts.createUnverified({
      email: "other@example.invalid",
      emailNormalForm: "other@example.invalid",
      phone: undefined,
      locale: "ro",
      privacyNoticeVersion: "2026-10-draft",
      passwordHash: PASSWORD_HASH,
    });
    if (other.kind !== "created") throw new Error("the address was taken");
    scenario.who.session = clientSessionOf(other.accountId);

    await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(scenario.fills.map(({ accountId }) => accountId)).toEqual([
      other.accountId,
    ]);
    expect(profileOf(scenario)).toEqual(NOTHING_HELD);
    expect(scenario.harness.accounts.heldProfileOf(other.accountId)?.name).toBe(
      NAME_MARKER,
    );
  });
});

describe("both best-effort steps hang", () => {
  it("the answer leaves after the two deadlines and no later, with a line for each", async () => {
    const hungMark: SentMarkStore = {
      markSent: () => new Promise<void>(() => undefined),
    };
    const scenario = await aScenario({ sentMarks: () => hungMark });
    scenario.asAClient();
    scenario.harness.accounts.fillProfileBlanks = () =>
      new Promise(() => undefined);
    vi.useFakeTimers();
    let answered: Response | undefined;
    void scenario.harness.submit(bodyNamingTheSubmitter()).then((answer) => {
      answered = answer;
    });

    await vi.advanceTimersByTimeAsync(2 * PROFILE_FILL_DEADLINE_MS - 1);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(answered?.status).toBe(200);
    expect(linesOfEvent(MARK_EVENT)).toHaveLength(1);
    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ cause: "timeout" }),
    ]);
  });
});

describe("a thrown value is never read, whatever it is", () => {
  const ALL_THREE_KEYS = ["cause", "event", "reference"];

  function poisonedObject(): object {
    return new Proxy(
      {},
      {
        get: () => {
          throw new Error("a thrown value was read");
        },
        has: () => {
          throw new Error("a thrown value was read");
        },
        getPrototypeOf: () => {
          throw new Error("a thrown value was read");
        },
      },
    );
  }

  it.each([
    ["a string", SENTINEL],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    [
      "a plain object holding the marker",
      { message: SENTINEL, cause: SENTINEL },
    ],
  ])(
    "%s thrown by the store is cause unexpected, in one three-key line",
    async (_label, thrown) => {
      const scenario = await aScenario();
      scenario.asAClient();
      scenario.harness.accounts.fillProfileBlanks = () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test is a store that rejects with a non-Error
        Promise.reject(thrown);

      const answer = await scenario.harness.submit(bodyNamingTheSubmitter());

      expect(answer.status).toBe(200);
      const [line, ...rest] = linesOfEvent(FILL_EVENT);
      expect(rest).toEqual([]);
      expect(line?.cause).toBe("unexpected");
      expect(Object.keys(line ?? {}).sort()).toEqual(ALL_THREE_KEYS);
      expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
        SENTINEL,
      );
    },
  );

  it("a store error carrying the marker in its message and cause is cause store-failed and the marker is not logged", async () => {
    const scenario = await aScenario();
    scenario.asAClient();
    scenario.harness.accounts.fillProfileBlanks = () =>
      Promise.reject(
        new AccountStoreError("fill a profile's blanks", {
          cause: new Error(SENTINEL),
        }),
      );

    await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ cause: "store-failed" }),
    ]);
    expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
      SENTINEL,
    );
  });

  it("an object that throws when it is touched (a Proxy whose getPrototypeOf throws) is still only cause unexpected, and still not a 5xx", async () => {
    const scenario = await aScenario();
    scenario.asAClient();
    const thrown = poisonedObject();
    scenario.harness.accounts.fillProfileBlanks = () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test is a store that rejects with a non-Error
      Promise.reject(thrown);

    const answer = await scenario.harness.submit(bodyNamingTheSubmitter());

    expect(answer.status).toBe(200);
    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ cause: "unexpected" }),
    ]);
  });

  it("the line carries no submitted value: no name, phone, locality or account id", async () => {
    const scenario = await aScenario();
    scenario.asAClient();
    scenario.harness.accounts.fillProfileBlanks = () =>
      Promise.reject(new Error("anything"));

    await scenario.harness.submit(bodyNamingTheSubmitter());

    const everything = JSON.stringify(consoleCallsOf(consoleSpies));
    for (const submitted of [
      NAME_MARKER,
      "069 000 111",
      "37369000111",
      "Fakeville",
      scenario.accountId,
      "submitter@example.invalid",
    ]) {
      expect(everything).not.toContain(submitted);
    }
  });
});

describe("a hung fill after the deadline cannot change what the customer was told", () => {
  it("a fill that answers at 1500 ms still finds the answer already sent as sent, with one timeout line", async () => {
    const scenario = await aScenario();
    scenario.asAClient();
    vi.useFakeTimers();
    const real = scenario.harness.accounts.fillProfileBlanks.bind(
      scenario.harness.accounts,
    );
    scenario.harness.accounts.fillProfileBlanks = (blanks) =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          real(blanks).then(resolve, reject);
        }, 1500);
      });
    let answered: Response | undefined;
    void scenario.harness.submit(bodyNamingTheSubmitter()).then((answer) => {
      answered = answer;
    });

    await vi.advanceTimersByTimeAsync(PROFILE_FILL_DEADLINE_MS);
    expect(answered?.status).toBe(200);
    await vi.advanceTimersByTimeAsync(1000);

    expect(linesOfEvent(FILL_EVENT)).toEqual([
      expect.objectContaining({ cause: "timeout" }),
    ]);
  });
});
