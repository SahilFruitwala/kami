import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

export function KindleFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[22rem] rounded-[2rem] bg-ink p-3 shadow-device",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.25rem] bg-surface">
        {children}
      </div>
      <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-ink-soft" />
    </div>
  );
}
