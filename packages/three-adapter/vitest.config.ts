import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Read-only reference geometry, imported by the structural-parity suite only.
      "@reference/kitchen-parts": fileURLToPath(
        new URL(
          "../../design-source/Modern Kitchen Cabinets 3D (3)/kitchen-parts.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
