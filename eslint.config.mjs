import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Flat ESLint config for the TanStack Start app. */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Browser code: no server modules, and request schemas only as types
  // (their runtime — and Zod — must not ship to the client).
  {
    files: ["src/components/**", "src/hooks/**", "src/routes/**/*.tsx", "src/lib/api/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "**/*.server", "**/*.server.ts"],
              message: "Server-only module: call it through /api/* instead.",
            },
            {
              group: ["@/lib/api/schemas/*", "./schemas/*"],
              allowTypeImports: true,
              message: "Import request schemas with `import type` and use z.input<>.",
            },
          ],
        },
      ],
    },
  },
  // Components and pages get server data through hooks in src/hooks, so query
  // keys, cache options and invalidation live in one place.
  {
    files: ["src/components/**", "src/routes/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-query",
              importNames: ["useQuery", "useMutation", "useQueryClient", "useInfiniteQuery"],
              message: "Wrap queries and mutations in a hook under src/hooks.",
            },
          ],
        },
      ],
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
