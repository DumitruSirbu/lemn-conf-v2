import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMailSender,
  FAKE_SENDER_WARNING,
} from "@/lib/server/mail/create-mail-sender";
import type { MailEnvironment } from "@/lib/server/mail/mail-configuration";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

import {
  forbidFetch,
  forbidNetwork,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
  releaseNetwork,
  sourceFilesMatching,
} from "./mail-test-support";

// The factory builds the real adapter, whose default transport is the library's own `createTransport`, so the library is
// scripted here: no test below reaches a socket, and the network guard proves it.
const { createTransportMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
}));
vi.mock("nodemailer", () => ({ createTransport: createTransportMock }));

const FAKE_PASSWORD = "ZxQ8vK3pWmRt5Yn2";
const FAKE_SENDER = "orders@mail.example.com";
const FAKE_INBOX = "inbox@example.com";

const PROVIDER_ENVIRONMENT: MailEnvironment = {
  GOOGLE_EMAIL: FAKE_SENDER,
  GOOGLE_APP_PASSWORD: FAKE_PASSWORD,
  LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
};
const FAKE_ENVIRONMENT: MailEnvironment = { LEMNARIA_E2E_FAKE_MAIL: "1" };

const MESSAGE: MailMessage = { key: "k/1", subject: "subject", text: "text" };

const LOG_METHODS = ["debug", "error", "info", "log", "trace", "warn"] as const;

function spyOnConsole() {
  return Object.fromEntries(
    LOG_METHODS.map((method) => [
      method,
      vi.spyOn(console, method).mockImplementation(() => undefined),
    ]),
  ) as Record<(typeof LOG_METHODS)[number], ReturnType<typeof vi.spyOn>>;
}

function everyWayOfReading(value: unknown): string {
  return [
    JSON.stringify(value),
    inspect(value, { depth: null, showHidden: true, showProxy: true }),
    Reflect.ownKeys(value as object)
      .map(String)
      .join(","),
  ].join("\n");
}

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

interface ScriptedTransport {
  readonly sendMail: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
}

/** Hands the next `createTransport` a transport whose `sendMail` does what the test says. */
function scriptTransport(sendMail: () => Promise<unknown>): ScriptedTransport {
  const transport = { sendMail: vi.fn(sendMail), close: vi.fn() };
  createTransportMock.mockReturnValue(transport);
  return transport;
}

