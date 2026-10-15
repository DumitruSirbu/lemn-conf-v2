import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import {
  DIGEST_SECRET_VARIABLE,
  readDigester,
  type ServerEnvironment,
} from "@/lib/server/digest/digest-secret";
import {
  DigestPartError,
  type DigestInput,
} from "@/lib/server/digest/keyed-digest";

import {
  declarationsInEnvExample,
  isOnlyCommentedInEnvExample,
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
  sourceFilesMatching,
} from "../server-source-support";

/** The bytes 0 to 31 written as the variable writes them: a key nobody would deploy. */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const BUCKET: DigestInput = {
  purpose: "rate-limit-bucket",
  fields: {
    policyName: "test-policy-day",
    subjectKind: "ipv4-block",
    subject: "192.0.2",
  },
};

/** The same answer the second tool gave for the same encoding under the same key. */
const KNOWN_DIGEST =
  "1bba7acd899444786ab88d855f9cd8b6101746bb902a8903a074159b704c9c52";

const UNAVAILABLE_ANSWER = {
  status: "unavailable",
  variable: "DIGEST_SECRET",
};

describe("readDigester: when the variable is usable", () => {
  it("answers a digester under the key the sixty-four characters spell", () => {
    const outcome = readDigester({ [DIGEST_SECRET_VARIABLE]: FAKE_SECRET });

    if (outcome.status !== "usable") throw new Error("expected a digester");
    expect(outcome.digest(BUCKET)).toBe(KNOWN_DIGEST);
  });

  it("reads the environment at each call, so a value set later is the one used", () => {
    const environment: Record<string, string | undefined> = {};

    expect(readDigester(environment)).toEqual(UNAVAILABLE_ANSWER);
    environment[DIGEST_SECRET_VARIABLE] = FAKE_SECRET;

    expect(readDigester(environment).status).toBe("usable");
  });

  it("gives two digesters under two keys two answers", () => {
    const other = "ff".repeat(32);
    const first = readDigester({ [DIGEST_SECRET_VARIABLE]: FAKE_SECRET });
    const second = readDigester({ [DIGEST_SECRET_VARIABLE]: other });

    if (first.status !== "usable" || second.status !== "usable") {
      throw new Error("expected two digesters");
    }
    expect(second.digest(BUCKET)).not.toBe(first.digest(BUCKET));
  });
});

describe("readDigester: the truth table of what is not usable", () => {
  const LONG_ENOUGH_WITH_A_MARKER = `${"MARKER".repeat(10)}abcd`;
  const UNUSABLE: readonly [string, ServerEnvironment][] = [
    ["absent", {}],
    ["an own member holding undefined", { DIGEST_SECRET: undefined }],
    ["empty", { DIGEST_SECRET: "" }],
    ["whitespace", { DIGEST_SECRET: " ".repeat(64) }],
    [
      "a usable value with a trailing line break",
      { DIGEST_SECRET: `${FAKE_SECRET}\n` },
    ],
    [
      "a usable value with a leading space",
      { DIGEST_SECRET: ` ${FAKE_SECRET}` },
    ],
    ["uppercase hexadecimal", { DIGEST_SECRET: FAKE_SECRET.toUpperCase() }],
    ["sixty-three characters", { DIGEST_SECRET: FAKE_SECRET.slice(1) }],
    ["sixty-five characters", { DIGEST_SECRET: `${FAKE_SECRET}0` }],
    [
      "a non-hexadecimal character",
      { DIGEST_SECRET: `${FAKE_SECRET.slice(1)}g` },
    ],
    ["a value with a marker", { DIGEST_SECRET: LONG_ENOUGH_WITH_A_MARKER }],
    [
      "a comma-joined pair",
      {
        DIGEST_SECRET: `${FAKE_SECRET.slice(0, 31)},${FAKE_SECRET.slice(0, 32)}`,
      },
    ],
    ["a different variable", { OTHER_SECRET: FAKE_SECRET }],
    [
      "an inherited member",
      Object.create({ DIGEST_SECRET: FAKE_SECRET }) as ServerEnvironment,
    ],
    ["not text", { DIGEST_SECRET: 42 } as unknown as ServerEnvironment],
  ];

  it.each(UNUSABLE)(
    "answers unavailable, naming the variable alone, for %s",
    (_label, environment) => {
      const outcome = readDigester(environment);

      expect(outcome).toEqual(UNAVAILABLE_ANSWER);
      expect(Reflect.ownKeys(outcome)).toEqual(["status", "variable"]);
      expect(inspect(outcome, { depth: null, showHidden: true })).not.toContain(
        "MARKER",
      );
    },
  );
});

