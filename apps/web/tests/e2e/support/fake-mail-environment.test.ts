import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";
import {
  MAIL_VARIABLE_NAMES,
  RETIRED_MAIL_VARIABLE_NAMES,
} from "@/lib/server/mail/mail-configuration";

import {
  FAKE_MAIL_FLAG_NAME,
  FAKE_MAIL_SERVER_ENVIRONMENT,
  MAIL_VARIABLES_THE_SUITE_REFUSES,
  MailVariableInTheSuiteError,
  requireNoMailVariable,
  withholdMailVariables,
} from "./fake-mail-environment";
import { inheritedEnvironmentOf } from "./production-policy-server";

const SECRET_MARKER = "FORBIDDEN-MAIL-VALUE-MARKER-2290";

describe("the environment the suite's server is given for mail", () => {
  it("is exactly the flag the server selects its fake sender by, set to the one value that opts in", () => {
    expect(FAKE_MAIL_SERVER_ENVIRONMENT).toEqual({
      [FAKE_MAIL_FLAG]: FAKE_MAIL_FLAG_ENABLED,
    });
  });

  it("makes the server choose the fake sender, with nothing else in its environment", () => {
    expect(selectMailSender(FAKE_MAIL_SERVER_ENVIRONMENT)).toEqual({
      kind: "fake",
    });
  });

  it("holds no variable that makes a sender real", () => {
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(Object.hasOwn(FAKE_MAIL_SERVER_ENVIRONMENT, name)).toBe(false);
    }
  });

  it("refuses the very variables the server counts as mail variables, the three it reads and the two it retired, no fewer and no more", () => {
    expect([...MAIL_VARIABLES_THE_SUITE_REFUSES].sort()).toEqual(
      [...MAIL_VARIABLE_NAMES, ...RETIRED_MAIL_VARIABLE_NAMES].sort(),
    );
  });

  it("spells the flag the same as the server does", () => {
    expect(FAKE_MAIL_FLAG_NAME).toBe(FAKE_MAIL_FLAG);
  });
});

describe("a run whose own environment holds a mail variable", () => {
  it.each(MAIL_VARIABLES_THE_SUITE_REFUSES)(
    "fails with the name of %s and never its value",
    (name) => {
      const environment = { [name]: SECRET_MARKER, UNRELATED: "x" };

      const failure = captureFailure(() => {
        requireNoMailVariable(environment);
      });

      expect(failure).toBeInstanceOf(MailVariableInTheSuiteError);
      expect(failure?.message).toContain(name);
      expect(failure?.message).not.toContain(SECRET_MARKER);
    },
  );

  it("fails for a variable that is present and empty, as the server counts it present", () => {
    expect(() => {
      requireNoMailVariable({ GOOGLE_APP_PASSWORD: "" });
    }).toThrow(MailVariableInTheSuiteError);
  });

  it("names every one that is present", () => {
    const failure = captureFailure(() => {
      requireNoMailVariable({
        GOOGLE_EMAIL: SECRET_MARKER,
        LEAD_NOTIFICATION_ADDRESS: SECRET_MARKER,
      });
    });

    expect(failure?.message).toContain(
      "GOOGLE_EMAIL, LEAD_NOTIFICATION_ADDRESS",
    );
  });

  it("lets a run with none go on, and one that holds the flag alone", () => {
    expect(() => {
      requireNoMailVariable({});
    }).not.toThrow();
    expect(() => {
      requireNoMailVariable({ ...FAKE_MAIL_SERVER_ENVIRONMENT });
    }).not.toThrow();
  });
});

