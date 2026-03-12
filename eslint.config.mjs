import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
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
