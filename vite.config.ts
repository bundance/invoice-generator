import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import { defineConfig } from "vite-plus";

const toolIgnores = [".agents/**", ".codex/**", ".scratch/**", "tools/oxlint/anti-slop/**"];
const rendererRequire = createRequire(import.meta.resolve("@react-pdf/renderer"));
const pdfkitBrowserPath = join(dirname(rendererRequire.resolve("pdfkit")), "pdfkit.browser.js");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        vite: {
          build: {
            lib: {
              entry: "src/infrastructure/electron/main.ts",
              formats: ["cjs"],
              fileName: () => "main.cjs",
            },
          },
          resolve: { alias: { pdfkit: pdfkitBrowserPath } },
        },
      },
      preload: { input: "src/infrastructure/electron/preload.ts" },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      pdfkit: pdfkitBrowserPath,
    },
  },
  fmt: {
    ignorePatterns: toolIgnores,
  },
  lint: {
    ignorePatterns: toolIgnores,
    plugins: ["react", "typescript", "oxc", "vitest", "jsx-a11y"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
    ],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "react/rules-of-hooks": "error",
      "react/only-export-components": "error",
      "typescript/no-explicit-any": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    allowOnly: false,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    retry: 0,
  },
  staged: {
    "*": "vp check --fix",
  },
});
