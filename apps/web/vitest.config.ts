import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      // Route handlers import through Next's `@/*` path alias, which vitest does not read from
      // `tsconfig.json`. Mirrored here so a route can be exercised as a module under test.
      "@": resolve(import.meta.dirname, "./src"),
      // `server-only` throws unless it detects Next's React Server Components bundler condition,
      // which vitest doesn't set — modules that import it (e.g. `lib/server/*.ts`) are exercised
      // here as plain Node modules, so the guard itself is a no-op in tests, not the behaviour
      // under test.
      "server-only": resolve(
        import.meta.dirname,
        "./tests/support/server-only-stub.ts",
      ),
    },
  },
});
