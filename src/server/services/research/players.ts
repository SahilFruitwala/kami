import "@tanstack/react-start/server-only";
import { getDb } from "@/lib/db.server";
import { runEvidence } from "@/lib/research-db.server.ts";
import { notePlayers } from "@/lib/research-players-db.server.ts";
import type { ResearchStep } from "./runs";

/**
 * `players`: every product named in the run's quotes becomes a Player of the
 * topic (once, by `name_key`), linked to the quotes that name it. Plain code,
 * no model and no spend, so Discover runs note competitors as they go and
 * Explore fills them in afterwards.
 */
export function playersStep(): ResearchStep {
  return {
    name: "players",
    // Code only and free, so a stopped run still notes the products it read about.
    final: true,
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const evidence = (await runEvidence(db, run.id)).filter((e) => e.names.length);
      const created = await notePlayers(
        db,
        { userId: run.userId, topicId: run.topicId },
        evidence.map((e) => ({ id: e.id, names: e.names })),
      );
      await ctx.saveProgress({ playersNew: created });
      return true;
    },
  };
}
