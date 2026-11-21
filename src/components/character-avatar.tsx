import { UserButton } from "@/lib/auth/gates.tsx";
import { useCharacter } from "@/hooks/use-character.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The portrait the rest of the chrome uses. When signed in, Clerk's account
 * menu still opens from the same circle — the default silhouette is just
 * hidden underneath the chosen character.
 */
export function CharacterAvatar({
  className,
  menu = true,
}: {
  className?: string;
  /** When false, render the picture only (settings preview). */
  menu?: boolean;
}) {
  const { src } = useCharacter();
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full",
        className ?? "size-8",
      )}
    >
      <img src={src} alt="" className="size-full object-cover" draggable={false} />
      {menu ? (
        <span className="absolute inset-0">
          <UserButton overlay />
        </span>
      ) : null}
    </span>
  );
}
