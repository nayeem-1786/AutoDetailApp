import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import phoneNoRawDisplay from "./eslint-rules/phone-no-raw-display.js";

const eslintConfig = defineConfig([
  // Ignore-only config (must be first; flat config respects ignores additively).
  // .claude/worktrees/** are temporary git worktrees from Claude agents — not application code.
  // docs/hardware/** are standalone CommonJS Node scripts deployed separately to a Windows
  // OptiPlex via PM2 (own package.json + runtime, not part of the Next.js bundle).
  {
    ignores: ["**/worktrees/**/*", "**/docs/hardware/**/*"],
  },
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      // Local plugin housing project-specific lint rules.
      // See docs/dev/PHONE_LINT.md for the phone-format rule rationale.
      phone: {
        rules: {
          "no-raw-display": phoneNoRawDisplay,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Data-fetching in useEffect (call async fn that sets state) is standard React pattern
      "react-hooks/set-state-in-effect": "off",
      // Admin/internal pages use <img> intentionally (dynamic external URLs, no next/image benefit)
      "@next/next/no-img-element": "off",
      // beforeInteractive is valid in App Router layout components
      "@next/next/no-before-interactive-script-outside-document": "off",
      // React compiler strictness — these patterns (ref sync, mutable accumulators in useMemo,
      // dynamic component assignment) are safe and intentional
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      // Phase Lint-Hardening-1: flag raw phone references in JSX.
      // TODO: Upgrade phone/no-raw-display from 'warn' to 'error'
      // after Phase Phone-UX-1 ships and all leaks are resolved.
      "phone/no-raw-display": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
