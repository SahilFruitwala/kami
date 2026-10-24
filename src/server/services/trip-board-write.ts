import "@tanstack/react-start/server-only";
import { clearTripSnapshot } from "@/server/services/trip-undo";

/**
 * Board (HTTP) writes go through here so a person's edit clears the agent
 * undo snapshot. The trip agent calls the trips service directly and keeps
 * its undo point.
 */
export async function afterBoardWrite<T>(
  userId: string,
  tripId: string,
  run: () => Promise<T>,
): Promise<T> {
  const result = await run();
  await clearTripSnapshot(userId, tripId);
  return result;
}