describe("createMailSender: the fake", () => {
  it("answers a sender that records and accepts, and reaches no network", async () => {
    spyOnConsole();
    const creation = createMailSender(FAKE_ENVIRONMENT);

    if (creation.kind !== "sender") throw new Error("expected a sender");
    await expect(creation.sender.send(MESSAGE)).resolves.toEqual({ ok: true });
  });

  it("hands back `send` alone, so what the fake holds is out of reach of whatever holds the sender", () => {
    spyOnConsole();
    const creation = createMailSender(FAKE_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    expect(Reflect.ownKeys(creation.sender)).toEqual(["send"]);
    expect(Reflect.has(creation.sender, "sent")).toBe(false);
  });

  it("warns once with the one fixed line, and writes nothing else", () => {
    const console_ = spyOnConsole();

    createMailSender(FAKE_ENVIRONMENT);

    expect(console_.warn).toHaveBeenCalledTimes(1);
    expect(console_.warn).toHaveBeenCalledWith(FAKE_SENDER_WARNING);
    expect(FAKE_SENDER_WARNING).toBe(
      "mail: the fake sender is in use (LEMNARIA_E2E_FAKE_MAIL); no message leaves this server",
    );
    for (const method of LOG_METHODS.filter((name) => name !== "warn")) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });
});

describe("createMailSender: the provider", () => {
  it("answers a sender that signs in as the configured account with its app password and sends to the one inbox", async () => {
    const console_ = spyOnConsole();
    const transport = scriptTransport(() =>
      Promise.resolve({ accepted: [FAKE_INBOX], rejected: [] }),
    );
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(MESSAGE);

    expect(outcome).toEqual({ ok: true });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock.mock.calls[0]?.[0]).toMatchObject({
      auth: { user: FAKE_SENDER, pass: FAKE_PASSWORD },
    });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(transport.sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: FAKE_SENDER,
      to: FAKE_INBOX,
    });
    expect(transport.close).toHaveBeenCalledTimes(1);
    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });

  it("builds no transport until a message is sent, so building the sender holds no connection", () => {
    spyOnConsole();

    createMailSender(PROVIDER_ENVIRONMENT);

    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("logs nothing when a send fails", async () => {
    const console_ = spyOnConsole();
    scriptTransport(() => Promise.reject(new Error(FAKE_PASSWORD)));
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    await creation.sender.send(MESSAGE);

    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });

  it("holds the password nowhere a reader can reach: not in what it returns, not in any outcome", async () => {
    spyOnConsole();
    scriptTransport(() =>
      Promise.reject(new TypeError(`failed with ${FAKE_PASSWORD}`)),
    );
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(MESSAGE);

    for (const value of [creation, creation.sender, outcome]) {
      for (const secret of [FAKE_PASSWORD, FAKE_SENDER, FAKE_INBOX]) {
        expect(everyWayOfReading(value)).not.toContain(secret);
      }
    }
    expect(Reflect.ownKeys(creation.sender)).toEqual(["send"]);
  });
});

describe("createMailSender: unavailable", () => {
  it("names what is missing, writes no line, and builds no sender", () => {
    const console_ = spyOnConsole();

    const creation = createMailSender({ GOOGLE_EMAIL: FAKE_SENDER });

    expect(creation).toEqual({
      kind: "unavailable",
      variables: ["GOOGLE_APP_PASSWORD", "LEAD_NOTIFICATION_ADDRESS"],
    });
    expect(everyWayOfReading(creation)).not.toContain(FAKE_SENDER);
    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });

  it("reads a sender address the adapter would refuse unsent as unavailable, and builds no sender", () => {
    spyOnConsole();

    const creation = createMailSender({
      ...PROVIDER_ENVIRONMENT,
      GOOGLE_EMAIL: "orders@mail.123",
    });

    expect(creation).toEqual({
      kind: "unavailable",
      variables: ["GOOGLE_EMAIL"],
    });
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("names the flag, and builds neither the fake nor the provider, when both are asked for", () => {
    const console_ = spyOnConsole();

    const creation = createMailSender({
      ...PROVIDER_ENVIRONMENT,
      ...FAKE_ENVIRONMENT,
    });

    expect(creation).toEqual({
      kind: "unavailable",
      variables: ["LEMNARIA_E2E_FAKE_MAIL"],
    });
    expect(console_.warn).not.toHaveBeenCalled();
  });
});

describe("create-mail-sender.ts", () => {
  const source = readMailModuleSource("create-mail-sender.ts");

  it("reads source: names neither the process environment nor the build mode", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
  });

  it("reads source: writes exactly one line, as a warning", () => {
    expect(source.match(/\bconsole\./g)).toEqual(["console."]);
    expect(source).toContain("console.warn(");
  });
});

describe("the other mail modules", () => {
  it.each([
    "mail-sender.ts",
    "mail-configuration.ts",
    "fake-mail-sender.ts",
    "select-mail-sender.ts",
    "gmail-mail-sender.ts",
    "smtp-mail-sender.ts",
    "smtp-transport.ts",
    "smtp-answer.ts",
    "plain-mailbox.ts",
    "lead-notification.ts",
  ])("reads source: %s writes no log line", (name) => {
    expect(readMailModuleSource(name)).not.toMatch(/\bconsole\b/);
  });
});

interface NamingRule {
  readonly what: string;
  readonly pattern: RegExp;
  readonly isAllowed: (path: string) => boolean;
  /** The one file that must be found naming it: proof that the scan can see what it fences. */
  readonly mustBeFoundIn: string;
  readonly mentions: readonly string[];
}

const MAIL_DIRECTORY = "lib/server/mail/";
const FACTORY = `${MAIL_DIRECTORY}create-mail-sender.ts`;
const CUSTOMER_FACTORY = `${MAIL_DIRECTORY}create-customer-mail-sender.ts`;
const SENDER_FACTORIES = [FACTORY, CUSTOMER_FACTORY];
const GMAIL_ADAPTER = `${MAIL_DIRECTORY}gmail-mail-sender.ts`;
const SMTP_ADAPTER = `${MAIL_DIRECTORY}smtp-mail-sender.ts`;

function mayImportTheMailLibrary(path: string): boolean {
  return [GMAIL_ADAPTER, SMTP_ADAPTER].includes(path);
}

const NAMING_RULES: readonly NamingRule[] = [
  {
    what: "the fake",
    pattern: /fake-mail-sender|createFake(Customer)?MailSender/,
    isAllowed: (path) =>
      [`${MAIL_DIRECTORY}fake-mail-sender.ts`, ...SENDER_FACTORIES].includes(
        path,
      ),
    mustBeFoundIn: FACTORY,
    mentions: [
      'import { x } from "@/lib/server/mail/fake-mail-sender";',
      "export * from './fake-mail-sender';",
      'const m = await import("./fake-mail-sender");',
      "const sender = createFakeMailSender();",
      "const sender = createFakeCustomerMailSender();",
    ],
  },
  {
    what: "the adapter",
    pattern: /gmail-mail-sender|createGmail(Customer)?MailSender/,
    isAllowed: (path) => [GMAIL_ADAPTER, ...SENDER_FACTORIES].includes(path),
    mustBeFoundIn: FACTORY,
    mentions: [
      'import { x } from "@/lib/server/mail/gmail-mail-sender";',
      "const sender = createGmailMailSender(configuration);",
      "const sender = createGmailCustomerMailSender(configuration);",
    ],
  },
  {
    what: "the mail library",
    pattern:
      /from\s+["']nodemailer["']|import\(\s*["']nodemailer["']|require\(\s*["']nodemailer["']/,
    isAllowed: mayImportTheMailLibrary,
    mustBeFoundIn: GMAIL_ADAPTER,
    mentions: [
      'import { createTransport } from "nodemailer";',
      "import nodemailer from 'nodemailer';",
      'const m = await import("nodemailer");',
      'const m = require("nodemailer");',
    ],
  },
  {
    what: "the configuration reader",
    pattern: /readMailConfiguration/,
    isAllowed: (path) => path.startsWith(MAIL_DIRECTORY),
    mustBeFoundIn: FACTORY,
    mentions: [
      'import { readMailConfiguration } from "@/lib/server/mail/mail-configuration";',
      "const read = readMailConfiguration;",
    ],
  },
];

describe.each(NAMING_RULES)(
  "reads every source file for $what",
  ({ pattern, isAllowed, mustBeFoundIn, mentions }) => {
    it.each(mentions)("recognises it in %s", (mention) => {
      expect(pattern.test(mention)).toBe(true);
    });

    it("finds nothing under apps/web/src in a file that may not name it", () => {
      const namers = sourceFilesMatching(pattern);

      expect(namers).toContain(mustBeFoundIn);
      expect(namers.filter((path) => !isAllowed(path))).toEqual([]);
    });
  },
);

describe("the mail-library fence", () => {
  it.each([
    FACTORY,
    `${MAIL_DIRECTORY}smtp-transport.ts`,
    `${MAIL_DIRECTORY}select-mail-sender.ts`,
    `${MAIL_DIRECTORY}create-customer-mail-sender.ts`,
  ])("control: still refuses %s", (path) => {
    expect(mayImportTheMailLibrary(path)).toBe(false);
  });
});

describe("the previous provider", () => {
  const PROVIDER_CODE =
    /resend-mail-sender|createResendMailSender|buildResendRequest|api\.resend\.com|Idempotency-Key/;
  const RETIRED_NAMES = /RESEND_API_KEY|MAIL_FROM_ADDRESS/;
  const RETIRED_LIST = `${MAIL_DIRECTORY}mail-configuration.ts`;

  it.each([
    'import { x } from "@/lib/server/mail/resend-mail-sender";',
    "createResendMailSender(configuration)",
    'fetch("https://api.resend.com/emails")',
    'headers: { "Idempotency-Key": key }',
  ])("recognises its code in %s", (mention) => {
    expect(PROVIDER_CODE.test(mention)).toBe(true);
  });

  it("leaves no module, call, host or header of its under apps/web/src", () => {
    expect(sourceFilesMatching(PROVIDER_CODE)).toEqual([]);
  });

  it("leaves its two variable names only in the retired list", () => {
    const namers = sourceFilesMatching(RETIRED_NAMES);

    expect(namers).toEqual([RETIRED_LIST]);
  });
});
