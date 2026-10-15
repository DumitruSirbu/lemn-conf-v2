// Case 7 of the plan's QA section, the parts a unit run can prove: the withholding on the real `process.env` and on a
// child process that inherits it, the line it prints, the order the config must keep, and what the second server
// inherits. The owner's files are never opened and no value of any variable is printed: every value here is a marker.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DIGEST_SECRET_VARIABLE } from "@/lib/server/digest/digest-secret-variable";
import { E2E_RATE_LIMIT_POLICY_FLAG } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { RUN_SECRET_VARIABLE } from "./e2e-rate-limit-run";
import {
  FAKE_MAIL_FLAG_NAME,
  FAKE_MAIL_SERVER_ENVIRONMENT,
  MAIL_VARIABLES_THE_SUITE_REFUSES,
  MailVariableInTheSuiteError,
  requireNoMailVariable,
  withholdMailVariables,
} from "./fake-mail-environment";
import { inheritedEnvironmentOf } from "./production-policy-server";

const MARKER = "QA-8N-HARNESS-MARKER-5d81c0";
const UNRELATED = "QA_8N_UNRELATED_VARIABLE";
const CONFIG_SOURCE = readFileSync(
  join(import.meta.dirname, "../../../playwright.config.ts"),
  "utf8",
);

function stubEveryMailVariable(): void {
  for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
    vi.stubEnv(name, MARKER);
  }
  vi.stubEnv(UNRELATED, MARKER);
}

