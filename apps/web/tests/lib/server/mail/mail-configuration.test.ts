import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  MAIL_API_KEY_VARIABLE,
  MAIL_FROM_ADDRESS_VARIABLE,
  MAIL_VARIABLE_NAMES,
  readMailConfiguration,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";

import {
  forbidFetch,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
} from "./mail-test-support";

const FAKE_KEY = "re_FAKEKEY_0123456789";
const FAKE_FROM = "orders@mail.example.com";
const FAKE_INBOX = "inbox@example.com";

const VALID_ENVIRONMENT: MailEnvironment = {
  [MAIL_API_KEY_VARIABLE]: FAKE_KEY,
  [MAIL_FROM_ADDRESS_VARIABLE]: FAKE_FROM,
  [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: FAKE_INBOX,
};

function withVariable(name: string, value: string | undefined) {
  return { ...VALID_ENVIRONMENT, [name]: value };
}

beforeEach(forbidFetch);
afterEach(releaseFetch);

describe("readMailConfiguration", () => {
  it("answers configured with the three values when all are usable", () => {
    expect(readMailConfiguration(VALID_ENVIRONMENT)).toEqual({
      status: "configured",
      configuration: {
        apiKey: FAKE_KEY,
        fromAddress: FAKE_FROM,
        notificationAddress: FAKE_INBOX,
      },
    });
  });

  it("names all three variables, in a fixed order, when the environment is empty", () => {
    expect(readMailConfiguration({})).toEqual({
      status: "unavailable",
      variables: [
        "RESEND_API_KEY",
        "MAIL_FROM_ADDRESS",
        "LEAD_NOTIFICATION_ADDRESS",
      ],
    });
  });

  it.each(MAIL_VARIABLE_NAMES)(
    "names only %s when only that one is unset",
    (name) => {
      expect(readMailConfiguration(withVariable(name, undefined))).toEqual({
        status: "unavailable",
        variables: [name],
      });
    },
  );

  it("names every unusable variable and leaves out the usable one", () => {
    const environment = withVariable(MAIL_API_KEY_VARIABLE, "has space");
    const result = readMailConfiguration({
      ...environment,
      [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: "",
    });

    expect(result).toEqual({
      status: "unavailable",
      variables: [MAIL_API_KEY_VARIABLE, LEAD_NOTIFICATION_ADDRESS_VARIABLE],
    });
  });

  it("reads no variable an object inherits", () => {
    const inherited = Object.create(VALID_ENVIRONMENT) as MailEnvironment;

    expect(readMailConfiguration(inherited)).toEqual({
      status: "unavailable",
      variables: [...MAIL_VARIABLE_NAMES],
    });
  });

  it("ignores the process environment and reads only the one handed in", () => {
    vi.stubEnv(MAIL_API_KEY_VARIABLE, FAKE_KEY);
    vi.stubEnv(MAIL_FROM_ADDRESS_VARIABLE, FAKE_FROM);
    vi.stubEnv(LEAD_NOTIFICATION_ADDRESS_VARIABLE, FAKE_INBOX);

    try {
      expect(readMailConfiguration({}).status).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("a key the reader calls usable", () => {
  function statusForKey(value: string) {
    return readMailConfiguration(withVariable(MAIL_API_KEY_VARIABLE, value))
      .status;
  }

  it.each([
    ["empty", ""],
    ["a space", " "],
    ["a leading space", " re_key"],
    ["a trailing space", "re_key "],
    ["an inner space", "re key"],
    ["a line feed", "re_key\n"],
    ["a carriage return", "re_key\r"],
    ["a tab", "re_\tkey"],
    ["a NUL", "re_key\u0000"],
    ["DEL", "re_key\u007f"],
    ["a non-ASCII letter", "re_kéy"],
    ["a non-Latin letter", "re_ключ"],
    ["a zero-width space", "re_​key"],
    ["a line separator", "re_key "],
  ])("refuses %s", (_label, value) => {
    expect(statusForKey(value)).toBe("unavailable");
  });

  it("accepts exactly the visible ASCII characters, across the whole 16-bit range", () => {
    const wronglyDecided: number[] = [];
    for (let code = 0; code <= 0xffff; code += 1) {
      const isVisibleAscii = code >= 0x21 && code <= 0x7e;
      const isUsable =
        statusForKey(`k${String.fromCharCode(code)}k`) === "configured";
      if (isUsable !== isVisibleAscii) wronglyDecided.push(code);
    }

    expect(wronglyDecided).toEqual([]);
  });
});

describe("an address the reader calls usable", () => {
  function statusForAddress(name: string, value: string) {
    return readMailConfiguration(withVariable(name, value)).status;
  }

  const ADDRESS_VARIABLES = [
    MAIL_FROM_ADDRESS_VARIABLE,
    LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  ];

  describe.each(ADDRESS_VARIABLES)("in %s", (name) => {
    it.each([
      ["a plain address", "shop@example.com"],
      ["a plus tag", "shop+leads@example.com"],
      ["no dot in the domain", "shop@localhost"],
    ])("accepts %s", (_label, value) => {
      expect(statusForAddress(name, value)).toBe("configured");
    });

    it.each([
      ["empty", ""],
      ["no @", "shop.example.com"],
      ["no local part", "@example.com"],
      ["no domain", "shop@"],
      ["two @", "shop@@example.com"],
      ["an @ in the local part", "a@b@example.com"],
      ["a space", "sho p@example.com"],
      ["two addresses by comma", "a@example.com,b@example.com"],
      ["two addresses by comma and space", "a@example.com, b@example.com"],
      ["two addresses by semicolon", "a@example.com;b@example.com"],
      ["a display name in angle brackets", "Shop <shop@example.com>"],
      ["angle brackets alone", "<shop@example.com>"],
      ["a line feed and a header", "a@example.com\nBcc: b@example.com"],
      ["a carriage return and a header", "a@example.com\r\nBcc: b@example.com"],
      ["a tab", "a@exam\tple.com"],
      ["a NUL", "a@example.com\u0000"],
      ["a line separator", "a@example.com "],
      ["a zero-width space", "a@exam​ple.com"],
      ["a bidi override", "a@‮example.com"],
      ["a lone surrogate", "a@exam\ud800ple.com"],
    ])("refuses %s", (_label, value) => {
      expect(statusForAddress(name, value)).toBe("unavailable");
    });

    it("decides every ASCII character in the local part as the rule says", () => {
      const refusedByRule = new Set("@,;<>");
      const wronglyDecided: number[] = [];
      for (let code = 0; code <= 0x7f; code += 1) {
        const character = String.fromCharCode(code);
        const isVisible = code >= 0x21 && code <= 0x7e;
        const expectedUsable = isVisible && !refusedByRule.has(character);
        const isUsable =
          statusForAddress(name, `a${character}b@example.com`) === "configured";
        if (isUsable !== expectedUsable) wronglyDecided.push(code);
      }

      expect(wronglyDecided).toEqual([]);
    });
  });
});

describe("what an unavailable answer and the reader's failures disclose", () => {
  const MARKER = "SECRET-MARKER-7f3a";
  const UNUSABLE_VALUES = [
    `${MARKER} with spaces`,
    `${MARKER}@example.com, other@example.com`,
    `${MARKER}\r\n`,
    `${MARKER}\u0000`,
  ];

  it.each(UNUSABLE_VALUES)(
    "holds no part of the rejected value %j in any variable",
    (value) => {
      const results = MAIL_VARIABLE_NAMES.map((name) =>
        readMailConfiguration(withVariable(name, value)),
      );

      expect(JSON.stringify(results)).not.toContain(MARKER);
      expect(results.every((result) => result.status === "unavailable")).toBe(
        true,
      );
    },
  );

  it("answers rather than throws for a value that is not a string", () => {
    const environment = {
      [MAIL_API_KEY_VARIABLE]: { toString: () => MARKER },
      [MAIL_FROM_ADDRESS_VARIABLE]: 42,
      [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: null,
    } as unknown as MailEnvironment;

    const result = readMailConfiguration(environment);

    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain(MARKER);
  });
});

describe("mail-configuration.ts", () => {
  it("reads the key's pattern from the port and spells none of its own", () => {
    expect(readMailModuleSource("mail-configuration.ts")).not.toMatch(
      /\\x21|\\x7e/,
    );
  });

  it("names neither the process environment nor the build mode", () => {
    expect(readMailModuleSource("mail-configuration.ts")).not.toMatch(
      PROCESS_ENV_OR_BUILD_MODE,
    );
  });
});

describe(".env.example", () => {
  const exampleLines = readFileSync(
    join(import.meta.dirname, "../../../../../../.env.example"),
    "utf8",
  ).split("\n");

  it.each(MAIL_VARIABLE_NAMES)("names %s with no value", (name) => {
    const declarations = exampleLines.filter((line) =>
      line.replace(/^#\s*/, "").startsWith(`${name}=`),
    );

    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.replace(/^#\s*/, "")).toBe(`${name}=`);
  });
});
