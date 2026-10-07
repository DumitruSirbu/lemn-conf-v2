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
    // Guards against a hang, not against a slow test, as in the domain package: the 2-core CI runner
    // ran a property file 4.5x its local time, and the 5 s default failed a 1.2 s test there (ci run
    // 37544936477).
    testTimeout: 30_000,
  },
  // Bundle next-intl so the alias below is applied to its extensionless `next/server` import.
  ssr: { noExternal: ["next-intl"] },
  resolve: {
    alias: {
      // next-intl's middleware build imports this extensionless subpath. Next resolves it in the
      // application compiler; Node's ESM loader used by Vitest needs the concrete entry point.
      "next/server": resolve(
        import.meta.dirname,
        "./node_modules/next/server.js",
      ),
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
