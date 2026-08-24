import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "design-source/**",
      "catalog-seed/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain-JS tooling scripts: no TypeScript program backs them, so the type-aware rules cannot
    // run. They drive a browser, so callbacks handed to `page.evaluate` reference DOM globals.
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        HTMLCanvasElement: "readonly",
        Image: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["packages/configurator-domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "next",
                "next/*",
                "three",
                "three/*",
                "@react-three/*",
                "@lemnaria/three-adapter",
                "@lemnaria/three-adapter/*",
                "@lemnaria/catalog-data",
                "@lemnaria/catalog-data/*",
                "@lemnaria/web",
                "@lemnaria/web/*",
                "../../apps/*",
                "../../apps/**",
                "../three-adapter",
                "../three-adapter/*",
                "../catalog-data",
                "../catalog-data/*",
              ],
              message:
                "The configurator domain must remain independent of React, Next.js, Three.js, UI, adapter, and catalog-data implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    // The adapter may own Three.js, but nothing above it: it renders what it is given and never
    // reaches into React, Next.js or the application shell (ARCHITECTURE_PROPOSAL.md §3).
    files: ["packages/three-adapter/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@react-three/*",
                "@lemnaria/web",
                "@lemnaria/web/*",
                "../../apps/*",
                "../../apps/**",
              ],
              message:
                "The three-adapter must stay free of React, Next.js and the application shell; it consumes scene contracts and returns Three.js objects.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@lemnaria/three-adapter/*",
                "@lemnaria/configurator-domain/*",
                "../../packages/*",
                "../../packages/**",
                "**/design-source/**",
              ],
              message:
                "Import workspace packages through their public entry point; design-source is reference material, not a runtime dependency.",
            },
          ],
        },
      ],
    },
  },
);
