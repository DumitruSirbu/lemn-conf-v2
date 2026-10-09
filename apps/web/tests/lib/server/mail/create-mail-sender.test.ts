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
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
  sourceFilesMatching,
} from "./mail-test-support";

const FAKE_KEY = "re_FAKEKEY_0123456789";
const FAKE_FROM = "orders@mail.example.com";
const FAKE_INBOX = "inbox@example.com";

const PROVIDER_ENVIRONMENT: MailEnvironment = {
  RESEND_API_KEY: FAKE_KEY,
  MAIL_FROM_ADDRESS: FAKE_FROM,
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

beforeEach(forbidFetch);
afterEach(() => {
  vi.restoreAllMocks();
  releaseFetch();
});

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
  it("answers a sender that authorises its request with the configured key", async () => {
    const console_ = spyOnConsole();
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        body: new Response(JSON.stringify({ id: "msg_1" })).body,
      } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(MESSAGE);

    expect(outcome).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = (
      fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${FAKE_KEY}`,
    );
    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });

  it("logs nothing when a send fails", async () => {
    const console_ = spyOnConsole();
    vi.stubGlobal("fetch", () => Promise.reject(new Error(FAKE_KEY)));
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    await creation.sender.send(MESSAGE);

    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
  });

  it("holds the key nowhere a reader can reach: not in what it returns, not in any outcome", async () => {
    spyOnConsole();
    vi.stubGlobal("fetch", () =>
      Promise.reject(new TypeError(`failed with ${FAKE_KEY}`)),
    );
    const creation = createMailSender(PROVIDER_ENVIRONMENT);
    if (creation.kind !== "sender") throw new Error("expected a sender");

    const outcome = await creation.sender.send(MESSAGE);

    for (const value of [creation, creation.sender, outcome]) {
      for (const secret of [FAKE_KEY, FAKE_FROM, FAKE_INBOX]) {
        expect(everyWayOfReading(value)).not.toContain(secret);
      }
    }
    expect(Reflect.ownKeys(creation.sender)).toEqual(["send"]);
  });
});

describe("createMailSender: unavailable", () => {
  it("names what is missing, writes no line, and builds no sender", () => {
    const console_ = spyOnConsole();

    const creation = createMailSender({ RESEND_API_KEY: FAKE_KEY });

    expect(creation).toEqual({
      kind: "unavailable",
      variables: ["MAIL_FROM_ADDRESS", "LEAD_NOTIFICATION_ADDRESS"],
    });
    expect(everyWayOfReading(creation)).not.toContain(FAKE_KEY);
    for (const method of LOG_METHODS) {
      expect(console_[method]).not.toHaveBeenCalled();
    }
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
    "resend-mail-sender.ts",
    "lead-notification.ts",
  ])("reads source: %s writes no log line", (name) => {
    expect(readMailModuleSource(name)).not.toMatch(/\bconsole\b/);
  });
});

interface NamingRule {
  readonly what: string;
  readonly pattern: RegExp;
  readonly isAllowed: (path: string) => boolean;
  readonly mentions: readonly string[];
}

const MAIL_DIRECTORY = "lib/server/mail/";
const FACTORY = `${MAIL_DIRECTORY}create-mail-sender.ts`;

const NAMING_RULES: readonly NamingRule[] = [
  {
    what: "the fake",
    pattern: /fake-mail-sender|createFakeMailSender/,
    isAllowed: (path) =>
      [`${MAIL_DIRECTORY}fake-mail-sender.ts`, FACTORY].includes(path),
    mentions: [
      'import { x } from "@/lib/server/mail/fake-mail-sender";',
      "export * from './fake-mail-sender';",
      'const m = await import("./fake-mail-sender");',
      "const sender = createFakeMailSender();",
    ],
  },
  {
    what: "the adapter",
    pattern: /resend-mail-sender|createResendMailSender/,
    isAllowed: (path) =>
      [`${MAIL_DIRECTORY}resend-mail-sender.ts`, FACTORY].includes(path),
    mentions: [
      'import { x } from "@/lib/server/mail/resend-mail-sender";',
      "const sender = createResendMailSender(configuration);",
    ],
  },
  {
    what: "the configuration reader",
    pattern: /readMailConfiguration/,
    isAllowed: (path) => path.startsWith(MAIL_DIRECTORY),
    mentions: [
      'import { readMailConfiguration } from "@/lib/server/mail/mail-configuration";',
      "const read = readMailConfiguration;",
    ],
  },
];

describe.each(NAMING_RULES)(
  "reads every source file for $what",
  ({ pattern, isAllowed, mentions }) => {
    it.each(mentions)("recognises it in %s", (mention) => {
      expect(pattern.test(mention)).toBe(true);
    });

    it("finds nothing under apps/web/src in a file that may not name it", () => {
      const namers = sourceFilesMatching(pattern);

      expect(namers).toContain(FACTORY);
      expect(namers.filter((path) => !isAllowed(path))).toEqual([]);
    });
  },
);
