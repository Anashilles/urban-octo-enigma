import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // three.js / React Three Fiber code mutates scene-graph objects imperatively by
    // design (renderer settings, materials, raycasters). The React Compiler is not
    // enabled in this project, so its immutability rule does not apply here.
    files: ["src/three/**/*.{ts,tsx}"],
    rules: { "react-hooks/immutability": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "src/generated/**",
    ".data/**",
    "playwright-report/**",
    "test-results/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
