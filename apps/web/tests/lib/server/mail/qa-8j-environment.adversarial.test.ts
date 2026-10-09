// The reader, the selection and the factory over every combination of the flag and the three mail
// variables rather than one cell at a time, over an environment that records what it is asked, and
// over values the reader accepts once they reach the request they were accepted for.
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMailSender,
  FAKE_SENDER_WARNING,
} from "@/lib/server/mail/create-mail-sender";
import {
  MAIL_VARIABLE_NAMES,
  readMailConfiguration,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";
import { buildResendRequest } from "@/lib/server/mail/resend-mail-sender";
import {
  FAKE_MAIL_FLAG,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";

import { forbidFetch, releaseFetch } from "./mail-test-support";
import {
  consoleCallsOf,
  everyReadingOf,
  expectNoMarkerIn,
  FAKE_API_KEY,
  FAKE_INBOX,
  FAKE_SENDER,
  QA_MESSAGE,
  silenceEveryConsoleMethod,
  stubFetch,
  stubFetchAnswering,
  textAnswer,
} from "./qa-8j-support";

const USABLE_VALUES: Readonly<Record<string, string>> = {
  RESEND_API_KEY: FAKE_API_KEY,
  MAIL_FROM_ADDRESS: FAKE_SENDER,
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

const SECRETS = [FAKE_API_KEY, FAKE_SENDER, FAKE_INBOX, UNUSABLE_MARKER];

beforeEach(forbidFetch);
afterEach(() => {
  vi.restoreAllMocks();
  releaseFetch();
});

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
                apiKey: FAKE_API_KEY,
                fromAddress: FAKE_SENDER,
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

  it("builds a sender exactly where the selection is the fake or the provider, and otherwise answers the selection's names", () => {
    silenceEveryConsoleMethod();
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
    silenceEveryConsoleMethod();
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
    const consoleSpies = silenceEveryConsoleMethod();

    for (const { environment } of CELLS) createMailSender(environment);

    const lines = consoleCallsOf(consoleSpies);
    expect(lines).toHaveLength(cellsExpecting("fake").length);
    expect(lines.filter(([line]) => line !== FAKE_SENDER_WARNING)).toEqual([]);
    expect(lines.filter((line) => line.length !== 1)).toEqual([]);
    expect(vi.mocked(console.warn).mock.calls).toHaveLength(lines.length);
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
  const FOUR_NAMES = [...MAIL_VARIABLE_NAMES, FAKE_MAIL_FLAG].sort();

  it.each([
    ["a configured deployment", { ...USABLE_VALUES }],
    ["the flag alone", { [FAKE_MAIL_FLAG]: "1" }],
    [
      "the flag beside the variables",
      { ...USABLE_VALUES, [FAKE_MAIL_FLAG]: "1" },
    ],
    ["nothing", {}],
  ])(
    "asks for the four names at most, never the build mode or another variable, for %s",
    (_label, values) => {
      silenceEveryConsoleMethod();
      const { environment, asked } = recordingEnvironment({
        ...BYSTANDERS,
        ...values,
      });

      readMailConfiguration(environment);
      selectMailSender(environment);
      createMailSender(environment);

      expect([...asked].filter((name) => !FOUR_NAMES.includes(name))).toEqual(
        [],
      );
      expect(asked.size).toBeGreaterThan(0);
    },
  );

  it("reads nothing from the process environment while it reads, selects, builds and sends", async () => {
    silenceEveryConsoleMethod();
    stubFetchAnswering(() => textAnswer(200, '{"id":"msg_1"}'));
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
      const pending =
        creation.kind === "sender"
          ? creation.sender.send(QA_MESSAGE)
          : undefined;
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
      { RESEND_API_KEY: FAKE_API_KEY, LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX },
      "MAIL_FROM_ADDRESS",
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
      silenceEveryConsoleMethod();

      const result = answerOrThrown(() => ask(environmentWhoseSenderThrows()));

      expect(result).not.toMatchObject({ status: "configured" });
      expect(result).not.toMatchObject({ kind: "provider" });
      expect(result).not.toMatchObject({ kind: "sender" });
      expect(result).not.toMatchObject({ kind: "fake" });
      expectNoMarkerIn(result, [FAKE_API_KEY, FAKE_INBOX]);
    },
  );
});

const ADDRESS_BREAKERS = new Set([
  " ",
  "\t",
  "\r",
  "\n",
  "@",
  ",",
  ";",
  "<",
  ">",
]);

/** Visible ASCII a recipient list or a header could not be split on: what the reader's rule lets through. */
const addressPart = fc
  .array(
    fc.constantFrom(
      ...Array.from({ length: 0x7e - 0x21 + 1 }, (_unused, index) =>
        String.fromCharCode(0x21 + index),
      ).filter((character) => !ADDRESS_BREAKERS.has(character)),
    ),
    { minLength: 1, maxLength: 24 },
  )
  .map((characters) => characters.join(""));

const acceptedAddress = fc
  .tuple(addressPart, addressPart)
  .map(([local, domain]) => `${local}@${domain}`);

describe("an address the reader accepts, once it is in the request", () => {
  it("is the body's one recipient and its sender, each read back whole from the JSON, however odd its characters", () => {
    fc.assert(
      fc.property(acceptedAddress, acceptedAddress, (sender, inbox) => {
        const read = readMailConfiguration({
          RESEND_API_KEY: FAKE_API_KEY,
          MAIL_FROM_ADDRESS: sender,
          LEAD_NOTIFICATION_ADDRESS: inbox,
        });
        if (read.status !== "configured")
          throw new Error("the generated address was not accepted");

        const built = buildResendRequest(QA_MESSAGE, read.configuration);
        const body = JSON.parse(built.init.body) as Record<string, unknown>;

        expect(body.to).toStrictEqual([inbox]);
        expect(body.from).toBe(sender);
        expect(Object.keys(body)).toEqual(["from", "to", "subject", "text"]);
        expect(JSON.stringify(built.init.headers)).not.toContain(inbox);
        expect(JSON.stringify(built.init.headers)).not.toContain(sender);
      }),
    );
  });

  it("accepts a key of any visible ASCII and builds a request the platform's constructor takes with it", () => {
    const everyVisibleCharacter = Array.from(
      { length: 0x7e - 0x21 + 1 },
      (_unused, index) => String.fromCharCode(0x21 + index),
    ).join("");
    const read = readMailConfiguration({
      ...USABLE_VALUES,
      RESEND_API_KEY: everyVisibleCharacter,
    });
    if (read.status !== "configured")
      throw new Error("the key was not accepted");

    const built = buildResendRequest(QA_MESSAGE, read.configuration);

    expect(
      new Request(built.url, built.init).headers.get("authorization"),
    ).toBe(`Bearer ${everyVisibleCharacter}`);
  });
});

describe("the key, in what the factory hands back", () => {
  function functionsReachableFrom(value: object): string[] {
    const sources: string[] = [];
    for (
      let holder: object | null = value;
      holder !== null && holder !== Object.prototype;
      holder = Object.getPrototypeOf(holder) as object | null
    ) {
      for (const name of Reflect.ownKeys(holder)) {
        const member: unknown = Reflect.get(holder, name);
        if (typeof member === "function")
          sources.push(Function.prototype.toString.call(member));
      }
    }
    return sources;
  }

  it("is in no function's source text and on no member of the sender or its prototypes", () => {
    silenceEveryConsoleMethod();
    const creation = createMailSender(USABLE_VALUES);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const sources = functionsReachableFrom(creation.sender);

    expect(sources.length).toBeGreaterThan(0);
    expectNoMarkerIn(sources, SECRETS);
    expect(Object.getPrototypeOf(creation.sender)).toBe(Object.prototype);
    expect(Object.getOwnPropertySymbols(creation.sender)).toEqual([]);
  });

  it("is in no outcome and no line, whatever a failing transport throws back at a sender the factory built", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const creation = createMailSender(USABLE_VALUES);
    if (creation.kind !== "sender") throw new Error("expected a sender");
    const outcomes: unknown[] = [];
    const transports = [
      () => Promise.reject(new TypeError(`bad header ${FAKE_API_KEY}`)),
      () => Promise.resolve(textAnswer(401, `{"message":"${FAKE_API_KEY}"}`)),
      () => Promise.resolve(textAnswer(200, `{"id":"${FAKE_API_KEY}"}`)),
    ];

    for (const transport of transports) {
      stubFetch(transport);
      outcomes.push(await creation.sender.send(QA_MESSAGE));
    }

    expectNoMarkerIn(outcomes, SECRETS);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});

describe("the fake the factory builds", () => {
  it("writes its line when it is built and never when it is used, refused sends included", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    const creation = createMailSender({ [FAKE_MAIL_FLAG]: "1" });
    if (creation.kind !== "sender") throw new Error("expected a sender");
    const linesAtBuild = consoleCallsOf(consoleSpies).length;

    await creation.sender.send(QA_MESSAGE);
    await creation.sender.send({ ...QA_MESSAGE, key: "not sendable" });
    await creation.sender.send(QA_MESSAGE);

    expect(linesAtBuild).toBe(1);
    expect(consoleCallsOf(consoleSpies)).toHaveLength(1);
  });

  it("gives each build its own record, so one server's fake never answers with another's messages", async () => {
    silenceEveryConsoleMethod();
    const first = createMailSender({ [FAKE_MAIL_FLAG]: "1" });
    const second = createMailSender({ [FAKE_MAIL_FLAG]: "1" });
    if (first.kind !== "sender" || second.kind !== "sender")
      throw new Error("expected two senders");

    await first.sender.send(QA_MESSAGE);

    expect((second.sender as unknown as { sent: unknown[] }).sent).toEqual([]);
    expect((first.sender as unknown as { sent: unknown[] }).sent).toEqual([
      QA_MESSAGE,
    ]);
  });
});
