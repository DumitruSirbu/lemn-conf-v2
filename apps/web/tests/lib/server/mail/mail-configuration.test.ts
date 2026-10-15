import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGmailMessage,
  UnusableMailAddressError,
} from "@/lib/server/mail/gmail-mail-sender";
import {
  GOOGLE_APP_PASSWORD_VARIABLE,
  GOOGLE_EMAIL_VARIABLE,
  LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  MAIL_VARIABLE_NAMES,
  readMailConfiguration,
  RETIRED_MAIL_VARIABLE_NAMES,
  type MailEnvironment,
  type MailVariableName,
} from "@/lib/server/mail/mail-configuration";

import {
  forbidFetch,
  forbidNetwork,
  NOT_ONE_PLAIN_MAILBOX,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
  releaseNetwork,
  spyOnEveryConsoleMethod,
  consoleCallsOf,
} from "./mail-test-support";

const FAKE_PASSWORD = "ZxQ8vK3pWmRt5Yn2";
const FAKE_SENDER = "zq7x9k.sender@marker-host.example";
const FAKE_INBOX = "inbox.k4w8@shop-marker.example";

const VALID_ENVIRONMENT: MailEnvironment = {
  [GOOGLE_EMAIL_VARIABLE]: FAKE_SENDER,
  [GOOGLE_APP_PASSWORD_VARIABLE]: FAKE_PASSWORD,
  [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: FAKE_INBOX,
};

function withVariable(name: string, value: string | undefined) {
  return { ...VALID_ENVIRONMENT, [name]: value };
}

beforeEach(() => {
  forbidFetch();
  forbidNetwork();
});
afterEach(() => {
  releaseFetch();
  releaseNetwork();
});

describe("readMailConfiguration", () => {
  it("answers configured with the three values when all are usable", () => {
    expect(readMailConfiguration(VALID_ENVIRONMENT)).toEqual({
      status: "configured",
      configuration: {
        senderAddress: FAKE_SENDER,
        appPassword: FAKE_PASSWORD,
        notificationAddress: FAKE_INBOX,
      },
    });
  });

  it("names all three variables, in a fixed order, when the environment is empty", () => {
    expect(readMailConfiguration({})).toEqual({
      status: "unavailable",
      variables: [
        "GOOGLE_EMAIL",
        "GOOGLE_APP_PASSWORD",
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
    const environment = withVariable(GOOGLE_APP_PASSWORD_VARIABLE, "has space");
    const result = readMailConfiguration({
      ...environment,
      [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: "",
    });

    expect(result).toEqual({
      status: "unavailable",
      variables: [
        GOOGLE_APP_PASSWORD_VARIABLE,
        LEAD_NOTIFICATION_ADDRESS_VARIABLE,
      ],
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
    vi.stubEnv(GOOGLE_EMAIL_VARIABLE, FAKE_SENDER);
    vi.stubEnv(GOOGLE_APP_PASSWORD_VARIABLE, FAKE_PASSWORD);
    vi.stubEnv(LEAD_NOTIFICATION_ADDRESS_VARIABLE, FAKE_INBOX);

    try {
      expect(readMailConfiguration({}).status).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("an app password the reader calls usable", () => {
  function statusForKey(value: string) {
    return readMailConfiguration(
      withVariable(GOOGLE_APP_PASSWORD_VARIABLE, value),
    ).status;
  }

  it.each([
    ["empty", ""],
    ["a space", " "],
    ["a leading space", " re_key"],
    ["a trailing space", "re_key "],
    ["an inner space", "re key"],
    ["Google's own display, four groups of four", "abcd efgh ijkl mnop"],
    ["a line feed", "re_key\n"],
    ["a carriage return", "re_key\r"],
    ["a tab", "re_\tkey"],
    ["a NUL", "re_key\u0000"],
    ["DEL", "re_key\u007f"],
    ["a non-ASCII letter", "re_kéy"],
    ["a non-Latin letter", "re_ключ"],
    ["a zero-width space", "re_\u200bkey"],
    ["a line separator", "re_key\u2028"],
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
    GOOGLE_EMAIL_VARIABLE,
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
      ["a line separator", "a@example.com\u2028"],
      ["a zero-width space", "a@exam\u200bple.com"],
      ["a bidi override", "a@\u202eexample.com"],
      ["a lone surrogate", "a@exam\ud800ple.com"],
    ])("refuses %s", (_label, value) => {
      expect(statusForAddress(name, value)).toBe("unavailable");
    });

    it("decides every ASCII character in the local part as the dot-atom rule says", () => {
      const dotAtomSpecials = new Set("!#$%&'*+/=?^_`{|}~-.");
      const wronglyDecided: number[] = [];
      for (let code = 0; code <= 0x7f; code += 1) {
        const character = String.fromCharCode(code);
        const isLetterOrDigit = /[A-Za-z0-9]/.test(character);
        const expectedUsable =
          isLetterOrDigit || dotAtomSpecials.has(character);
        const isUsable =
          statusForAddress(name, `a${character}b@example.com`) === "configured";
        if (isUsable !== expectedUsable) wronglyDecided.push(code);
      }

      expect(wronglyDecided).toEqual([]);
    });

    it.each(NOT_ONE_PLAIN_MAILBOX)(
      "refuses %j, which the adapter could not write as one plain mailbox",
      (value) => {
        expect(statusForAddress(name, value)).toBe("unavailable");
      },
    );
  });

  it.each([
    ["a quoted local part", '"a b"@example.com'],
    ["a domain ending in a number", "shop@example.123"],
    ["an address literal", "shop@[1.2.3.4]"],
    ["a quote in the domain", 'shop@exam"ple.com'],
    ["a parenthesis in the local part", "sh(op)@example.com"],
    ["a leading dot", ".shop@example.com"],
    ["two dots in a row", "sh..op@example.com"],
  ])(
    "refuses %s, which the older looser rule let through to be refused unsent",
    (_label, value) => {
      expect(statusForAddress(GOOGLE_EMAIL_VARIABLE, value)).toBe(
        "unavailable",
      );
    },
  );

  it.each([
    ...NOT_ONE_PLAIN_MAILBOX,
    "shop@example.com",
    "shop+leads@example.com",
    "shop@localhost",
    "shop@bücher.example",
    "a.b.c@d.e.example",
  ])(
    "agrees with the adapter on %j: configured exactly when the adapter builds a message with it",
    (value) => {
      const adapterBuilds = canBuildWithSender(value);

      expect(statusForAddress(GOOGLE_EMAIL_VARIABLE, value)).toBe(
        adapterBuilds ? "configured" : "unavailable",
      );
    },
  );
});

function canBuildWithSender(senderAddress: string): boolean {
  try {
    buildGmailMessage(
      { key: "k", subject: "s", text: "t" },
      {
        senderAddress,
        appPassword: FAKE_PASSWORD,
        notificationAddress: FAKE_INBOX,
      },
    );
    return true;
  } catch (thrown) {
    if (thrown instanceof UnusableMailAddressError) return false;
    throw thrown;
  }
}

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
      [GOOGLE_EMAIL_VARIABLE]: { toString: () => MARKER },
      [GOOGLE_APP_PASSWORD_VARIABLE]: 42,
      [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: null,
    } as unknown as MailEnvironment;

    const result = readMailConfiguration(environment);

    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain(MARKER);
  });
});

describe("retired names", () => {
  it("do not configure: the previous provider's names beside the inbox leave the two Google names missing", () => {
    expect(
      readMailConfiguration({
        RESEND_API_KEY: "re_FAKEKEY_0123456789",
        MAIL_FROM_ADDRESS: FAKE_SENDER,
        [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: FAKE_INBOX,
      }),
    ).toEqual({
      status: "unavailable",
      variables: [GOOGLE_EMAIL_VARIABLE, GOOGLE_APP_PASSWORD_VARIABLE],
    });
  });

  it("are exactly the two the plan names, apart from the live three", () => {
    expect([...RETIRED_MAIL_VARIABLE_NAMES]).toEqual([
      "RESEND_API_KEY",
      "MAIL_FROM_ADDRESS",
    ]);
    for (const name of RETIRED_MAIL_VARIABLE_NAMES) {
      expect(MAIL_VARIABLE_NAMES).not.toContain(name);
    }
  });
});

describe("every assignment of the three names to the eight ways a value can be", () => {
  const PLAIN_ADDRESS_VALUE = "arm.k7q@marker-arm.example";
  const PASSWORD_VALUE = "Zq7Rk2Wm9xPd";

  /** The eight arms. `absent` gives a name no own member at all; `usable` is name-specific. */
  const ARMS = [
    "absent",
    "own-undefined",
    "empty",
    "usable",
    "with-a-space",
    "trailing-newline",
    "two-addresses",
    "angle-brackets",
  ] as const;
  type Arm = (typeof ARMS)[number];

  function usableValueOf(name: string): string {
    return name === GOOGLE_APP_PASSWORD_VARIABLE
      ? PASSWORD_VALUE
      : PLAIN_ADDRESS_VALUE;
  }

  function valueOfArm(arm: Arm, name: string): string | undefined {
    const values: Record<Arm, string | undefined> = {
      absent: "absent",
      "own-undefined": undefined,
      empty: "",
      usable: usableValueOf(name),
      "with-a-space": `${usableValueOf(name).slice(0, 4)} ${usableValueOf(name).slice(4)}`,
      "trailing-newline": `${usableValueOf(name)}\n`,
      "two-addresses": "two.one@pair-host.example,two.two@pair-host.example",
      "angle-brackets": "<angle.one@bracket-host.example>",
    };
    return values[arm];
  }

  /**
   * Written out per name, not derived from the reader's rule. A password is any visible ASCII, so a pair of addresses
   * joined by a comma, and an address in angle brackets, are usable as one and not as an address.
   */
  function isUsable(arm: Arm, name: string): boolean {
    if (arm === "usable") return true;
    const isPassword = name === GOOGLE_APP_PASSWORD_VARIABLE;
    return isPassword && (arm === "two-addresses" || arm === "angle-brackets");
  }

  function environmentOf(
    arms: Readonly<Record<MailVariableName, Arm>>,
  ): MailEnvironment {
    const environment: Record<string, string | undefined> = {};
    for (const name of MAIL_VARIABLE_NAMES) {
      const value = valueOfArm(arms[name], name);
      if (value !== "absent") environment[name] = value;
    }
    return environment;
  }

  function everyAssignment(): Record<MailVariableName, Arm>[] {
    return ARMS.flatMap((first) =>
      ARMS.flatMap((second) =>
        ARMS.map((third) => ({
          [MAIL_VARIABLE_NAMES[0]]: first,
          [MAIL_VARIABLE_NAMES[1]]: second,
          [MAIL_VARIABLE_NAMES[2]]: third,
        })),
      ),
    );
  }

  function fourCharacterPiecesOf(value: string): string[] {
    return Array.from({ length: Math.max(0, value.length - 3) }, (_, start) =>
      value.slice(start, start + 4),
    );
  }

  it("answers configured exactly when all three are usable, and otherwise names exactly the unusable ones in order", () => {
    const wronglyAnswered: string[] = [];
    for (const arms of everyAssignment()) {
      const unusable = MAIL_VARIABLE_NAMES.filter(
        (name) => !isUsable(arms[name], name),
      );
      const result = readMailConfiguration(environmentOf(arms));
      const expected =
        unusable.length === 0
          ? "configured"
          : JSON.stringify({ status: "unavailable", variables: unusable });
      const actual =
        result.status === "configured" ? "configured" : JSON.stringify(result);
      if (actual !== expected) wronglyAnswered.push(JSON.stringify(arms));
    }

    expect(wronglyAnswered).toEqual([]);
  });

  it("meets every arm of every name, each many times, so no arm is covered by luck", () => {
    const met = new Map<string, number>();
    for (const arms of everyAssignment()) {
      for (const name of MAIL_VARIABLE_NAMES) {
        const key = `${name}:${arms[name]}`;
        met.set(key, (met.get(key) ?? 0) + 1);
      }
    }

    expect(met.size).toBe(MAIL_VARIABLE_NAMES.length * ARMS.length);
    expect(Math.min(...met.values())).toBe(ARMS.length ** 2);
  });

  it("copies no value, and no piece of one four characters long, into an unavailable answer, a throw or a console call", () => {
    const spies = spyOnEveryConsoleMethod();
    const leaked: string[] = [];
    try {
      for (const arms of everyAssignment()) {
        const environment = environmentOf(arms);
        const result = readMailConfiguration(environment);
        if (result.status === "configured") continue;
        const answer = JSON.stringify(result);
        const pieces = Object.values(environment).flatMap((value) =>
          fourCharacterPiecesOf(value ?? ""),
        );
        if (pieces.some((piece) => answer.includes(piece))) {
          leaked.push(JSON.stringify(arms));
        }
      }

      expect(leaked).toEqual([]);
      expect(consoleCallsOf(spies)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("mail-configuration.ts", () => {
  it("reads source: takes the key's pattern from the port and spells none of its own", () => {
    expect(readMailModuleSource("mail-configuration.ts")).not.toMatch(
      /\\x21|\\x7e/,
    );
  });

  it("reads source: names neither the process environment nor the build mode", () => {
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

  const declarationsOf = (name: string): string[] =>
    exampleLines.filter((line) =>
      line.replace(/^#\s*/, "").startsWith(`${name}=`),
    );

  const commentBlockAbove = (declaration: string): string => {
    const at = exampleLines.indexOf(declaration);
    const block: string[] = [];
    for (let i = at - 1; i >= 0 && exampleLines[i]?.startsWith("#"); i -= 1) {
      block.unshift(exampleLines[i] ?? "");
    }
    return block.join("\n");
  };

  it.each(MAIL_VARIABLE_NAMES)("names %s once, with no value", (name) => {
    expect(declarationsOf(name)).toEqual([`# ${name}=`]);
  });

  it.each(RETIRED_MAIL_VARIABLE_NAMES)(
    "keeps the retired %s once, commented, with no value, and says it is retired",
    (name) => {
      expect(declarationsOf(name)).toEqual([`# ${name}=`]);
      expect(commentBlockAbove(`# ${name}=`)).toMatch(/RETIRED/);
    },
  );

  it("defines no mail variable when copied: every declaration is a comment", () => {
    const everyName = [
      ...MAIL_VARIABLE_NAMES,
      ...RETIRED_MAIL_VARIABLE_NAMES,
      "LEMNARIA_E2E_FAKE_MAIL",
    ];

    const defined = exampleLines.filter((line) =>
      everyName.some((name) => line.startsWith(`${name}=`)),
    );

    expect(defined).toEqual([]);
  });

  it("tells the owner to paste the App password without spaces", () => {
    expect(commentBlockAbove(`# ${GOOGLE_APP_PASSWORD_VARIABLE}=`)).toMatch(
      /WITHOUT spaces/,
    );
  });

  it("states that the shop's address is one address and never a customer's", () => {
    expect(
      commentBlockAbove(`# ${LEAD_NOTIFICATION_ADDRESS_VARIABLE}=`),
    ).toMatch(/exactly one address, never a customer's/i);
  });

  it("keeps the fake's flag warning: test instrumentation, unset in the deployed application", () => {
    expect(commentBlockAbove("# LEMNARIA_E2E_FAKE_MAIL=")).toMatch(
      /Leave it UNSET in the deployed application/,
    );
  });

  it("asks for one plain address on an account with 2-Step Verification for the sender", () => {
    expect(commentBlockAbove(`# ${GOOGLE_EMAIL_VARIABLE}=`)).toMatch(
      /exactly one plain address[\s\S]*2-Step Verification/,
    );
  });
});
