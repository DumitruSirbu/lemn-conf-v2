import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
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
);
