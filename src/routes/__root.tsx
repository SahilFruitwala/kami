import { createRootRoute, HeadContent, Navigate, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme.ts";
import appCss from "../styles.css?url";

const APP_NAME = "Quarto";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('quarto-theme');var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`;

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
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#F3EEE4" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#161310" },
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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        <AuthProvider>
          <ThemeShell />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});

function ThemeShell() {
  const { theme } = useTheme();
  return (
    <>
      <Outlet />
      <Toaster
        position="bottom-center"
        theme={theme === "dark" ? "dark" : "light"}
        toastOptions={{
          className:
            "font-sans !bg-surface !text-ink !border-0 !shadow-[var(--shadow-border)]",
        }}
      />
    </>
  );
}
