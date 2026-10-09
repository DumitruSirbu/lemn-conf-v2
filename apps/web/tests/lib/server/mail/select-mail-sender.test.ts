import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailEnvironment } from "@/lib/server/mail/mail-configuration";
import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";

import {
  forbidFetch,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
} from "./mail-test-support";

const FAKE_KEY = "re_FAKEKEY_0123456789";
const FAKE_FROM = "orders@mail.example.com";
const FAKE_INBOX = "inbox@example.com";

const ALL_MAIL_VARIABLES: MailEnvironment = {
  RESEND_API_KEY: FAKE_KEY,
  MAIL_FROM_ADDRESS: FAKE_FROM,
  LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
};

const ALL_THREE_NAMES = [
  "RESEND_API_KEY",
  "MAIL_FROM_ADDRESS",
  "LEAD_NOTIFICATION_ADDRESS",
];

const PROVIDER_SELECTION = { kind: "provider" };

const FLAG_IS_UNAVAILABLE = {
  kind: "unavailable",
  variables: ["LEMNARIA_E2E_FAKE_MAIL"],
};

beforeEach(forbidFetch);
afterEach(releaseFetch);

describe("the flag", () => {
  it("is the name and value the e2e server will set, spelled out", () => {
    expect(FAKE_MAIL_FLAG).toBe("LEMNARIA_E2E_FAKE_MAIL");
    expect(FAKE_MAIL_FLAG_ENABLED).toBe("1");
  });
});

describe("selectMailSender: when the fake is chosen", () => {
  it("chooses the fake for the flag alone", () => {
    expect(selectMailSender({ [FAKE_MAIL_FLAG]: "1" })).toEqual({
      kind: "fake",
    });
  });

  it.each([
    ["true", "true"],
    ["TRUE", "TRUE"],
    ["01", "01"],
    ["a leading space", " 1"],
    ["a trailing space", "1 "],
    ["a trailing newline", "1\n"],
    ["0", "0"],
    ["empty", ""],
  ])("does not choose the fake for the flag written as %s", (_label, flag) => {
    expect(selectMailSender({ [FAKE_MAIL_FLAG]: flag })).toEqual({
      kind: "unavailable",
      variables: ALL_THREE_NAMES,
    });
  });

  it("does not choose the fake when the flag is unset", () => {
    expect(selectMailSender({})).toEqual({
      kind: "unavailable",
      variables: ALL_THREE_NAMES,
    });
  });
});

describe("selectMailSender: the flag beside a mail variable", () => {
  it.each(Object.keys(ALL_MAIL_VARIABLES))(
    "answers unavailable naming the flag when %s is also set",
    (name) => {
      const environment = {
        [FAKE_MAIL_FLAG]: "1",
        [name]: ALL_MAIL_VARIABLES[name],
      };

      expect(selectMailSender(environment)).toEqual(FLAG_IS_UNAVAILABLE);
    },
  );

  it.each(Object.keys(ALL_MAIL_VARIABLES))(
    "counts %s as present even when it is empty or unusable",
    (name) => {
      for (const value of ["", " ", "not usable"]) {
        const environment = { [FAKE_MAIL_FLAG]: "1", [name]: value };

        expect(selectMailSender(environment)).toEqual(FLAG_IS_UNAVAILABLE);
      }
    },
  );

  it("answers unavailable naming the flag, never the provider, when everything is configured", () => {
    const environment = { ...ALL_MAIL_VARIABLES, [FAKE_MAIL_FLAG]: "1" };

    expect(selectMailSender(environment)).toEqual(FLAG_IS_UNAVAILABLE);
  });

  it("ignores a flag that is not exactly 1 and reads the mail variables", () => {
    const environment = { ...ALL_MAIL_VARIABLES, [FAKE_MAIL_FLAG]: "true" };

    expect(selectMailSender(environment)).toEqual(PROVIDER_SELECTION);
  });
});

