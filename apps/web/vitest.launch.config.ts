import { defineConfig } from "vitest/config";

// The launch gate's own Vitest run (`pnpm gate:launch-placeholders`). Standalone, not merged with
// `vitest.config.ts`: merging concatenates `include`, which would run the whole suite here. The
// default config's `tests/**/*.test.ts` does not collect `*.launch-check.ts`, so the default
// suite, `pnpm check` and `pnpm ci:local` never run this.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/launch/**/*.launch-check.ts"],
    passWithNoTests: false,
  },
});
