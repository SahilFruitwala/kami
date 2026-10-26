import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const QUIET_BUILD_WARNINGS = new Set([
  "EVAL",
  "CIRCULAR_DEPENDENCY",
  "THIS_IS_UNDEFINED",
  "EMPTY_BUNDLE",
  "MODULE_LEVEL_DIRECTIVE",
]);

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Narration runs continue after the response (waitUntil).
            vercel: { functionRules: { "/api/narrations/**": { maxDuration: 300 } } },
            // Replaces Nitro's own filter, so keep its codes and add
            // MODULE_LEVEL_DIRECTIVE: libraries mark modules "use client",
            // which means nothing in the server bundle.
            rolldownConfig: {
              onwarn(warning, warn) {
                if (!QUIET_BUILD_WARNINGS.has(warning.code ?? "")) warn(warning);
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
