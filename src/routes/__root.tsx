import type { ReactNode } from "react";
import {
  createRootRoute,
  HeadContent,
  Navigate,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/provider";
import { getAppQueryClient } from "@/lib/query-client";
import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme.ts";
import appCss from "../styles.css?url";
import { ConfirmHost } from "@/components/confirm-dialog.tsx";

const APP_NAME = "KAMI";

// Canonical public origin for absolute OG URLs. Set VITE_PUBLIC_HOSTNAME in
// production (e.g. kami.sahilfruitwala.com); falls back to the production host.
const PUBLIC_HOST = import.meta.env.VITE_PUBLIC_HOSTNAME || "kami.sahilfruitwala.com";
const SITE_URL = `https://${String(PUBLIC_HOST)
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "")}`;
const OG_IMAGE = `${SITE_URL}/og.webp`;

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('quarto-theme');var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export const Route = createRootRoute({
  // Must stay `true`: children can only opt to *more* restrictive SSR,
  // so a `false` here would force the landing page (`/`) client-only too.
  // App routes opt out via `defaultSsr: false` in src/start.ts.
  ssr: true,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <Navigate to="/" />,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "KAMI — Save Anything Worth Reading" },
      {
        name: "description",
        content:
          "KAMI is a quiet read-later app for blogs and X articles — save a link, read a clean distraction-free page, highlight, tag, and find it in seconds.",
      },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#faf8f4" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#16130f" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: "KAMI — Save Anything Worth Reading" },
      {
        property: "og:description",
        content:
          "Paste a link and get a clean, distraction-free page — then tag it, highlight it, and find it in seconds.",
      },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1376" },
      { property: "og:image:height", content: "768" },
      { property: "og:image:type", content: "image/webp" },
      { property: "og:image:alt", content: "KAMI — a quiet read-later app" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "KAMI — Save Anything Worth Reading" },
      {
        name: "twitter:description",
        content:
          "A quiet read-later app for blogs and X articles. Save, read clean pages, highlight, and organize.",
      },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "KAMI — a quiet read-later app" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased gloss" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* ScriptOnce carries the CSP nonce (router `ssr.nonce`). */}
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={getAppQueryClient()}>
      <AuthProvider>
        <ThemeShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ThemeShell() {
  const { theme } = useTheme();
  return (
    <>
      <Outlet />
      <ConfirmHost />
      <Toaster
        position="bottom-center"
        closeButton
        theme={theme === "dark" ? "dark" : "light"}
        toastOptions={{
          className:
            "font-sans !rounded-2xl !bg-surface !text-ink !border-0 !shadow-[var(--shadow-raised)]",
        }}
      />
    </>
  );
}
