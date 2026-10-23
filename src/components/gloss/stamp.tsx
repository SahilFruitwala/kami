import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * A persimmon seal with a tick that presses in once: the mark for something
 * finished (a toast, an empty inbox). `whenVisible` waits until it scrolls
 * into view before pressing.
 */
export function Stamp({
  size = 56,
  whenVisible,
  className,
}: {
  size?: number;
  whenVisible?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"idle" | "pressed">(whenVisible ? "idle" : "pressed");

  useEffect(() => {
    if (!whenVisible || !ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("pressed");
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [whenVisible]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-state={state}
      className={cn("kami-stamp", className)}
      style={{ width: size, height: size, "--stamp-tilt": "0deg" } as CSSProperties}
    >
      <Check style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.6} />
    </span>
  );
}
