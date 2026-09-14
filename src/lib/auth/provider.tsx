import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/tanstack-react-start";

/**
 * App-wide Clerk provider mounted once in `src/routes/__root.tsx` inside `<body>`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
