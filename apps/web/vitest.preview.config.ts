import { defineConfig } from "vitest/config";

import base from "./vitest.config";

// The owner's preview of the shop's notice (`pnpm --filter @lemnaria/web preview:lead-notice`). The default config's
// module resolution, with its `test` block replaced rather than merged: `mergeConfig` concatenates `include`, which
// would run the whole suite here. The default `tests/**/*.test.ts` does not collect `*.preview.ts`, so `test`, `check`
// and `ci:local` never run this.
export default defineConfig({
  ...base,
  test: {
    environment: "node",
    include: ["tests/preview/**/*.preview.ts"],
    passWithNoTests: false,
  },
});
