// The reader, the selection and the factory over every combination of the flag and the three mail
// variables rather than one cell at a time, over the two retired names, over an environment that records
// what it is asked, and over values the reader accepts once they reach the message they were accepted for.
// The mail library is scripted: the factory builds the real adapter, and no test below opens a socket.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMailSender,
  FAKE_SENDER_WARNING,
} from "@/lib/server/mail/create-mail-sender";
import {
  buildGmailMessage,
  UnusableMailAddressError,
} from "@/lib/server/mail/gmail-mail-sender";
import {
  MAIL_VARIABLE_NAMES,
  readMailConfiguration,
  RETIRED_MAIL_VARIABLE_NAMES,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";
import {
  FAKE_MAIL_FLAG,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";

import {
  forbidFetch,
  forbidNetwork,
  releaseFetch,
  releaseNetwork,
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "./mail-test-support";
import {
  ACCEPTED_ONE_RECIPIENT,
  everyReadingOf,
  expectNoMarkerIn,
  FAKE_APP_PASSWORD,
  FAKE_INBOX,
  FAKE_SENDER,
  QA_MESSAGE,
  quotingLibraryError,
  rejectingWith,
} from "./qa-8j-support";

// The factory's default transport is the library's own `createTransport`: scripted here, and held by the network guard.
const { createTransportMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
}));
vi.mock("nodemailer", () => ({ createTransport: createTransportMock }));

const USABLE_VALUES: Readonly<Record<string, string>> = {
  GOOGLE_EMAIL: FAKE_SENDER,
  GOOGLE_APP_PASSWORD: FAKE_APP_PASSWORD,
  LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
};

const UNUSABLE_MARKER = "QA-UNUSABLE-5d81c0";

type Placement = (target: Record<string, unknown>, name: string) => void;

interface VariableState {
  readonly label: string;
  /** Whether the environment itself defines the name, whatever it holds. */
  readonly isPresent: boolean;
  readonly isUsable: boolean;
  readonly place: Placement;
}

const own =
  (valueOf: (name: string) => unknown): Placement =>
  (target, name) => {
    target[name] = valueOf(name);
  };

const VARIABLE_STATES: readonly VariableState[] = [
  {
    label: "absent",
    isPresent: false,
    isUsable: false,
    place: () => undefined,
  },
  { label: "empty", isPresent: true, isUsable: false, place: own(() => "") },
  {
    label: "whitespace",
    isPresent: true,
    isUsable: false,
    place: own(() => " \t"),
  },
  {
    label: "usable",
    isPresent: true,
    isUsable: true,
    place: own((name) => USABLE_VALUES[name]),
  },
  {
    label: "unusable",
    isPresent: true,
    isUsable: false,
    place: own(() => `${UNUSABLE_MARKER} a@example.com, b@example.com`),
  },
  {
    label: "usable with a trailing line break",
    isPresent: true,
    isUsable: false,
    place: own((name) => `${USABLE_VALUES[name] ?? ""}\n`),
  },
  {
    label: "not text",
    isPresent: true,
    isUsable: false,
    place: own(() => ({ toString: () => UNUSABLE_MARKER })),
  },
  {
    label: "a member holding undefined",
    isPresent: true,
    isUsable: false,
    place: own(() => undefined),
  },
  {
    label: "a member holding null",
    isPresent: true,
    isUsable: false,
    place: own(() => null),
  },
  {
    label: "inherited",
    isPresent: false,
    isUsable: false,
    place: (target, name) => {
      (Object.getPrototypeOf(target) as Record<string, unknown>)[name] =
        USABLE_VALUES[name];
    },
  },
];

interface FlagState {
  readonly label: string;
  readonly isEnabled: boolean;
  readonly place: Placement;
}

const FLAG_STATES: readonly FlagState[] = [
  { label: "absent", isEnabled: false, place: () => undefined },
  { label: "exactly 1", isEnabled: true, place: own(() => "1") },
  { label: "0", isEnabled: false, place: own(() => "0") },
  { label: "empty", isEnabled: false, place: own(() => "") },
  { label: "true", isEnabled: false, place: own(() => "true") },
  { label: "1 and a line break", isEnabled: false, place: own(() => "1\n") },
  { label: "the number 1", isEnabled: false, place: own(() => 1) },
  {
    label: "inherited",
    isEnabled: false,
    place: (target, name) => {
      (Object.getPrototypeOf(target) as Record<string, unknown>)[name] = "1";
    },
  },
];

interface Cell {
  readonly label: string;
  readonly environment: MailEnvironment;
  readonly expectedSelection: unknown;
  readonly unusableNames: readonly string[];
}

function cellOf(flag: FlagState, states: readonly VariableState[]): Cell {
  const environment = Object.create({}) as Record<string, unknown>;
  flag.place(environment, FAKE_MAIL_FLAG);
  MAIL_VARIABLE_NAMES.forEach((name, index) => {
    states[index]?.place(environment, name);
  });
  const unusableNames = MAIL_VARIABLE_NAMES.filter(
    (_name, index) => states[index]?.isUsable !== true,
  );
  return {
    label: `flag ${flag.label}; ${states.map(({ label }) => label).join(", ")}`,
    environment: environment as MailEnvironment,
    expectedSelection: expectedSelectionOf(flag, states, unusableNames),
    unusableNames,
  };
}

function expectedSelectionOf(
  flag: FlagState,
  states: readonly VariableState[],
  unusableNames: readonly string[],
): unknown {
  const isAnyPresent = states.some(({ isPresent }) => isPresent);
  if (flag.isEnabled && isAnyPresent)
    return { kind: "unavailable", variables: [FAKE_MAIL_FLAG] };
  if (flag.isEnabled) return { kind: "fake" };
  if (unusableNames.length === 0) return { kind: "provider" };
  return { kind: "unavailable", variables: unusableNames };
}

const CELLS: readonly Cell[] = FLAG_STATES.flatMap((flag) =>
  VARIABLE_STATES.flatMap((key) =>
    VARIABLE_STATES.flatMap((sender) =>
      VARIABLE_STATES.map((inbox) => cellOf(flag, [key, sender, inbox])),
    ),
  ),
);

function cellsExpecting(kind: string): readonly Cell[] {
  return CELLS.filter(
    ({ expectedSelection }) =>
      (expectedSelection as { kind: string }).kind === kind,
  );
}

const SECRETS = [FAKE_APP_PASSWORD, FAKE_SENDER, FAKE_INBOX, UNUSABLE_MARKER];

beforeEach(() => {
  createTransportMock.mockReset();
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseFetch();
  releaseNetwork();
});

/** Hands the next `createTransport` a transport whose `sendMail` does what the test says. */
function scriptTransport(sendMail: () => Promise<unknown>) {
  const transport = { sendMail: vi.fn(sendMail), close: vi.fn() };
  createTransportMock.mockReturnValue(transport);
  return transport;
}

describe("every combination of the flag and the three mail variables", () => {
  it("holds cells for the fake, the provider, a stray flag and a missing variable, so no arm below is empty", () => {
    expect(cellsExpecting("fake").length).toBeGreaterThan(0);
    expect(cellsExpecting("provider").length).toBeGreaterThan(0);
    expect(
      CELLS.filter(
        ({ expectedSelection }) =>
          JSON.stringify(expectedSelection) ===
          JSON.stringify({ kind: "unavailable", variables: [FAKE_MAIL_FLAG] }),
      ).length,
    ).toBeGreaterThan(0);
    expect(cellsExpecting("unavailable").length).toBeGreaterThan(0);
    expect(CELLS).toHaveLength(
      FLAG_STATES.length * VARIABLE_STATES.length ** MAIL_VARIABLE_NAMES.length,
    );
  });

  it("selects by the rule in every cell", () => {
    const wrong = CELLS.filter(
      ({ environment, expectedSelection }) =>
        JSON.stringify(selectMailSender(environment)) !==
        JSON.stringify(expectedSelection),
    ).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("reads a configuration exactly when all three are usable, and otherwise names each that is not, in order", () => {
    const wrong = CELLS.filter(({ environment, unusableNames }) => {
      const expected =
        unusableNames.length === 0
          ? {
              status: "configured",
              configuration: {
                senderAddress: FAKE_SENDER,
                appPassword: FAKE_APP_PASSWORD,
                notificationAddress: FAKE_INBOX,
              },
            }
          : { status: "unavailable", variables: unusableNames };
      return (
        JSON.stringify(readMailConfiguration(environment)) !==
        JSON.stringify(expected)
      );
    }).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("builds a sender exactly for the fake and the provider, and otherwise answers the selection's names", () => {
    spyOnEveryConsoleMethod();
    const wrong = CELLS.filter(({ environment, expectedSelection }) => {
      const creation = createMailSender(environment);
      const selected = expectedSelection as { kind: string };
      return selected.kind === "unavailable"
        ? JSON.stringify(creation) !== JSON.stringify(expectedSelection)
        : creation.kind !== "sender";
    }).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("puts no value of any variable, usable or not, into a selection or into what the factory returns", () => {
    spyOnEveryConsoleMethod();
    const leaking = CELLS.filter(({ environment }) => {
      const readings = everyReadingOf([
        selectMailSender(environment),
        createMailSender(environment),
      ]);
      return SECRETS.some((secret) => readings.includes(secret));
    }).map(({ label }) => label);

    expect(leaking).toEqual([]);
  });

  it("puts no value into an unavailable reading of the configuration", () => {
    const leaking = cellsExpecting("unavailable")
      .filter(({ environment, unusableNames }) => {
        const readings = everyReadingOf(readMailConfiguration(environment));
        return (
          unusableNames.length > 0 &&
          SECRETS.some((secret) => readings.includes(secret))
        );
      })
      .map(({ label }) => label);

    expect(leaking).toEqual([]);
  });

  it("writes the one warning once for each fake built and nothing in any other cell", () => {
    const consoleSpies = spyOnEveryConsoleMethod();

    for (const { environment } of CELLS) createMailSender(environment);

    const lines = consoleCallsOf(consoleSpies);
    expect(lines).toHaveLength(cellsExpecting("fake").length);
    expect(lines.filter(([line]) => line !== FAKE_SENDER_WARNING)).toEqual([]);
    expect(lines.filter((line) => line.length !== 1)).toEqual([]);
    expect(vi.mocked(console.warn).mock.calls).toHaveLength(lines.length);
  });
});

interface RetiredState {
  readonly label: string;
  /** Whether the environment itself defines the name, whatever it holds. */
  readonly isPresent: boolean;
  readonly place: Placement;
}

const RETIRED_STATES: readonly RetiredState[] = [
  { label: "absent", isPresent: false, place: () => undefined },
  { label: "a value", isPresent: true, place: own(() => "retired-value") },
  { label: "empty", isPresent: true, place: own(() => "") },
  { label: "own undefined", isPresent: true, place: own(() => undefined) },
  {
    label: "inherited",
    isPresent: false,
    place: (target, name) => {
      (Object.getPrototypeOf(target) as Record<string, unknown>)[name] =
        "retired-value";
    },
  },
];

function stateLabelled(label: string): VariableState {
  const found = VARIABLE_STATES.find((state) => state.label === label);
  if (found === undefined) throw new Error(`no variable state ${label}`);
  return found;
}

/** The live three held at the states that decide the answer: all usable, none present, one unusable, one empty. */
const LIVE_STATE_SETS: readonly (readonly VariableState[])[] = [
  ["usable", "usable", "usable"],
  ["absent", "absent", "absent"],
  ["usable", "usable", "unusable"],
  ["empty", "usable", "usable"],
].map((labels) => labels.map(stateLabelled));

describe("the two retired names beside the flag and the three live ones", () => {
  interface RetiredCell {
    readonly label: string;
    readonly environment: MailEnvironment;
    readonly flag: FlagState;
    readonly retiredAreOwn: boolean;
    readonly live: readonly VariableState[];
  }

  const RETIRED_CELLS: readonly RetiredCell[] = FLAG_STATES.flatMap((flag) =>
    LIVE_STATE_SETS.flatMap((live) =>
      RETIRED_STATES.flatMap((first) =>
        RETIRED_STATES.map((second) => {
          const environment = Object.create({}) as Record<string, unknown>;
          flag.place(environment, FAKE_MAIL_FLAG);
          MAIL_VARIABLE_NAMES.forEach((name, index) => {
            live[index]?.place(environment, name);
          });
          first.place(environment, RETIRED_MAIL_VARIABLE_NAMES[0]);
          second.place(environment, RETIRED_MAIL_VARIABLE_NAMES[1]);
          return {
            label: `flag ${flag.label}; live ${live.map(({ label }) => label).join("/")}; retired ${first.label}, ${second.label}`,
            environment: environment as MailEnvironment,
            flag,
            retiredAreOwn: first.isPresent || second.isPresent,
            live,
          };
        }),
      ),
    ),
  );

  const NAMES_OF_THE_UNUSABLE = (live: readonly VariableState[]) =>
    MAIL_VARIABLE_NAMES.filter((_name, index) => !live[index]?.isUsable);

  it("holds cells in which a retired name is own and the flag is on, and cells in which it is not", () => {
    expect(
      RETIRED_CELLS.filter(
        ({ flag, retiredAreOwn, live }) =>
          flag.isEnabled &&
          retiredAreOwn &&
          live.every(({ isPresent }) => !isPresent),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      RETIRED_CELLS.filter(
        ({ flag, retiredAreOwn, live }) =>
          flag.isEnabled &&
          !retiredAreOwn &&
          live.every(({ isPresent }) => !isPresent),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("refuses the fake beside a retired name that is an own member, whatever it holds and whatever the live three hold", () => {
    const wrong = RETIRED_CELLS.filter(
      ({ environment, flag, retiredAreOwn, live }) => {
        const isAnyLiveOwn = live.some(({ isPresent }) => isPresent);
        const expected =
          flag.isEnabled && (retiredAreOwn || isAnyLiveOwn)
            ? { kind: "unavailable", variables: [FAKE_MAIL_FLAG] }
            : flag.isEnabled
              ? { kind: "fake" }
              : NAMES_OF_THE_UNUSABLE(live).length === 0
                ? { kind: "provider" }
                : {
                    kind: "unavailable",
                    variables: NAMES_OF_THE_UNUSABLE(live),
                  };
        return (
          JSON.stringify(selectMailSender(environment)) !==
          JSON.stringify(expected)
        );
      },
    ).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("never lets a retired name configure, name it as unavailable, or change which live names are named", () => {
    const wrong = RETIRED_CELLS.filter(({ environment, live }) => {
      const unusable = NAMES_OF_THE_UNUSABLE(live);
      const read = readMailConfiguration(environment);
      return unusable.length === 0
        ? read.status !== "configured"
        : JSON.stringify(read) !==
            JSON.stringify({ status: "unavailable", variables: unusable });
    }).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("builds a sender through the factory exactly where the selection says, and names the flag alone where it refuses", () => {
    spyOnEveryConsoleMethod();
    const wrong = RETIRED_CELLS.filter(({ environment }) => {
      const selection = selectMailSender(environment);
      const creation = createMailSender(environment);
      return selection.kind === "unavailable"
        ? JSON.stringify(creation) !== JSON.stringify(selection)
        : creation.kind !== "sender";
    }).map(({ label }) => label);

    expect(wrong).toEqual([]);
  });

  it("never names a retired name in anything it answers", () => {
    spyOnEveryConsoleMethod();
    const naming = RETIRED_CELLS.filter(({ environment }) => {
      const readings = everyReadingOf([
        selectMailSender(environment),
        readMailConfiguration(environment),
        createMailSender(environment),
      ]);
      return (
        RETIRED_MAIL_VARIABLE_NAMES.some((name) => readings.includes(name)) ||
        readings.includes("retired-value")
      );
    }).map(({ label }) => label);

    expect(naming).toEqual([]);
  });
});

/** An environment that answers from `values` and records every name it is asked about, by any route. */
function recordingEnvironment(values: Record<string, string>) {
  const asked = new Set<string>();
  const record = (name: string | symbol) => {
    asked.add(String(name));
  };
  const environment = new Proxy(values, {
    get(target, name, receiver) {
      record(name);
      return Reflect.get(target, name, receiver) as unknown;
    },
    has(target, name) {
      record(name);
      return Reflect.has(target, name);
    },
    getOwnPropertyDescriptor(target, name) {
      record(name);
      return Reflect.getOwnPropertyDescriptor(target, name);
    },
    ownKeys(target) {
      record("(every name)");
      return Reflect.ownKeys(target);
    },
  });
  return { environment, asked };
}

const BYSTANDERS = {
  NODE_ENV: "production",
  DATABASE_URL: "QA-BYSTANDER-5d81c0",
  VERCEL_ENV: "production",
  CI: "1",
};

describe("what the three functions ask of the environment they are handed", () => {
  // The three the reader reads, the two it retired (the fake's fence asks whether each is present), and the flag.
  const SIX_NAMES = [
    ...MAIL_VARIABLE_NAMES,
    ...RETIRED_MAIL_VARIABLE_NAMES,
    FAKE_MAIL_FLAG,
  ].sort();

  it.each([
    ["a configured deployment", { ...USABLE_VALUES }],
    ["the flag alone", { [FAKE_MAIL_FLAG]: "1" }],
    [
      "the flag beside the variables",
      { ...USABLE_VALUES, [FAKE_MAIL_FLAG]: "1" },
    ],
    ["nothing", {}],
    [
      "the flag beside the retired names",
      { [FAKE_MAIL_FLAG]: "1", RESEND_API_KEY: "x", MAIL_FROM_ADDRESS: "y" },
    ],
  ])(
    "asks for the six names at most, never the build mode or another variable, for %s",
    (_label, values) => {
      spyOnEveryConsoleMethod();
      const { environment, asked } = recordingEnvironment({
        ...BYSTANDERS,
        ...values,
      });

      readMailConfiguration(environment);
      selectMailSender(environment);
      createMailSender(environment);

      expect([...asked].filter((name) => !SIX_NAMES.includes(name))).toEqual(
        [],
      );
      expect(asked.size).toBeGreaterThan(0);
    },
  );

  it("reads nothing from the process environment while it reads, selects, builds and sends", async () => {
    spyOnEveryConsoleMethod();
    scriptTransport(() => Promise.resolve(ACCEPTED_ONE_RECIPIENT));
    const processAsked: string[] = [];
    const realEnvironment = process.env;
    process.env = new Proxy({} as NodeJS.ProcessEnv, {
      get(_target, name) {
        processAsked.push(String(name));
        return undefined;
      },
      has(_target, name) {
        processAsked.push(String(name));
        return false;
      },
      getOwnPropertyDescriptor(_target, name) {
        processAsked.push(String(name));
        return undefined;
      },
    });
    let askedDuringTheCalls: string[];
    try {
      readMailConfiguration(USABLE_VALUES);
      selectMailSender(USABLE_VALUES);
      const creation = createMailSender(USABLE_VALUES);
      if (creation.kind !== "sender") throw new Error("expected a sender");
      const pending = creation.sender.send(QA_MESSAGE);
      askedDuringTheCalls = [...processAsked];
      await pending;
    } finally {
      process.env = realEnvironment;
    }

    expect(askedDuringTheCalls).toEqual([]);
  });
});

describe("a variable the environment cannot hand over", () => {
  function environmentWhoseSenderThrows(): MailEnvironment {
    return Object.defineProperty(
      {
        GOOGLE_APP_PASSWORD: FAKE_APP_PASSWORD,
        LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
      },
      "GOOGLE_EMAIL",
      {
        enumerable: true,
        get(): string {
          throw new Error("the environment refused the read");
        },
      },
    ) as MailEnvironment;
  }

  function answerOrThrown(action: () => unknown): unknown {
    try {
      return action();
    } catch (error) {
      return { thrown: error };
    }
  }

  it.each([
    ["the reader", readMailConfiguration],
    ["the selection", selectMailSender],
    ["the factory", createMailSender],
  ])(
    "never makes %s answer a configuration, a provider or a sender, and nothing that comes out holds the key",
    (_label, ask) => {
      spyOnEveryConsoleMethod();

      const result = answerOrThrown(() => ask(environmentWhoseSenderThrows()));

      expect(result).not.toMatchObject({ status: "configured" });
      expect(result).not.toMatchObject({ kind: "provider" });
      expect(result).not.toMatchObject({ kind: "sender" });
      expect(result).not.toMatchObject({ kind: "fake" });
      expectNoMarkerIn(result, [FAKE_APP_PASSWORD, FAKE_INBOX]);
    },
  );
});

const VISIBLE_ASCII = Array.from(
  { length: 0x7e - 0x21 + 1 },
  (_unused, index) => String.fromCharCode(0x21 + index),
);

/** Visible ASCII of any shape, with a few characters a mailbox must not hold, so most draws are refused. */
const anyVisibleText = fc
  .array(fc.constantFrom(...VISIBLE_ASCII, " ", "\t", "\n", "\r", "\u0085"), {
    minLength: 1,
    maxLength: 30,
  })
  .map((characters) => characters.join(""));

const DOT_ATOM_CHARACTERS = Array.from("abcXYZ019!#$%&'*+/=?^_`{|}~-");
const LABEL_CHARACTERS = Array.from("abcxyz019-");

/** A mailbox of the plain shape, sometimes with a bad character spliced in, so most draws are accepted. */
const nearlyPlainMailbox = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...DOT_ATOM_CHARACTERS), minLength: 1 }),
    fc.string({ unit: fc.constantFrom(...LABEL_CHARACTERS), minLength: 1 }),
    fc.string({
      unit: fc.constantFrom(..."abcxyz".split("")),
      minLength: 1,
      maxLength: 6,
    }),
    fc.constantFrom("", "", "", '"', "(", "\\", "[", "]", ",", ";", ":", "<"),
  )
  .map(([local, label, top, splice]) => `${local}@${label}.${top}${splice}`);

const candidateAddress = fc.oneof(
  anyVisibleText,
  nearlyPlainMailbox,
  fc.constantFrom("a@bücher.example", "a@b.example", "x@y.z.example"),
);

const WELL_FORMED_MESSAGE_ID = /^<[0-9a-f]{64}@[a-z0-9.-]+>$/;

describe("an address the reader accepts, once it is in the message", () => {
  const OTHER_ADDRESS = "qa-other-5d81c0@example.org";

  /** Whether the adapter can write `address` as the given setting: it builds the message, or it refuses it. */
  function isWrittenByTheAdapter(
    address: string,
    setting: "senderAddress" | "notificationAddress",
  ): boolean {
    try {
      const options = buildGmailMessage(QA_MESSAGE, {
        senderAddress: OTHER_ADDRESS,
        appPassword: FAKE_APP_PASSWORD,
        notificationAddress: OTHER_ADDRESS,
        [setting]: address,
      });
      expect(options.messageId).toMatch(WELL_FORMED_MESSAGE_ID);
      expect(options.from).toBe(
        setting === "senderAddress" ? address : OTHER_ADDRESS,
      );
      expect(options.to).toBe(
        setting === "notificationAddress" ? address : OTHER_ADDRESS,
      );
      return true;
    } catch (thrown) {
      if (!(thrown instanceof UnusableMailAddressError)) throw thrown;
      expect(thrown.setting).toBe(setting);
      return false;
    }
  }

  function isReadAsConfigured(address: string, name: string): boolean {
    const read = readMailConfiguration({
      GOOGLE_EMAIL: OTHER_ADDRESS,
      GOOGLE_APP_PASSWORD: FAKE_APP_PASSWORD,
      LEAD_NOTIFICATION_ADDRESS: OTHER_ADDRESS,
      [name]: address,
    });
    return read.status === "configured";
  }

  it.each([
    ["GOOGLE_EMAIL", "senderAddress"],
    ["LEAD_NOTIFICATION_ADDRESS", "notificationAddress"],
  ] as const)(
    "is read as configured in %s exactly when the adapter can write it, with a well-formed Message-ID, over %s",
    (name, setting) => {
      const tally = { accepted: 0, refused: 0 };

      fc.assert(
        fc.property(candidateAddress, (address) => {
          const isRead = isReadAsConfigured(address, name);
          const isWritten = isWrittenByTheAdapter(address, setting);

          expect(isRead).toBe(isWritten);
          tally[isRead ? "accepted" : "refused"] += 1;
        }),
        { numRuns: 600 },
      );

      expect(tally.accepted).toBeGreaterThan(30);
      expect(tally.refused).toBeGreaterThan(30);
    },
  );

  it("makes an address's bytes appear nowhere in the message's options but in the one member it was configured as", () => {
    const options = buildGmailMessage(QA_MESSAGE, {
      senderAddress: FAKE_SENDER,
      appPassword: FAKE_APP_PASSWORD,
      notificationAddress: FAKE_INBOX,
    });

    expect(JSON.stringify({ ...options, from: "", to: "" })).not.toContain(
      FAKE_INBOX,
    );
    expect(
      JSON.stringify({ ...options, from: "", to: "", messageId: "" }),
    ).not.toContain(FAKE_SENDER);
  });

  it("is a password of every visible character that reaches the transport's `auth.pass` and no message option", async () => {
    spyOnEveryConsoleMethod();
    const everyVisibleCharacter = VISIBLE_ASCII.join("");
    const transport = scriptTransport(() =>
      Promise.resolve(ACCEPTED_ONE_RECIPIENT),
    );
    const creation = createMailSender({
      ...USABLE_VALUES,
      GOOGLE_APP_PASSWORD: everyVisibleCharacter,
    });
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(QA_MESSAGE);

    expect(outcome).toEqual({ ok: true });
    expect(createTransportMock.mock.calls[0]?.[0]).toMatchObject({
      auth: { user: FAKE_SENDER, pass: everyVisibleCharacter },
    });
    const sentOptions = JSON.stringify(transport.sendMail.mock.calls);
    expect(sentOptions).not.toContain(everyVisibleCharacter.slice(0, 20));
  });
});

describe("the password, in what the factory hands back", () => {
  const FAILURES: readonly [string, () => Promise<unknown>][] = [
    [
      "a rejection quoting every marker",
      () => Promise.reject(quotingLibraryError({ code: "EAUTH" })),
    ],
    [
      "a reply quoting the password",
      () =>
        Promise.reject(
          quotingLibraryError({ responseCode: 535, code: "EAUTH" }),
        ),
    ],
    [
      "a result that names them",
      () =>
        Promise.resolve({
          accepted: [],
          rejected: [FAKE_INBOX],
          response: FAKE_APP_PASSWORD,
        }),
    ],
    ["a thrown string", () => rejectingWith(FAKE_APP_PASSWORD)],
  ];

  it("is in no outcome and no line, whatever a failing transport throws back at the factory's sender", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    const creation = createMailSender(USABLE_VALUES);
    if (creation.kind !== "sender") throw new Error("expected a sender");
    const outcomes: unknown[] = [];

    for (const [, failure] of FAILURES) {
      scriptTransport(failure);
      outcomes.push(await creation.sender.send(QA_MESSAGE));
    }

    expectNoMarkerIn(outcomes, SECRETS);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
    expect(outcomes.every((outcome) => !(outcome as { ok: boolean }).ok)).toBe(
      true,
    );
  });
});

describe("the fake the factory builds", () => {
  it("writes its line when it is built and never when it is used, refused sends included", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    const creation = createMailSender({ [FAKE_MAIL_FLAG]: "1" });
    if (creation.kind !== "sender") throw new Error("expected a sender");
    const linesAtBuild = consoleCallsOf(consoleSpies).length;

    await creation.sender.send(QA_MESSAGE);
    await creation.sender.send({ ...QA_MESSAGE, key: "not sendable" });
    await creation.sender.send(QA_MESSAGE);

    expect(linesAtBuild).toBe(1);
    expect(consoleCallsOf(consoleSpies)).toHaveLength(1);
  });

  it("hands back a sender of `send` alone, from which nothing it was sent can be read back", async () => {
    spyOnEveryConsoleMethod();
    const creation = createMailSender({ [FAKE_MAIL_FLAG]: "1" });
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(QA_MESSAGE);

    expect(outcome).toEqual({ ok: true });
    expect(Reflect.ownKeys(creation.sender)).toEqual(["send"]);
    expect(Object.getPrototypeOf(creation.sender)).toBe(Object.prototype);
    expectNoMarkerIn(
      [creation, creation.sender],
      [QA_MESSAGE.key, QA_MESSAGE.subject, QA_MESSAGE.text],
    );
  });
});
