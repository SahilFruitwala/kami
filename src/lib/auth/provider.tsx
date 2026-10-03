import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/tanstack-react-start";

/**
 * App-wide Clerk provider mounted once in `src/routes/__root.tsx` inside `<body>`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#9c4a30",
          borderRadius: "12px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