describe("withholding the mail variables from the runner's own environment", () => {
  const UNRELATED = { DATABASE_URL: "unrelated-1", PATH: "unrelated-2" };

  function environmentHoldingEveryMailVariable(): Record<
    string,
    string | undefined
  > {
    return {
      ...UNRELATED,
      ...Object.fromEntries(
        MAIL_VARIABLES_THE_SUITE_REFUSES.map((name) => [name, SECRET_MARKER]),
      ),
    };
  }

  it("leaves none of the five and keeps every other name with its value", () => {
    const environment = environmentHoldingEveryMailVariable();

    withholdMailVariables(environment, () => undefined);

    expect(environment).toEqual(UNRELATED);
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(Object.hasOwn(environment, name)).toBe(false);
    }
  });

  it("removes a variable that is present and empty or undefined, as the server counts it present", () => {
    const environment: Record<string, string | undefined> = {
      ...UNRELATED,
      GOOGLE_EMAIL: "",
      RESEND_API_KEY: undefined,
    };

    withholdMailVariables(environment, () => undefined);

    expect(environment).toEqual(UNRELATED);
  });

  it("says so in one line that holds the names withheld and never a value", () => {
    const lines: string[] = [];

    withholdMailVariables(environmentHoldingEveryMailVariable(), (line) => {
      lines.push(line);
    });

    expect(lines).toHaveLength(1);
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(lines[0]).toContain(name);
    }
    expect(lines[0]).not.toContain(SECRET_MARKER);
    expect(lines[0]).not.toContain("unrelated");
  });

  it("names only what was there", () => {
    const lines: string[] = [];

    withholdMailVariables(
      { ...UNRELATED, GOOGLE_EMAIL: SECRET_MARKER },
      (line) => {
        lines.push(line);
      },
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("GOOGLE_EMAIL");
    expect(lines[0]).not.toContain("GOOGLE_APP_PASSWORD");
    expect(lines[0]).not.toContain("RESEND_API_KEY");
  });

  it("is a no-op that prints nothing over an environment holding none, and over the flag alone", () => {
    const lines: string[] = [];
    const environment = { ...UNRELATED, ...FAKE_MAIL_SERVER_ENVIRONMENT };

    withholdMailVariables(environment, (line) => {
      lines.push(line);
    });

    expect(lines).toEqual([]);
    expect(environment).toEqual({
      ...UNRELATED,
      ...FAKE_MAIL_SERVER_ENVIRONMENT,
    });
  });

  it("leaves nothing for requireNoMailVariable to refuse, so the proof passes after it and fails without it", () => {
    const withheld = environmentHoldingEveryMailVariable();
    const notWithheld = environmentHoldingEveryMailVariable();

    withholdMailVariables(withheld, () => undefined);

    expect(() => {
      requireNoMailVariable(withheld);
    }).not.toThrow();
    expect(() => {
      requireNoMailVariable(notWithheld);
    }).toThrow(MailVariableInTheSuiteError);
  });
});

describe("what the second, production-policy server inherits of the runner's environment", () => {
  it("holds none of the five mail names and not the flag, and keeps every unrelated name and value", () => {
    const runnersEnvironment: Record<string, string | undefined> = {
      DATABASE_URL: "unrelated-1",
      CI: "1",
      [FAKE_MAIL_FLAG_NAME]: "1",
      ...Object.fromEntries(
        MAIL_VARIABLES_THE_SUITE_REFUSES.map((name) => [name, SECRET_MARKER]),
      ),
    };

    const inherited = inheritedEnvironmentOf(runnersEnvironment);

    expect(inherited).toEqual({ DATABASE_URL: "unrelated-1", CI: "1" });
  });
});

describe("playwright.config.ts", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../../../playwright.config.ts"),
    "utf8",
  );
  const loadsTheEnvironment = source.indexOf("loadEnvLocal();");
  const withholds = source.indexOf("withholdMailVariables(process.env");
  const requiresNone = source.indexOf("requireNoMailVariable(process.env)");

  it("reads source: withholds from the process's own environment after loadEnvLocal and before the proof that it ran", () => {
    expect(loadsTheEnvironment).toBeGreaterThan(-1);
    expect(withholds).toBeGreaterThan(loadsTheEnvironment);
    expect(requiresNone).toBeGreaterThan(withholds);
  });
});

function captureFailure(act: () => void): Error | undefined {
  try {
    act();
  } catch (thrown) {
    return thrown instanceof Error ? thrown : undefined;
  }
  return undefined;
}
