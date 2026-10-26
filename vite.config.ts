import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

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
            // Libraries mark modules "use client"; that means nothing in the
            // server bundle, and rolldown warns once per module about it.
            rolldownConfig: {
              onwarn(warning, warn) {
                if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