beforeEach(stubEveryMailVariable);
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Which of the names the child can see, as booleans: a value is never read out of it. */
function namesSeenByAChild(
  environment: NodeJS.ProcessEnv,
  names: readonly string[],
): Record<string, boolean> {
  const script = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map((n) => [n, n in process.env]))))`;
  const child = spawnSync(process.execPath, ["-e", script], {
    env: environment,
    encoding: "utf8",
  });
  expect(child.status).toBe(0);
  return JSON.parse(child.stdout) as Record<string, boolean>;
}

describe("the withholding, on the process's own environment", () => {
  it("is shown to need doing: a child of this process sees every one of the five before it, and none after", () => {
    const names = [...MAIL_VARIABLES_THE_SUITE_REFUSES, UNRELATED];
    const before = namesSeenByAChild(process.env, names);

    withholdMailVariables(process.env, () => undefined);
    const after = namesSeenByAChild(process.env, names);

    expect(Object.values(before).every(Boolean)).toBe(true);
    expect(after).toEqual({
      ...Object.fromEntries(
        MAIL_VARIABLES_THE_SUITE_REFUSES.map((name) => [name, false]),
      ),
      [UNRELATED]: true,
    });
  });

  it("removes the five from `process.env` itself, as an own member and as a read, and keeps every other name and value", () => {
    const otherNamesBefore = Object.keys(process.env).filter(
      (name) => !MAIL_VARIABLES_THE_SUITE_REFUSES.includes(name),
    );

    withholdMailVariables(process.env, () => undefined);

    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(Object.hasOwn(process.env, name)).toBe(false);
      expect(process.env[name]).toBeUndefined();
      expect(name in process.env).toBe(false);
    }
    expect(process.env[UNRELATED]).toBe(MARKER);
    expect(Object.keys(process.env)).toEqual(otherNamesBefore);
    expect(() => {
      requireNoMailVariable(process.env);
    }).not.toThrow();
  });

  it("leaves nothing for the suite's server to inherit: the environment a server is made from holds none of the five, whoever adds the flag", () => {
    withholdMailVariables(process.env, () => undefined);

    const serverEnvironment = {
      ...process.env,
      ...FAKE_MAIL_SERVER_ENVIRONMENT,
    };

    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(Object.hasOwn(serverEnvironment, name)).toBe(false);
    }
    expect(serverEnvironment[FAKE_MAIL_FLAG_NAME]).toBe("1");
    expect(
      namesSeenByAChild(serverEnvironment, [
        ...MAIL_VARIABLES_THE_SUITE_REFUSES,
      ]),
    ).toEqual(
      Object.fromEntries(
        MAIL_VARIABLES_THE_SUITE_REFUSES.map((name) => [name, false]),
      ),
    );
  });

  it("is idempotent: a worker that evaluates the config again, after the file was loaded again, withholds again", () => {
    const lines: string[] = [];
    const announce = (line: string) => lines.push(line);

    withholdMailVariables(process.env, announce);
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      vi.stubEnv(name, MARKER);
    }
    withholdMailVariables(process.env, announce);
    withholdMailVariables(process.env, announce);

    expect(lines).toHaveLength(2);
    expect(() => {
      requireNoMailVariable(process.env);
    }).not.toThrow();
  });
});

describe("the line it prints", () => {
  it("is one line, holds each name withheld in the order the list gives them, and no value, no other name and no path", () => {
    const lines: string[] = [];

    withholdMailVariables(process.env, (line) => lines.push(line));

    expect(lines).toHaveLength(1);
    const [line = ""] = lines;
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).not.toContain(MARKER);
    expect(line).not.toContain(UNRELATED);
    expect(line).not.toMatch(/\.env|[/\\]/);
    const positions = MAIL_VARIABLES_THE_SUITE_REFUSES.map((name) =>
      line.indexOf(name),
    );
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("names exactly the subset that was present, for every subset of the five, and prints nothing for the empty one", () => {
    fc.assert(
      fc.property(
        fc.subarray([...MAIL_VARIABLES_THE_SUITE_REFUSES]),
        (present) => {
          const environment: Record<string, string | undefined> = {
            [UNRELATED]: MARKER,
          };
          for (const name of present) environment[name] = MARKER;
          const lines: string[] = [];

          withholdMailVariables(environment, (line) => lines.push(line));

          if (present.length === 0) {
            expect(lines).toEqual([]);
            return;
          }
          const [line = ""] = lines;
          for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
            expect(line.includes(name)).toBe(present.includes(name));
          }
          expect(environment).toEqual({ [UNRELATED]: MARKER });
        },
      ),
    );
  });
});

describe("the order the config must keep, shown by running its steps in each order", () => {
  /** What `loadEnvLocal` does to the runner: it copies a file's names in. Modelled, never read from a file. */
  function loadTheRootFile(environment: Record<string, string | undefined>) {
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      environment[name] ??= MARKER;
    }
  }

  function runSteps(
    ...steps: readonly ((
      environment: Record<string, string | undefined>,
    ) => void)[]
  ): Error | undefined {
    const environment: Record<string, string | undefined> = {};
    try {
      for (const step of steps) step(environment);
      requireNoMailVariable(environment);
      return undefined;
    } catch (thrown) {
      return thrown instanceof Error ? thrown : undefined;
    }
  }

  const withhold = (environment: Record<string, string | undefined>) => {
    withholdMailVariables(environment, () => undefined);
  };
  const addUnrelated = (environment: Record<string, string | undefined>) => {
    environment[UNRELATED] = MARKER;
  };

  it("load, withhold: the proof passes", () => {
    expect(runSteps(loadTheRootFile, withhold)).toBeUndefined();
  });

  it("withhold, load (the call moved above `loadEnvLocal()`): the proof fails, naming the variables and no value", () => {
    const failure = runSteps(withhold, loadTheRootFile);

    expect(failure).toBeInstanceOf(MailVariableInTheSuiteError);
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(failure?.message).toContain(name);
    }
    expect(failure?.message).not.toContain(MARKER);
  });

  it("load, no withholding (the call removed): the proof fails", () => {
    expect(runSteps(loadTheRootFile)).toBeInstanceOf(
      MailVariableInTheSuiteError,
    );
  });

  it("load, an unrelated variable, withhold: the proof still passes", () => {
    expect(runSteps(loadTheRootFile, addUnrelated, withhold)).toBeUndefined();
  });
});

describe("playwright.config.ts, read as source", () => {
  const lines = CONFIG_SOURCE.split("\n");
  const indexOfLine = (text: string) =>
    lines.findIndex((line) => line.trim() === text);

  it("calls the loader, the withholding and the proof once each, as statements of the module itself and in that order", () => {
    const load = indexOfLine("loadEnvLocal();");
    const withhold = indexOfLine(
      "withholdMailVariables(process.env, console.log);",
    );
    const prove = indexOfLine("requireNoMailVariable(process.env);");

    expect(load).toBeGreaterThan(-1);
    expect(withhold).toBeGreaterThan(load);
    expect(prove).toBeGreaterThan(withhold);
    for (const index of [load, withhold, prove]) {
      expect(lines[index]).toBe(lines[index]?.trimStart());
    }
    expect(CONFIG_SOURCE.match(/withholdMailVariables\(/g)).toHaveLength(1);
    expect(CONFIG_SOURCE.match(/loadEnvLocal\(\)/g)).toHaveLength(1);
  });

  it("names no mail variable but the flag, and gives the server the fake's flag and no spread of the process's environment", () => {
    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(CONFIG_SOURCE).not.toContain(name);
    }
    expect(CONFIG_SOURCE).toContain("...FAKE_MAIL_SERVER_ENVIRONMENT");
    expect(CONFIG_SOURCE).not.toMatch(/\.\.\.process\.env/);
  });
});

describe("what the second, production-policy server inherits", () => {
  const OTHER_NOT_INHERITED = [
    DIGEST_SECRET_VARIABLE,
    CLIENT_NETWORK_SOURCE_VARIABLE,
    E2E_RATE_LIMIT_POLICY_FLAG,
    RUN_SECRET_VARIABLE,
  ];
  const NEVER = [
    FAKE_MAIL_FLAG_NAME,
    ...MAIL_VARIABLES_THE_SUITE_REFUSES,
    ...OTHER_NOT_INHERITED,
  ];

  it("is every name of the runner's environment but exactly those, for any environment", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.oneof(
            fc.constantFrom(...NEVER),
            fc.constantFrom("PATH", "CI", "DATABASE_URL", "HOME"),
            fc.string({ minLength: 1, maxLength: 8 }),
          ),
          fc.oneof(fc.string({ maxLength: 6 }), fc.constant(undefined)),
        ),
        (runnersEnvironment) => {
          const inherited = inheritedEnvironmentOf(runnersEnvironment);

          expect(Object.keys(inherited).sort()).toEqual(
            Object.keys(runnersEnvironment)
              .filter((name) => !NEVER.includes(name))
              .sort(),
          );
          for (const [name, value] of Object.entries(inherited)) {
            expect(value).toBe(runnersEnvironment[name]);
          }
        },
      ),
    );
  });

  it("holds none of the five when made from the real process environment, withheld or not", () => {
    const inherited = inheritedEnvironmentOf(process.env);

    for (const name of MAIL_VARIABLES_THE_SUITE_REFUSES) {
      expect(Object.hasOwn(inherited, name)).toBe(false);
    }
    expect(inherited[UNRELATED]).toBe(MARKER);
  });

  it("is the server's own refusal list, name for name: no name the server counts as mail is missing from what the suite refuses", async () => {
    const { MAIL_VARIABLE_NAMES, RETIRED_MAIL_VARIABLE_NAMES } = await import(
      "@/lib/server/mail/mail-configuration"
    );

    expect([...MAIL_VARIABLES_THE_SUITE_REFUSES].sort()).toEqual(
      [...MAIL_VARIABLE_NAMES, ...RETIRED_MAIL_VARIABLE_NAMES].sort(),
    );
  });
});
