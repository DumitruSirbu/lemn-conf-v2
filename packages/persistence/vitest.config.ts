import { defineConfig } from "vitest/config";

import { loadEnvLocal } from "./src/load-env.js";

loadEnvLocal();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
