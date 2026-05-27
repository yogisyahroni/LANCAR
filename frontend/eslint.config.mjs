import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
  ]),
  {
    // Project-level rule overrides — tuned for TEMBUS customer portal codebase.
    // Rationale: React Compiler plugin rules (set-state-in-effect, immutability,
    // purity) are experimental and generate false-positives on valid patterns
    // (e.g. fetch in useEffect).  Downgrade them to "warn" so CI can run
    // --max-warnings 0 is NOT set, letting the build pass while we track them.
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",

      // JS
      "prefer-const": "warn",
      "no-var": "error",

      // React Compiler experimental rules — downgrade to warn
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/exhaustive-deps": "warn",

      // JSX
      "react/no-unescaped-entities": "warn",

      // Next.js
      "@next/next/no-img-element": "warn",

      // rules-of-hooks is a real correctness error — keep as error
      "react-hooks/rules-of-hooks": "error",
    },
  },
]);

export default eslintConfig;
