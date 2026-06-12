import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "unused-imports": unusedImports
    },
    rules: {
      // Drift guards: unused imports are auto-removable errors; unused vars warn
      // (prefix intentionally-unused with `_`). Replaces the base no-unused-vars.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            "{}": {
              message:
                "Use a specific object shape (Record<string, unknown> or a typed interface)."
            },
            Object: {
              message: "Use 'object' or a concrete type instead of Object."
            },
            Function: {
              message: "Declare a function signature instead of Function."
            }
          }
        }
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 8
        }
      ]
    }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "src/lib/contracts/plutus.json",
    "src/generated/**"
  ])
]);
