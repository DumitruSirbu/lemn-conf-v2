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
  },
});
