import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIL_VARIABLE_NAMES,
  RETIRED_MAIL_VARIABLE_NAMES,
  type MailEnvironment,
} from "@/lib/server/mail/mail-configuration";
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

const FAKE_PASSWORD = "ZxQ8vK3pWmRt5Yn2";
const FAKE_SENDER = "orders@mail.example.com";
const FAKE_INBOX = "inbox@example.com";

const ALL_MAIL_VARIABLES: MailEnvironment = {
  GOOGLE_EMAIL: FAKE_SENDER,
  GOOGLE_APP_PASSWORD: FAKE_PASSWORD,
  LEAD_NOTIFICATION_ADDRESS: FAKE_INBOX,
};

const ALL_THREE_NAMES = [
  "GOOGLE_EMAIL",
  "GOOGLE_APP_PASSWORD",
  "LEAD_NOTIFICATION_ADDRESS",
];

/** The three live names and the two retired ones: the five beside which the flag is refused. */
const ALL_FIVE_NAMES = [...MAIL_VARIABLE_NAMES, ...RETIRED_MAIL_VARIABLE_NAMES];

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
  it.each(ALL_FIVE_NAMES)(
    "answers unavailable naming the flag when %s is also set",
    (name) => {
      const environment = {
        [FAKE_MAIL_FLAG]: "1",
        [name]: ALL_MAIL_VARIABLES[name] ?? "retired-value",
      };

      expect(selectMailSender(environment)).toEqual(FLAG_IS_UNAVAILABLE);
    },
  );

  it.each(ALL_FIVE_NAMES)(
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
    for (const value of [FAKE_PASSWORD, FAKE_SENDER, FAKE_INBOX]) {
      expect(JSON.stringify(answer)).not.toContain(value);
      expect(inspected).not.toContain(value);
    }
  });

  it("is unavailable, naming what is missing, when one variable is unset", () => {
    const environment = { ...ALL_MAIL_VARIABLES, GOOGLE_EMAIL: undefined };

    expect(selectMailSender(environment)).toEqual({
      kind: "unavailable",
      variables: ["GOOGLE_EMAIL"],
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

describe("selectMailSender: the fake's fence over the five names", () => {
  const STATES = ["absent", "own-undefined", "own-value"] as const;
  type State = (typeof STATES)[number];

  function environmentOf(
    states: readonly State[],
    flag: string | undefined,
  ): MailEnvironment {
    const environment: Record<string, string | undefined> = {};
    ALL_FIVE_NAMES.forEach((name, index) => {
      const state = states[index];
      if (state === "own-undefined") environment[name] = undefined;
      if (state === "own-value") environment[name] = "some-value";
    });
    if (flag !== undefined) environment[FAKE_MAIL_FLAG] = flag;
    return environment;
  }

  function everyStateOfTheFiveNames(): State[][] {
    return ALL_FIVE_NAMES.reduce<State[][]>(
      (partial) =>
        partial.flatMap((head) => STATES.map((state) => [...head, state])),
      [[]],
    );
  }

  it("selects the fake with the flag at 1 exactly when none of the five names is an own member", () => {
    const cases = everyStateOfTheFiveNames();
    const wrong = cases.filter((states) => {
      const selection = selectMailSender(environmentOf(states, "1"));
      const noneIsPresent = states.every((state) => state === "absent");
      return noneIsPresent
        ? selection.kind !== "fake"
        : JSON.stringify(selection) !== JSON.stringify(FLAG_IS_UNAVAILABLE);
    });

    expect(cases).toHaveLength(STATES.length ** ALL_FIVE_NAMES.length);
    expect(wrong).toEqual([]);
  });

  it("never selects the fake for any flag other than 1, whatever the five names hold", () => {
    const cases = everyStateOfTheFiveNames();
    const wrong = ["true", "01", " 1", "", "0", undefined].flatMap((flag) =>
      cases.filter(
        (states) =>
          selectMailSender(environmentOf(states, flag)).kind === "fake",
      ),
    );

    expect(wrong).toEqual([]);
  });

  it.each(RETIRED_MAIL_VARIABLE_NAMES)(
    "refuses the flag beside the retired %s alone, which configures nothing",
    (name) => {
      expect(selectMailSender({ [FAKE_MAIL_FLAG]: "1", [name]: "x" })).toEqual(
        FLAG_IS_UNAVAILABLE,
      );
    },
  );

  it.each(RETIRED_MAIL_VARIABLE_NAMES)(
    "does not count the retired %s as configuration: without the flag it is unavailable, naming the three live names",
    (name) => {
      expect(selectMailSender({ [name]: "x" })).toEqual({
        kind: "unavailable",
        variables: ALL_THREE_NAMES,
      });
    },
  );
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

describe("selectMailSender: a mail variable that is a member counts whatever it holds", () => {
  it.each(ALL_FIVE_NAMES)(
    "answers unavailable naming the flag when %s is a member holding undefined",
    (name) => {
      const environment = { [FAKE_MAIL_FLAG]: "1", [name]: undefined };

      expect(selectMailSender(environment)).toEqual(FLAG_IS_UNAVAILABLE);
    },
  );
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
      GOOGLE_APP_PASSWORD: `${MARKER} with spaces`,
      GOOGLE_EMAIL: `${MARKER}@a@example.com`,
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

  it("reads source: names neither the process environment nor the build mode", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
  });

  it("reads source: imports neither the fake nor an adapter, so it can only answer which", () => {
    const imported = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(imported).toEqual(["@/lib/server/mail/mail-configuration"]);
  });
});
