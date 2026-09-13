import { cn } from "@/lib/utils.ts";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-paper-warm", className)}
      {...props}
    />
  );
}

export { Skeleton };
