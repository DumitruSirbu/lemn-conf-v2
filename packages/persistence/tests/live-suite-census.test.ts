import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import vitestConfig from "../vitest.config.js";
import {
  databaseReachingFiles,
  destructiveFilesNotExclusive,
  discoverTestFiles,
  gateOf,
  lockRegistrationOf,
  misplacedRegistrations,
  opensConnection,
  readTestTree,
  setupFilesOf,
  setupFilesThatConnect,
  sourceOf,
} from "./support/live-suite-census-scanner.js";
import type {
  Gate,
  LockDeclaration,
} from "./support/live-suite-census-scanner.js";

/**
 * The two censuses of M7 wave 7T (T-J7; criteria 7 and 13): **which gate** each database-reaching
 * test file uses, and **which test-schema lock mode** it declares. Both sweep exactly the files
 * vitest's `include` resolves — nested directories too — and compare what they find with a literal
 * table, so a new file that reaches a database without being classified here turns this file red.
 *
 * **Both census assertions must stay green, and must not be deleted or marked `it.fails` again.**
 * A registration goes before any module-scope statement that can run code — directly after the
 * imports is the simple way.
 *
 * **What this is, by ruling (coordinator, 2026-09-22): a tripwire against honest
 * misclassification, not a sandbox against an adversarial author.** It catches a live file somebody
 * forgot to classify or register. It does not try to catch one written to evade it.
 *
 * **How it reads a file.** Sources are parsed with the TypeScript compiler, not matched as text, so
 * a commented-out registration counts for nothing and an aliased import is read as the function it
 * really names. Pattern checks (URL sources, gates, the destructive pattern) run over the source
 * reprinted without comments. Module links followed: static imports, `export … from` re-exports and
 * `import("…")` with a literal path. `vitest.config.ts`'s `setupFiles` must match a literal list,
 * and none may open a connection.
 *
 * **What the lock covers, and what it cannot.** The lock is taken in a `beforeAll`, so it covers
 * **hooks and tests only**. Vitest runs module-scope statements, `vi.hoisted` and `describe` bodies
 * at **collection**, before any `beforeAll` — so database work there is never under the lock, by
 * vitest's design, wherever the registration sits. That is what this package's rule *"database
 * work only inside hooks and tests"* exists for. **The registration-first check guards hook order
 * only**: it makes the lock's `beforeAll` run before any other module-scope hook. It does not make
 * code below the registration safe, and nothing here checks collection-time database work.
 *
 * **Limits, stated so nobody trusts more than this proves:**
 * - **URL through a constant.** A file "reaches a database" if it names a database-URL source, or
 *   imports (by the links above) a module under `tests/` that opens a connection. A URL copied into
 *   a constant, a literal or another module's export that is not a connecting module escapes.
 * - **Opener names outside the list.** "Opens a connection" means calling or constructing a name in
 *   `CONNECTION_OPENERS`, bare or as a namespace member (`driver.neon(…)`, `new driver.Client(…)`).
 *   An opener outside that list, or reached under a renamed binding, escapes. A local function
 *   sharing a listed name is a false alarm, which fails loudly rather than quietly.
 * - **Dynamic paths.** An `import()` whose argument is not a string literal is not followed.
 * - **Collection-time code**, as above.
 * - A registration hidden inside a wrapper function counts as no registration, which is red, never
 *   green.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIRECTORY = resolve(HERE, "..");
/** The census's own two files name every pattern they search for, so they would classify
 *  themselves: the scanner's synthetic sources spell out both gates, a registration and an opener. */
const OWN_FILES: ReadonlySet<string> = new Set([
  "live-suite-census.test.ts",
  "live-suite-census-scanner.test.ts",
]);
/** The population the censuses sweep had 20 files when the wave was planned; fewer means the
 *  discovery is broken, not that files were deleted. */
const MINIMUM_TEST_FILE_COUNT = 20;

interface ExpectedClassification {
  readonly gate: Gate;
  readonly lock: LockDeclaration;
  readonly reason: string;
}