describe("selectMailSender: the provider", () => {
  it("is chosen when all three variables are usable", () => {
    expect(selectMailSender(ALL_MAIL_VARIABLES)).toEqual(PROVIDER_SELECTION);
  });

  it("carries nothing of the configuration: the answer is its kind alone, however it is inspected", () => {
    const answer = selectMailSender(ALL_MAIL_VARIABLES);
    const inspected = inspect(answer, {
      depth: null,
      showHidden: true,
      showProxy: true,
    });

    expect(Reflect.ownKeys(answer)).toEqual(["kind"]);
    for (const value of [FAKE_KEY, FAKE_FROM, FAKE_INBOX]) {
      expect(JSON.stringify(answer)).not.toContain(value);
      expect(inspected).not.toContain(value);
    }
  });

  it("is unavailable, naming what is missing, when one variable is unset", () => {
    const environment = { ...ALL_MAIL_VARIABLES, MAIL_FROM_ADDRESS: undefined };

    expect(selectMailSender(environment)).toEqual({
      kind: "unavailable",
      variables: ["MAIL_FROM_ADDRESS"],
    });
  });

  it("is unavailable when a variable is set to something unusable", () => {
    const environment = {
      ...ALL_MAIL_VARIABLES,
      LEAD_NOTIFICATION_ADDRESS: "a@b.c, d@e.f",
    };

    expect(selectMailSender(environment)).toEqual({
      kind: "unavailable",
      variables: ["LEAD_NOTIFICATION_ADDRESS"],
    });
  });
});

describe("selectMailSender: what it is a function of", () => {
  const ENVIRONMENTS: readonly [string, MailEnvironment][] = [
    ["nothing", {}],
    ["the flag", { [FAKE_MAIL_FLAG]: "1" }],
    ["the mail variables", ALL_MAIL_VARIABLES],
    ["both", { ...ALL_MAIL_VARIABLES, [FAKE_MAIL_FLAG]: "1" }],
  ];

  it.each(ENVIRONMENTS)(
    "answers the same for %s whatever the build mode",
    (_label, environment) => {
      const answers = [undefined, "production", "development", "test"].map(
        (mode) => selectMailSender({ ...environment, NODE_ENV: mode }),
      );

      expect(
        new Set(answers.map((answer) => JSON.stringify(answer))).size,
      ).toBe(1);
    },
  );

  it("ignores the process environment and reads only the one handed in", () => {
    vi.stubEnv(FAKE_MAIL_FLAG, "1");
    try {
      expect(selectMailSender({}).kind).toBe("unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("takes the environment and nothing else, so no request can reach it", () => {
    expect(selectMailSender.length).toBe(1);
  });
});

describe("selectMailSender: only the environment's own members count", () => {
  it("reads no mail variable an object inherits", () => {
    const inherited = Object.create(ALL_MAIL_VARIABLES) as MailEnvironment;

    expect(selectMailSender(inherited)).toEqual({
      kind: "unavailable",
      variables: ALL_THREE_NAMES,
    });
  });

  it("does not take an inherited flag as the flag", () => {
    const inherited = Object.create({
      [FAKE_MAIL_FLAG]: "1",
    }) as MailEnvironment;

    expect(selectMailSender(inherited).kind).toBe("unavailable");
  });

  it("does not count an inherited mail variable as present beside the flag", () => {
    const environment = Object.create(ALL_MAIL_VARIABLES) as Record<
      string,
      string
    >;
    environment[FAKE_MAIL_FLAG] = "1";

    expect(selectMailSender(environment)).toEqual({ kind: "fake" });
  });
});

describe("selectMailSender: what an unavailable answer discloses", () => {
  it("holds no part of an unusable value", () => {
    const MARKER = "SECRET-MARKER-9c1d";
    const environment = {
      RESEND_API_KEY: `${MARKER} with spaces`,
      MAIL_FROM_ADDRESS: `${MARKER}@a@example.com`,
      LEAD_NOTIFICATION_ADDRESS: `${MARKER}@example.com, x@example.com`,
    };
    const beside = { ...environment, [FAKE_MAIL_FLAG]: "1" };

    const answers = JSON.stringify([
      selectMailSender(environment),
      selectMailSender(beside),
    ]);

    expect(answers).not.toContain(MARKER);
  });
});

describe("select-mail-sender.ts", () => {
  const source = readMailModuleSource("select-mail-sender.ts");

  it("names neither the process environment nor the build mode", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
  });

  it("imports neither the fake nor an adapter, so it can only answer which", () => {
    const imported = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(imported).toEqual(["@/lib/server/mail/mail-configuration"]);
  });
});
