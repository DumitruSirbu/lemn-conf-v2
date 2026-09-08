import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // `tsconfig.json` sets `jsx: "preserve"` because Next does its own JSX transform. Vitest has no
  // such downstream step, so a `.tsx` module imported by a test would arrive at the runtime as raw
  // JSX. Named here rather than in the tsconfig, which is the application's contract with Next.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The `.dom.test.ts` files declare `happy-dom` per file in a docblock rather than moving the
    // whole project onto it; this is the one thing they all need and none of them should own.
    setupFiles: ["./tests/support/vitest.setup.ts"],
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
