import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_EVENTS,
  ACCOUNT_OUTCOMES,
  reportAccountEvent,
  type AccountEvent,
  type AccountOutcome,
} from "@/lib/server/account/account-log";
import { ALL_LIMIT_POLICIES } from "@/lib/server/rate-limit/limit-policy";

import { readSource, sourceFilesMatching } from "../server-source-support";

/**
 * The account log (ADR 0172 D5): one line per answer, made of closed lists, so that no password, token, session value,
 * address or phone has a parameter to travel in.
 */

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the lists", () => {
  it("names the events of the account flows, once each", () => {
    expect([...ACCOUNT_EVENTS]).toEqual([
      "register",
      "confirm-email",
      "login",
      "logout",
      "password-reset-request",
      "password-reset-complete",
      "claim",
      "kitchens",
      "staff-kitchens",
      "staff-kitchen",
      "staff-audit",
      "staff-note",
      "staff-status",
      "staff-unhide",
      "kitchen-rename",
      "kitchen-duplicate",
      "kitchen-hide",
      "kitchen-delete",
      "profile",
      "password-change",
      "email-change",
      "email-change-confirm",
      "email-change-revert",
      "export",
      "session-read",
      "session-revoke",
      "breach-check",
      "turnstile",
      "mail",
    ]);
    expect(new Set(ACCOUNT_EVENTS).size).toBe(ACCOUNT_EVENTS.length);
  });

  it("names the four outcomes, once each", () => {
    expect([...ACCOUNT_OUTCOMES]).toEqual([
      "succeeded",
      "refused",
      "limited",
      "unavailable",
    ]);
  });

  it("holds no event the account code never writes: a name nothing uses is a name that could mean two things", () => {
    const users = sourceFilesMatching(/event/).filter(
      (path) => path !== "lib/server/account/account-log.ts",
    );
    const text = users.map((path) => readSource(path)).join("\n");

    for (const event of ACCOUNT_EVENTS) {
      expect(text, event).toContain(`"${event}"`);
    }
  });

  it("is a list every literal event the account code writes belongs to", () => {
    const written = sourceFilesMatching(/reportAccountEvent/)
      .filter((path) => path !== "lib/server/account/account-log.ts")
      .flatMap((path) =>
        [...readSource(path).matchAll(/\bevent: "([a-z-]+)"/g)].map(
          (match) => match[1],
        ),
      );

    expect(written.length).toBeGreaterThan(20);
    for (const event of written) {
      expect(
        ACCOUNT_EVENTS as readonly (string | undefined)[],
        String(event),
      ).toContain(event);
    }
  });
});

describe("a line", () => {
  const EVENT_BY_OUTCOME = ACCOUNT_EVENTS.flatMap((event) =>
    ACCOUNT_OUTCOMES.map((outcome) => [event, outcome] as const),
  );

  it.each(EVENT_BY_OUTCOME)(
    "is [account] and an event and an outcome alone for %s, %s",
    (event, outcome) => {
      reportAccountEvent({ event, outcome });

      const sink = outcome === "unavailable" ? error : warn;
      const other = outcome === "unavailable" ? warn : error;
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink).toHaveBeenCalledWith("[account]", { event, outcome });
      expect(other).not.toHaveBeenCalled();
    },
  );

  it("carries the policy that limited it, by its name", () => {
    const [policy] = ALL_LIMIT_POLICIES;

    reportAccountEvent({
      event: "login",
      outcome: "limited",
      policy: policy?.name ?? "",
    });

    expect(warn).toHaveBeenCalledWith("[account]", {
      event: "login",
      outcome: "limited",
      policy: policy?.name,
    });
  });

  it("keeps the name of every policy the limiter has, none of them past the shape a line allows", () => {
    for (const { name } of ALL_LIMIT_POLICIES) {
      warn.mockClear();

      reportAccountEvent({ event: "login", outcome: "limited", policy: name });

      expect(warn, name).toHaveBeenCalledWith("[account]", {
        event: "login",
        outcome: "limited",
        policy: name,
      });
    }
  });

  it.each([
    ["upper case", "Design-Save"],
    ["a space", "design save"],
    ["a line break", "design-save\nforged line"],
    ["a leading digit", "1design"],
    ["empty", ""],
    ["65 characters", `a${"b".repeat(64)}`],
    ["an address", "someone@example.test"],
    ["a non-ASCII letter", "dé-sign"],
    ["not text", 42 as never],
    ["null", null as never],
  ])(
    "writes a policy of %s as none: a name that is not shaped like a policy's cannot carry text",
    (_label, policy) => {
      reportAccountEvent({ event: "login", outcome: "limited", policy });

      expect(warn).toHaveBeenCalledWith("[account]", {
        event: "login",
        outcome: "limited",
        policy: "none",
      });
    },
  );

  it("writes an event or an outcome outside the lists as other, which only a cast reaches", () => {
    reportAccountEvent({
      event: "someone@example.test" as AccountEvent,
      outcome: "forged" as AccountOutcome,
    });

    expect(warn).toHaveBeenCalledWith("[account]", {
      event: "other",
      outcome: "other",
    });
  });

  it("writes nothing but what its three parameters name: any further member is dropped", () => {
    reportAccountEvent({
      event: "login",
      outcome: "refused",
      email: "someone@example.test",
      password: "hunter2 hunter2",
      token: "SECRET-TOKEN",
    } as never);

    expect(warn).toHaveBeenCalledWith("[account]", {
      event: "login",
      outcome: "refused",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /someone|hunter|SECRET/,
    );
  });

  it("never throws, whatever the console does", () => {
    warn.mockImplementation(() => {
      throw new Error("console closed");
    });
    error.mockImplementation(() => {
      throw new Error("console closed");
    });

    expect(() => {
      reportAccountEvent({ event: "login", outcome: "refused" });
    }).not.toThrow();
    expect(() => {
      reportAccountEvent({ event: "login", outcome: "unavailable" });
    }).not.toThrow();
  });
});
