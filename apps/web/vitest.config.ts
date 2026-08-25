import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      // `server-only` throws unless it detects Next's React Server Components bundler condition,
      // which vitest doesn't set — modules that import it (e.g. `lib/server/*.ts`) are exercised
      // here as plain Node modules, so the guard itself is a no-op in tests, not the behaviour
      // under test.
      "server-only": resolve(
        import.meta.dirname,
        "./src/test-support/server-only-stub.ts",
      ),
    },
  },
});
