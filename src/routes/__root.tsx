import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Navigate, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/provider";
import { getAppQueryClient } from "@/lib/query-client";
import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme.ts";
import appCss from "../styles.css?url";

const APP_NAME = "KAMI";

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
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#F3EEE4" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#161310" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: "KAMI — Save Anything Worth Reading" },
      {
        property: "og:description",
        content:
          "Paste a link and get a clean, distraction-free page — then tag it, highlight it, and find it in seconds.",
      },
      { property: "og:image", content: "/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "KAMI — Save Anything Worth Reading" },
      {
        name: "twitter:description",
        content:
          "A quiet read-later app for blogs and X articles. Save, read clean pages, highlight, and organize.",
      },
      { name: "twitter:image", content: "/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
      <Toaster
        position="bottom-center"
        closeButton
        theme={theme === "dark" ? "dark" : "light"}
        toastOptions={{
          className:
            "font-sans !bg-surface !text-ink !border-0 !shadow-[var(--shadow-border)]",
        }}
      />
    </>
  );
}
