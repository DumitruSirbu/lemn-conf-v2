import { describe, expect, it } from "vitest";

import {
  FAKE_MAIL_FLAG,
  FAKE_MAIL_FLAG_ENABLED,
  selectMailSender,
} from "@/lib/server/mail/select-mail-sender";
import { MAIL_VARIABLE_NAMES } from "@/lib/server/mail/mail-configuration";

import {
  FAKE_MAIL_SERVER_ENVIRONMENT,
  MAIL_VARIABLES_THE_SUITE_REFUSES,
  MailVariableInTheSuiteError,
  requireNoMailVariable,
} from "./fake-mail-environment";

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
    for (const name of MAIL_VARIABLE_NAMES) {
      expect(Object.hasOwn(FAKE_MAIL_SERVER_ENVIRONMENT, name)).toBe(false);
    }
  });

  it("refuses the very variables the server counts as mail variables, no fewer and no more", () => {
    expect([...MAIL_VARIABLES_THE_SUITE_REFUSES].sort()).toEqual(
      [...MAIL_VARIABLE_NAMES].sort(),
    );
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
      requireNoMailVariable({ RESEND_API_KEY: "" });
    }).toThrow(MailVariableInTheSuiteError);
  });

  it("names every one that is present", () => {
    const failure = captureFailure(() => {
      requireNoMailVariable({
        RESEND_API_KEY: SECRET_MARKER,
        LEAD_NOTIFICATION_ADDRESS: SECRET_MARKER,
      });
    });

    expect(failure?.message).toContain(
      "RESEND_API_KEY, LEAD_NOTIFICATION_ADDRESS",
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

function captureFailure(act: () => void): Error | undefined {
  try {
    act();
  } catch (thrown) {
    return thrown instanceof Error ? thrown : undefined;
  }
  return undefined;
}
