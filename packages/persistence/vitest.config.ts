import { defineConfig } from "vitest/config";

import { loadEnvLocal } from "./src/load-env.js";

loadEnvLocal();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    // Every live-database file in this package shares one `designs` table, and several assert on a
    // whole-table `count(*)` around an operation. Run in parallel, one file's inserts and its
    // `afterEach` cleanup land between another file's two counts, and the failure is intermittent
    // and reads as a bug in the code under test. Serial files cost a few seconds and remove the
    // whole class.
    fileParallelism: false,
    // Vitest's default is 5 s, which is a local-CPU budget applied to tests that make several
    // sequential round trips to a hosted Postgres. The credential-separation test makes about
    // seven, and it began timing out once Neon's free-tier compute had been idle long enough to
    // suspend — a cold start, not a slow query, and nothing in the code under test. A live-database
    // suite needs a wall-clock budget, so it gets one; a genuine hang still fails, thirty seconds
    // later. Raise this rather than trimming the round trips: each one is a separate thing the
    // predicate is being attacked with.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
