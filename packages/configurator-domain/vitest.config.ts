import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    // The suite is pure computation with sweeps of up to hundreds of thousands of generated rooms. A
    // timeout here guards against a hang, not against a slow test: on the 2-core CI runner these tests
    // ran 2-3x their local time, and a 5 s default failed a 6 s sweep at 12.9 s.
    testTimeout: 30_000,
  },
});
