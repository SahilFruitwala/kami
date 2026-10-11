import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

/** The request's CSP nonce (set by `cspMiddleware` in `src/start.ts`); SSR only. */
function cspNonce(): string | undefined {
  if (typeof window !== "undefined") return undefined;
  try {
    return (getGlobalStartContext() as { cspNonce?: string } | undefined)?.cspNonce;
  } catch {
    return undefined;
  }
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    ssr: { nonce: cspNonce() },
  });
}
