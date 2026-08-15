// Shared ESLint flat config for the gastos monorepo.
// See ./README.md for the layer-boundary rationale.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/*.config.js",
      "**/*.config.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["**/*.ts", "**/*.tsx"],
      "boundaries/elements": [
        { type: "reference", pattern: "packages/shared/src/reference/**" },
        { type: "ledger-core", pattern: "packages/shared/src/ledger-core/**" },
        { type: "domain", pattern: "packages/shared/src/domain/**" },
        { type: "reporting", pattern: "apps/server/src/reporting/**" },
        { type: "money", pattern: "packages/shared/src/money/**" },
      ],
    },
    rules: {
      // Reporting -> Domain -> Ledger Core -> Reference. One direction only.
      // `money` is a primitive utility importable from any layer.
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            { from: "reference", allow: ["money"] },
            { from: "ledger-core", allow: ["reference", "money"] },
            { from: "domain", allow: ["ledger-core", "reference", "money"] },
            {
              from: "reporting",
              allow: ["domain", "ledger-core", "reference", "money"],
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      // Non-negotiable code rules (see repo CLAUDE.md).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      complexity: ["error", 10],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  prettier,
);
