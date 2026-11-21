import { useCallback, useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { authEnabled } from "@/lib/auth/client.ts";
import { useCurrentUser } from "@/lib/auth/use-current-user.ts";
import {
  CHARACTER_METADATA_KEY,
  CHARACTER_STORAGE_KEY,
  CHARACTERS,
  characterById,
  characterForSeed,
  isCharacterId,
  type CharacterId,
} from "@/lib/characters.ts";
import { readLocal, writeLocal } from "@/lib/local-pref.ts";

function readStoredCharacter(): CharacterId | null {
  const stored = readLocal(CHARACTER_STORAGE_KEY);
  return isCharacterId(stored) ? stored : null;
}

/**
 * Portrait shown in the rail, header, and settings. An explicit pick (Clerk
 * metadata, then this device) wins; otherwise a hashed default replaces the
 * generic silhouette. A real uploaded photo is left alone until they pick.
 */
export function useCharacter() {
  const appUser = useCurrentUser();
  const [localId, setLocalId] = useState<CharacterId | null>(readStoredCharacter);
  const [saving, setSaving] = useState(false);

  let clerkUser: ReturnType<typeof useUser>["user"] = null;
  if (authEnabled) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
    clerkUser = useUser().user;
  }

  const metaRaw = clerkUser?.unsafeMetadata?.[CHARACTER_METADATA_KEY];
  const metaId = isCharacterId(metaRaw) ? metaRaw : null;
  const explicitId = metaId ?? localId;
  const hasCustomPhoto = Boolean(clerkUser?.hasImage) && !explicitId;
  const displayId =
    explicitId ?? (hasCustomPhoto ? null : characterForSeed(appUser?.id ?? "guest"));
  const src = displayId
    ? characterById(displayId).src
    : (appUser?.profileImageUrl ?? characterById(characterForSeed("guest")).src);

  const select = useCallback(
    async (id: CharacterId) => {
      setLocalId(id);
      writeLocal(CHARACTER_STORAGE_KEY, id);
      if (!clerkUser) return;
      setSaving(true);
      try {
        await clerkUser.update({
          unsafeMetadata: { ...clerkUser.unsafeMetadata, [CHARACTER_METADATA_KEY]: id },
        });
        const res = await fetch(characterById(id).src);
        if (!res.ok) throw new Error("avatar fetch failed");
        const blob = await res.blob();
        await clerkUser.setProfileImage({ file: blob });
      } catch {
        toast.error("Could not save your character — try again.");
      } finally {
        setSaving(false);
      }
    },
    [clerkUser],
  );

  return {
    characters: CHARACTERS,
    displayId,
    src,
    saving,
    select,
  };
}
