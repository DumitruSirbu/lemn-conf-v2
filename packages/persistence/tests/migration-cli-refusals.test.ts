import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  FAKE_HOST,
  FAKE_PASSWORD,
  FAKE_USER,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import { spawnPersistenceCli } from "./support/spawn-persistence-cli.js";
import type { SpawnedCliResult } from "./support/spawn-persistence-cli.js";

const DECLARED_ENVIRONMENT = "test";
const LISTED_TEST_DATABASE = "lemn-conf-v2-staging";
const OTHER_VARIABLES_URL = `postgres://app:apppw@other-${FAKE_HOST}/appdb`;
const EXITS_ON_ITS_OWN_WITHIN_MS = 15_000;
const CREDENTIALS = `${FAKE_USER}:${FAKE_PASSWORD}`;

const CLIS = [
  { script: "src/migrate.ts", prefix: "[migrate]" },
  { script: "src/migrate-status.ts", prefix: "[migrate:status]" },
];

const REFUSED_VALUES = [
  {
    label: "a bad percent-escape, which the opener refuses",
    value: `postgres://${CREDENTIALS}%ZZ@${FAKE_HOST}/${LISTED_TEST_DATABASE}`,
  },
  {
    label: "a wrong scheme, which the environment check refuses first",
    value: `mysql://${CREDENTIALS}@${FAKE_HOST}/${LISTED_TEST_DATABASE}`,
  },
  {
    label: "a slash in the password that moves the secret into the path",
    value: `postgres://${FAKE_USER}:123/${FAKE_PASSWORD}@${FAKE_HOST}/db`,
  },
];

async function runCli(
  script: string,
  migrationUrl: string,
): Promise<SpawnedCliResult & { readonly elapsedMs: number }> {
  const startedAt = performance.now();
  const result = await spawnPersistenceCli(script, [DECLARED_ENVIRONMENT], {
    MIGRATION_DATABASE_URL: migrationUrl,
    DATABASE_URL: OTHER_VARIABLES_URL,
    TEST_DATABASE_URL: OTHER_VARIABLES_URL,
  });
  return { ...result, elapsedMs: performance.now() - startedAt };
}

describe.each(CLIS)(
  "$script, given a value it must refuse",
  ({ script, prefix }) => {
    it.each(REFUSED_VALUES)(
      "exits non-zero on its own with one printed refusal naming MIGRATION_DATABASE_URL and no part of the value: $label",
      async ({ value }) => {
        const result = await runCli(script, value);

        expect(result.elapsedMs).toBeLessThan(EXITS_ON_ITS_OWN_WITHIN_MS);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim().split("\n")).toHaveLength(1);
        expect(result.stderr).toContain(prefix);
        expect(result.stderr).toContain("MIGRATION_DATABASE_URL");
        expect(markersFoundOn(result.stderr)).toEqual([]);
      },
    );
  },
);

describe("spawnPersistenceCli", () => {
  const scratch = mkdtempSync(join(tmpdir(), "spawn-cli-"));

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("fails the test for a child it had to kill, instead of reporting an exit code", async () => {
    const neverExits = join(scratch, "never-exits.ts");
    writeFileSync(neverExits, "setInterval(() => undefined, 1_000);\n");

    await expect(
      spawnPersistenceCli(neverExits, [], {}, 1_500),
    ).rejects.toThrow(/did not exit within 1500 ms and was killed/);
  });

  it("still reports the exit code of a child that fails on its own", async () => {
    const failsAtOnce = join(scratch, "fails-at-once.ts");
    writeFileSync(failsAtOnce, "process.exitCode = 3;\n");

    const result = await spawnPersistenceCli(failsAtOnce, [], {});

    expect(result.exitCode).toBe(3);
  });
});