/** The literal table (T-J7): three exclusive, four shared, two application-database files, and the
 *  files that name a database-URL source without taking the schema lock. Keys are paths under
 *  `tests/`.
 *
 *  **Fourteen rows, not the thirteen of 7E3c S2** (migration-environment-safety-check, 2026-09-28):
 *  `read-database-url.test.ts` joined as a fifth "none" file — a unit test of `readDatabaseUrl` and
 *  `readMigrationDatabaseUrl` that names those functions without ever connecting, same reason
 *  `test-database-url.test.ts` is a "none" file rather than a gated one. Before that,
 *  `share-link-repository.test.ts` joined as the fourth shared file (D3: it writes rows and needs
 *  the schema intact, same reason `design-row-source.test.ts` is shared rather than exclusive), and
 *  before that, T-J5 Amendment B ruling 3's eleven grew to twelve when S3 added
 *  `test-database-schema-status.test.ts` under C-7T-1 (b), the third shared file. The count moves
 *  whenever a live file is added — that is the census working, not drifting. */
const EXPECTED_CLASSIFICATION: Readonly<
  Record<string, ExpectedClassification>
> = {
  "migrate.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops the ledger, forgets rows and synthesises versions",
  },
  "neon-configuration-repository.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops the revision column",
  },
  "neon-configuration-repository.adversarial.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops write_token_hash and asserts a whole-table count",
  },
  "design-row-source.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason: "mints rows and needs the schema intact",
  },
  "backup-restore-round-trip.adversarial.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason: "mints rows and needs the schema intact",
  },
  "test-database-schema-status.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "reads the ledger and the deployed columns, and needs both intact (C-7T-1 (b))",
  },
  "share-link-repository.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes share-link rows through a fresh design per test and needs the schema intact (M7 wave 7E3c D3)",
  },
  "neon-contact-submission-store.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes contact submission rows under ids that carry a marker only tests write, and needs the schema intact",
  },
  "neon-csp-report-store.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason:
      "moves the one shared report cursor, writes report rows under marks of its own and asserts a whole-table row count (M8 wave 8Q2)",
  },
  "delete-csp-reports-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes report rows under marks of its own, removes them only through the guarded helper, asserts no whole-table figure and needs the schema intact (M8 wave 8Q2)",
  },
  "count-csp-reports-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes report rows under marks of its own, removes them only through the guarded helper, asserts no whole-table figure and needs the schema intact (M8 wave 8Q2)",
  },
  "qa-8q2-csp-pattern-differential.adversarial.test.ts": {
    gate: "live test database",
    lock: "none",
    reason:
      "adversarial QA of 8Q2: one read-only select over generate_series per probe, comparing migration 0009's patterns with the code's checks; reads no table, writes and alters nothing (M8 8Q2 QA)",
  },
  "neon-rate-limit-store.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason: "writes counter rows under random keys and needs the schema intact",
  },
  "qa-8e-rate-limit-live.adversarial.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "adversarial QA of 8E: writes counter rows under random keys in its own era and needs the schema intact (M8 8E QA)",
  },
  "qa-8i-contact-submission-live.adversarial.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "adversarial QA of 8I: writes contact submission rows under ids that carry its own marker and needs the schema intact (M8 8I QA)",
  },
  "table-privileges.test.ts": {
    gate: "live test database",
    lock: "none",
    reason:
      "reads the server's privilege catalogue and one system table; writes nothing and touches no table of ours",
  },
  "retried-writes-leave-no-trace.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes rows keyed by random per-run visitors and needs the schema intact",
  },
  "qa-ce-s4-retry.adversarial.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "interleaves writes on fresh per-test designs with lost replies and needs the schema intact (M7C CE S4 QA)",
  },
  "application-role-privileges.test.ts": {
    gate: "DATABASE_URL",
    lock: "none",
    reason:
      "asserts the application role, on the application database (ADR 0008)",
  },
  "write-token-schema.adversarial.test.ts": {
    gate: "DATABASE_URL",
    lock: "none",
    reason: "reads the application database's own schema",
  },
  "test-schema-lock.test.ts": {
    gate: "live test database",
    lock: "none",
    reason:
      "the lock's self-test: contends only on random keys and touches no table",
  },
  "qa-7t-s2b-lock.adversarial.test.ts": {
    gate: "live test database",
    lock: "none",
    reason: "adversarial QA of the lock: random keys only, touches no table",
  },
  "test-database-url.test.ts": {
    gate: "none",
    lock: "none",
    reason:
      "unit test of the resolver: sets its variables and connects nowhere",
  },
  "read-database-url.test.ts": {
    gate: "none",
    lock: "none",
    reason:
      "unit test of the two readers: sets and deletes its own variables, connects nowhere",
  },
  "delete-rate-limit-counters-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes counter rows under random keys in its own era and needs the schema intact",
  },
  "neon-rate-limit-totals.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes counter rows under random keys in its own era and needs the schema intact",
  },
  "delete-contact-submissions-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes synthetic contact rows under ids that carry a marker only this file writes, and needs the schema intact",
  },
  "count-contact-submissions-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "writes synthetic contact rows under ids that carry a marker only this file writes, and needs the schema intact",
  },
  "find-write-token-hashes-for-tests.live.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason:
      "mints design rows under hashes of its own and needs the schema intact",
  },
  "delete-designs-for-tests.test.ts": {
    gate: "none",
    lock: "none",
    reason: "unit test with the driver mocked: connects nowhere",
  },
  "test-database-connection-errors.test.ts": {
    gate: "none",
    lock: "none",
    reason:
      "fake values only, every host ends in .invalid: no database is reachable",
  },
  "qa-8b-test-database-guard.adversarial.test.ts": {
    gate: "none",
    lock: "none",
    reason:
      "adversarial QA of 8B: fake values only, every host ends in .invalid or does not parse (M8 8B QA)",
  },
};

