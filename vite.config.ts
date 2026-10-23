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
            // The trip agent streams a multi-step research loop; the default
            // function timeout cuts it off mid-stream ("network error").
            vercel: {
              functionRules: {
                "/api/trips/*/chat": { maxDuration: 300 },
                // Narration runs continue after the response (waitUntil).
                "/api/narrations/**": { maxDuration: 300 },
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
