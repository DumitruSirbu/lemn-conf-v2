import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Reference geometry, imported by the structural-parity suite only. Vendored into this
      // package rather than read out of `design-source/`: that folder is a supplier deliverable
      // that leaves the repository once the port is finished, and the fidelity gate must not stop
      // working when it does.
      "@reference/kitchen-parts": fileURLToPath(
        new URL("./reference/kitchen-parts.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
