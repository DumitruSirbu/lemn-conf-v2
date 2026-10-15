// Case 3 of the plan's QA section: the configuration as an attacker who can set an environment variable would set
// it. Each hostile value of each of the three names makes the whole answer unavailable, naming that one name and
// holding no value, and none reaches a transport: the factory builds no sender and the library is never asked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import {
  GOOGLE_APP_PASSWORD_VARIABLE,
  GOOGLE_EMAIL_VARIABLE,
  LEAD_NOTIFICATION_ADDRESS_VARIABLE,
  MAIL_VARIABLE_NAMES,
  readMailConfiguration,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";
import { selectMailSender } from "@/lib/server/mail/select-mail-sender";

import { forbidNetwork, releaseNetwork } from "./mail-test-support";
import {
  everyReadingOf,
  FAKE_APP_PASSWORD,
  FAKE_INBOX,
  FAKE_SENDER,
  QA_MESSAGE,
  silenceEveryConsoleMethod,
} from "./qa-8j-support";

const { createTransportMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
}));
vi.mock("nodemailer", () => ({ createTransport: createTransportMock }));

const USABLE: Readonly<Record<string, string>> = {
  [GOOGLE_EMAIL_VARIABLE]: FAKE_SENDER,
  [GOOGLE_APP_PASSWORD_VARIABLE]: FAKE_APP_PASSWORD,
  [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: FAKE_INBOX,
};

beforeEach(() => {
  createTransportMock.mockReset();
  forbidNetwork();
});
afterEach(() => {
  vi.restoreAllMocks();
  releaseNetwork();
});

const MORE_THAN_ONE_ADDRESS = [
  "a@b.example, c@d.example",
  "a@b.example,c@d.example",
  "a@b.example\r\nBcc: c@d.example",
  "a@b.example\nBcc: c@d.example",
  '"a@b.example" <c@d.example>',
  "a@b.example <c@d.example>",
  "a@b.example;c@d.example",
  "a@b.example c@d.example",
  "a@b.example c@d.example",
  "a@b.example c@d.example",
  "a@b.example\u0085c@d.example",
  "a@b.example\0c@d.example",
  "a@b.example\tc@d.example",
  "a@b.example\n",
  " a@b.example",
  "a@b.example ",
  "a@b.example﻿",
  "<a@b.example>",
  "Name <a@b.example>",
  "a@b.example (comment)",
  "(c)a@b.example",
  "a@b@c.example",
  "@b.example",
  "a@",
  "@",
  "",
  "a",
];

const BAD_DOMAIN_PART = [
  'a@b"c',
  "a@(x)",
  "a@[1.2.3.4]",
  "a@b\\c",
  "a@b/c",
  "a@b.example>",
  "a@b'c.example",
  "a@b_c.example",
  "a@b.example.",
  "a@.b.example",
  "a@b..example",
];

const BAD_PASSWORDS = [
  "",
  " ",
  "abcd efgh ijkl mnop",
  "abcdefghijklmnop ",
  " abcdefghijklmnop",
  "abcd\tefgh",
  "abcdefghijklmnop\n",
  "abcdefghijklmnop\r\n",
  "abcdefghijklmnop\0",
  "abcdefghijklmnop ",
  "abcdéfghijklmnop",
  "пароль",
  "abcdefghijklmnop ",
  "\u007f",
];

const ATTACKS: readonly [string, readonly string[]][] = [
  [GOOGLE_EMAIL_VARIABLE, [...MORE_THAN_ONE_ADDRESS, ...BAD_DOMAIN_PART]],
  [
    LEAD_NOTIFICATION_ADDRESS_VARIABLE,
    [...MORE_THAN_ONE_ADDRESS, ...BAD_DOMAIN_PART],
  ],
  [GOOGLE_APP_PASSWORD_VARIABLE, BAD_PASSWORDS],
];

describe("a hostile value in one of the three names", () => {
  it.each(ATTACKS)(
    "makes %s alone unavailable, in the reader, the selection and the factory, with no value in any answer and no transport",
    (name, values) => {
      silenceEveryConsoleMethod();
      const wrong: string[] = [];
      for (const value of values) {
        const environment: MailEnvironment = { ...USABLE, [name]: value };

        const read = readMailConfiguration(environment);
        const selection = selectMailSender(environment);
        const creation = createMailSender(environment);

        const expected = { kind: "unavailable", variables: [name] };
        const answers = JSON.stringify([
          [read.status, "variables" in read ? read.variables : []],
          selection,
          creation,
        ]);
        const reference = JSON.stringify([
          ["unavailable", [name]],
          expected,
          expected,
        ]);
        const holdsTheValue =
          value.length >= 4 &&
          everyReadingOf([read, selection, creation]).includes(value);
        if (answers !== reference || holdsTheValue)
          wrong.push(`${name}: ${JSON.stringify(value)}`);
      }

      expect(wrong).toEqual([]);
      expect(createTransportMock).not.toHaveBeenCalled();
    },
  );

  it("makes every name unavailable at once when each holds a hostile value, naming the three in their order", () => {
    const environment: MailEnvironment = {
      [GOOGLE_EMAIL_VARIABLE]: "a@b.example, c@d.example",
      [GOOGLE_APP_PASSWORD_VARIABLE]: "has space",
      [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: "a@b.example\r\nBcc: c@d.example",
    };

    expect(readMailConfiguration(environment)).toEqual({
      status: "unavailable",
      variables: [...MAIL_VARIABLE_NAMES],
    });
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("is never a sender that has been made and asked to send: a hostile value leaves nothing to call", async () => {
    silenceEveryConsoleMethod();
    const asked: unknown[] = [];

    for (const [name, values] of ATTACKS) {
      for (const value of values) {
        const creation = createMailSender({ ...USABLE, [name]: value });
        if (creation.kind === "sender") {
          asked.push(await creation.sender.send(QA_MESSAGE));
        }
      }
    }

    expect(asked).toEqual([]);
    expect(createTransportMock).not.toHaveBeenCalled();
  });
});

describe("an environment that cannot be read as a plain record", () => {
  function environmentWhose(name: string): MailEnvironment {
    return Object.defineProperty({ ...USABLE }, name, {
      enumerable: true,
      get(): never {
        throw new Error(`the environment refused ${FAKE_APP_PASSWORD}`);
      },
    });
  }

  it.each(MAIL_VARIABLE_NAMES)(
    "a getter that throws for %s never yields a configured answer, a provider or a sender",
    (name) => {
      silenceEveryConsoleMethod();
      const environment = environmentWhose(name);
      const answers: unknown[] = [];
      for (const ask of [
        readMailConfiguration,
        selectMailSender,
        createMailSender,
      ]) {
        try {
          answers.push(ask(environment));
        } catch (thrown) {
          answers.push({ thrown: String(thrown) });
        }
      }

      for (const answer of answers) {
        expect(answer).not.toMatchObject({ status: "configured" });
        expect(answer).not.toMatchObject({ kind: "provider" });
        expect(answer).not.toMatchObject({ kind: "sender" });
      }
      expect(createTransportMock).not.toHaveBeenCalled();
    },
  );

  it("a non-string value of any type is unusable, whatever it prints as", () => {
    const NOT_TEXT = [
      42,
      true,
      null,
      Symbol("x"),
      [FAKE_INBOX],
      { toString: () => FAKE_INBOX },
      new String(FAKE_INBOX),
      () => FAKE_INBOX,
    ];

    for (const value of NOT_TEXT) {
      const environment = {
        ...USABLE,
        [LEAD_NOTIFICATION_ADDRESS_VARIABLE]: value,
      } as unknown as MailEnvironment;

      expect(readMailConfiguration(environment)).toEqual({
        status: "unavailable",
        variables: [LEAD_NOTIFICATION_ADDRESS_VARIABLE],
      });
    }
  });

  it("reads a member of the prototype chain as unset, for each name, even beside a usable pair", () => {
    for (const name of MAIL_VARIABLE_NAMES) {
      const environment = Object.create({ [name]: USABLE[name] }) as Record<
        string,
        string
      >;
      for (const other of MAIL_VARIABLE_NAMES.filter((n) => n !== name)) {
        environment[other] = USABLE[other] ?? "";
      }

      expect(readMailConfiguration(environment)).toEqual({
        status: "unavailable",
        variables: [name],
      });
    }
  });
});
