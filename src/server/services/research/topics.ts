import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { researchModel } from "@/lib/llm.server";
import { researchCreditBalance } from "@/lib/research-credits-db.server.ts";
import {
  TOPIC_NAME_MAX,
  createTopic,
  deleteTopic,
  getTopic,
  listRuns,
  listTopics,
  renameTopic,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import type {
  ResearchStatus,
  ResearchTopic,
  ResearchTopicDetail,
  ResearchTopicSummary,
  RunSummary,
} from "@/lib/api/research.ts";
import { HttpError, notFound } from "@/server/http";
import { getResearchCredits, researchConfigured } from "./credits";

/**
 * The Research product API's home: status (is Research on here, what's my
 * balance), credits, and topics. Every route but `status` answers 404 while
 * Research is off, so the section doesn't exist for that server. Everything
 * is owner-scoped: another user's topic is a 404, never a 403.
 */

/** Every product route but `status` calls this first. */
export function requireResearch(): void {
  if (!researchConfigured()) throw notFound();
}

export async function researchStatus(userId: string): Promise<ResearchStatus> {
  if (!researchConfigured()) return { enabled: false, balance: 0, writerModel: false };
  const balance = await researchCreditBalance(await getDb(), userId);
  const writer = researchModel("writer")?.id;
  return {
    enabled: true,
    balance,
    writerModel: Boolean(writer && writer !== researchModel("worker")?.id),
  };
}

export async function researchCredits(userId: string) {
  requireResearch();
  return getResearchCredits(userId);
}

export const topicNameInput = z.object({ name: z.string().trim().min(1).max(TOPIC_NAME_MAX) });

const time = (d: Date | null) => (d ? d.getTime() : null);

export function topicView(t: TopicRow): ResearchTopic {
  return {
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  };
}

export function runSummary(r: RunRow): RunSummary {
  return {
    id: r.id,
    topicId: r.topicId,
    kind: r.kind,
    depth: r.depth,
    state: r.state,
    stopReason: r.stopReason,
    seed: r.input.seed,
    addedBy: r.input.link ? "link" : "plan",
    ideasNew: r.progress.ideasNew ?? 0,
    ideasTouched: r.progress.ideasTouched ?? 0,
    quotes: r.progress.quotes ?? 0,
    chargedCredits: r.chargedCredits,
    createdAt: r.createdAt.getTime(),
    started: r.startedAt !== null,
    finishedAt: time(r.finishedAt),
  };
}

export async function researchTopics(userId: string): Promise<ResearchTopicSummary[]> {
  requireResearch();
  const topics = await listTopics(await getDb(), userId);
  return topics.map((t) => ({
    ...topicView(t),
    liveIdeas: t.liveIdeas,
    lastRunAt: time(t.lastRunAt),
  }));
}

export async function newResearchTopic(userId: string, name: string): Promise<ResearchTopic> {
  requireResearch();
  return topicView(await createTopic(await getDb(), userId, name));
}

/** The topic, or 404 when it isn't the caller's. */
export async function ownTopic(userId: string, topicId: string): Promise<TopicRow> {
  requireResearch();
  const topic = await getTopic(await getDb(), userId, topicId);
  if (!topic) throw notFound("Topic not found");
  return topic;
}

export async function researchTopic(userId: string, topicId: string): Promise<ResearchTopicDetail> {
  const topic = await ownTopic(userId, topicId);
  const runs = await listRuns(await getDb(), userId, topicId, 20);
  return { topic: topicView(topic), runs: runs.map(runSummary) };
}

export async function renameResearchTopic(
  userId: string,
  topicId: string,
  name: string,
): Promise<ResearchTopic> {
  requireResearch();
  const db = await getDb();
  if (!(await renameTopic(db, userId, topicId, name))) throw notFound("Topic not found");
  return topicView((await getTopic(db, userId, topicId)) as TopicRow);
}

/** Deletes the topic and everything in it; cached sources stay. Refused while a run is working. */
export async function deleteResearchTopic(userId: string, topicId: string): Promise<void> {
  await ownTopic(userId, topicId);
  const db = await getDb();
  const runs = await listRuns(db, userId, topicId, 20);
  if (runs.some((r) => r.state === "queued" || r.state === "running")) {
    throw new HttpError(409, "Stop the running research before deleting this topic.");
  }
  await deleteTopic(db, userId, topicId);
}
