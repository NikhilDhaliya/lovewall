import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // User content (photos, logos, posters) comes from storage through redirects: plain <img> is intended.
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Node preload scripts are CommonJS on purpose (loaded with `node --require`).
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "playwright-report/**", "test-results/**"]),
]);