/** Every module `vitest.config.ts` lists in `setupFiles`, as written there. Vitest runs each before
 *  every test file, so one that connects would reach the database outside any file's lock. */
const EXPECTED_SETUP_FILES: readonly string[] = [];

describe("the live-suite census (T-J7)", () => {
  const tree = readTestTree(PACKAGE_DIRECTORY);
  const testFiles = discoverTestFiles(PACKAGE_DIRECTORY).filter(
    (name) => !OWN_FILES.has(name),
  );
  const databaseReaching = databaseReachingFiles(tree, testFiles);

  it("sweeps every file vitest's include resolves, nested directories too", () => {
    expect(testFiles.length).toBeGreaterThanOrEqual(MINIMUM_TEST_FILE_COUNT);
  });

  it("classifies exactly the database-reaching files the table lists — a new one must be added", () => {
    expect(databaseReaching).toEqual(
      Object.keys(EXPECTED_CLASSIFICATION).sort(),
    );
  });

  it("finds no connection in a file the table says connects nowhere", () => {
    const connectingNowhere = Object.entries(EXPECTED_CLASSIFICATION)
      .filter(
        ([, expected]) => expected.gate === "none" && expected.lock === "none",
      )
      .map(([name]) => name);

    expect(connectingNowhere.length).toBeGreaterThan(0);
    expect(
      connectingNowhere.filter((name) => opensConnection(tree, name)),
    ).toEqual([]);
  });

  it("runs no setup module the table does not list, and none that opens a connection", () => {
    const setupFiles = setupFilesOf(vitestConfig.test?.setupFiles);

    expect(setupFiles).toEqual(EXPECTED_SETUP_FILES);
    expect(setupFilesThatConnect(tree, setupFiles)).toEqual([]);
  });

  it("gates every test-database file through live-test-database.ts, and only two on DATABASE_URL", () => {
    const observed = Object.fromEntries(
      databaseReaching.map((name) => [name, gateOf(sourceOf(tree, name))]),
    );

    expect(observed).toEqual(expectedField("gate"));
  });

  it("gives each file its declared lock mode, first at module scope, and every destructive file exclusive", () => {
    const registrations = new Map(
      databaseReaching.map((name) => [
        name,
        lockRegistrationOf(sourceOf(tree, name)),
      ]),
    );
    const observedModes = Object.fromEntries(
      [...registrations].map(([name, registration]) => [
        name,
        registration.mode,
      ]),
    );

    expect(observedModes).toEqual(expectedField("lock"));
    expect(misplacedRegistrations(registrations)).toEqual([]);
    expect(destructiveFilesNotExclusive(tree, registrations)).toEqual([]);
  });
});

function expectedField<Field extends "gate" | "lock">(
  field: Field,
): Record<string, ExpectedClassification[Field]> {
  return Object.fromEntries(
    Object.entries(EXPECTED_CLASSIFICATION).map(([name, expected]) => [
      name,
      expected[field],
    ]),
  );
}
