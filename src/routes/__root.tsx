import { createRootRoute, HeadContent, Navigate, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Quarto";

export const Route = createRootRoute({
  notFoundComponent: () => <Navigate to="/" />,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Save blogs and X articles to read later — clean pages, tags, and highlights.",
      },
      { name: "theme-color", content: "#F3EEE4" },
      { property: "og:title", content: APP_NAME },
      {
        property: "og:description",
        content: "Quiet read-later for blogs and X articles.",
      },
      { property: "og:image", content: "/og.jpg" },
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
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Figtree:wght@400;500;600&family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Toaster
          position="bottom-center"
          theme="light"
          toastOptions={{
            className:
              "font-sans !bg-surface !text-ink !border-0 !shadow-[var(--shadow-border)]",
          }}
        />
        <Scripts />
      </body>
    </html>
  ),
});