describe("what holds the key", () => {
  it("is in no value the reader returns, inspected every way, and in no digest it makes", () => {
    const outcome = readDigester({ [DIGEST_SECRET_VARIABLE]: FAKE_SECRET });
    if (outcome.status !== "usable") throw new Error("expected a digester");
    const digest = outcome.digest(BUCKET);
    const everyReading = [
      JSON.stringify(outcome),
      inspect(outcome, { depth: null, showHidden: true, showProxy: true }),
      inspect(outcome.digest, { depth: null, showHidden: true }),
      String(outcome.digest),
      Reflect.ownKeys(outcome.digest).map(String).join(","),
      digest,
    ].join("\n");

    expect(everyReading).not.toContain(FAKE_SECRET);
    expect(everyReading).not.toContain(
      Buffer.from(FAKE_SECRET, "hex").toString("latin1"),
    );
    expect(Reflect.ownKeys(outcome)).toEqual(["status", "digest"]);
  });

  it("is in nothing the digester throws", () => {
    const outcome = readDigester({ [DIGEST_SECRET_VARIABLE]: FAKE_SECRET });
    if (outcome.status !== "usable") throw new Error("expected a digester");
    const ill = { ...BUCKET, fields: { ...BUCKET.fields, subject: "\ud800" } };

    let thrown: unknown;
    try {
      outcome.digest(ill);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DigestPartError);
    expect(inspect(thrown, { depth: null, showHidden: true })).not.toContain(
      FAKE_SECRET,
    );
  });
});

describe("digest-secret.ts", () => {
  const source = readSource("lib/server/digest/digest-secret.ts");

  it("reads source: begins with the server-only import", () => {
    expect(source.startsWith('import "server-only";\n')).toBe(true);
  });

  it("reads source: names neither the process environment nor the build mode", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
  });

  it("reads source: holds no key, default or fallback of its own in the digest and rate-limit modules", () => {
    for (const path of [
      "lib/server/digest/digest-secret.ts",
      "lib/server/digest/keyed-digest.ts",
      "lib/server/rate-limit/client-network.ts",
      "lib/server/rate-limit/network-source.ts",
    ]) {
      expect(readSource(path), path).not.toMatch(/[0-9a-f]{64}/i);
    }
  });
});

describe("who imports the digest modules", () => {
  const IMPORTS_A_DIGEST_MODULE =
    /lib\/server\/digest\/(?:keyed-digest|digest-secret)|\.\/(?:keyed-digest|digest-secret)["']/;

  it("reads source: is nothing under apps/web/src outside lib/server", () => {
    const importers = sourceFilesMatching(IMPORTS_A_DIGEST_MODULE).filter(
      (path) => !path.startsWith("lib/server/"),
    );

    expect(importers).toEqual([]);
  });

  it("reads source: the scan sees the importer it exists for", () => {
    expect(sourceFilesMatching(IMPORTS_A_DIGEST_MODULE)).toContain(
      "lib/server/digest/digest-secret.ts",
    );
  });
});

describe(".env.example", () => {
  it("names DIGEST_SECRET once, with no value, as a comment", () => {
    expect(declarationsInEnvExample(DIGEST_SECRET_VARIABLE)).toEqual([
      "DIGEST_SECRET=",
    ]);
    expect(isOnlyCommentedInEnvExample(DIGEST_SECRET_VARIABLE)).toBe(true);
  });
});
