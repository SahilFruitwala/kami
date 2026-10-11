import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VaultFlashcard, VaultThemes } from "@/lib/api/ai";
import { highlightLine } from "@/lib/ai-text.ts";
import { clipText } from "@/lib/model-fallback.ts";
import { asDocument, generateJson, generateProse } from "@/server/ai";
import { badRequest, HttpError } from "@/server/http";
import { loadArticleForAi, type ArticleForAi } from "@/server/services/ai-articles";

/**
 * Vault helpers over the slips the user is looking at: themes and
 * connections across highlights, study flashcards, and a drafted note for
 * one highlight. The browser sends the (filtered) slips it shows, so
 * highlights that haven't synced yet still count; nothing is stored.
 */

const slipSchema = z.object({
  id: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(1500),
  note: z.string().max(1000).default(""),
  title: z.string().max(300).default(""),
  author: z.string().max(200).default(""),
});

export const vaultSlipsInput = z.object({
  slips: z.array(slipSchema).min(1, "Pick some highlights first.").max(150),
});

export const draftNoteInput = z.object({
  articleId: z.string().min(1).max(2000),
  text: z.string().trim().min(1).max(1500),
});

type Slip = z.output<typeof slipSchema>;

/** Slips as numbered lines (`s1`, `s2`…) so the model cites short, checkable ids. */
function slipDocument(slips: Slip[]): { doc: string; idFor: Map<string, string> } {
  const idFor = new Map<string, string>();
  const lines = slips.map((s, i) => {
    const key = `s${i + 1}`;
    idFor.set(key, s.id);
    const source = [s.author, s.title].filter(Boolean).join(", ");
    return `[${key}] ${highlightLine(s)}${source ? ` (${source})` : ""}`;
  });
  return { doc: asDocument(lines.join("\n")), idFor };
}

const mapIds = (keys: string[], idFor: Map<string, string>) => [
  ...new Set(keys.map((k) => idFor.get(k.replace(/[[\]\s]/g, ""))).filter((v): v is string => !!v)),
];

const themesSchema = z.object({
  themes: z
    .array(
      z.object({
        title: z.string().describe("Two to five words."),
        insight: z.string().describe("One or two sentences on what these highlights say together."),
        slips: z.array(z.string()).describe("Ids like s3 of the highlights in this theme."),
      }),
    )
    .describe("Three to six themes, most prominent first."),
  connections: z
    .array(
      z.object({
        insight: z
          .string()
          .describe("A surprising link or tension between highlights from different sources."),
        slips: z.array(z.string()),
      }),
    )
    .describe("Up to three connections."),
  questions: z.array(z.string()).describe("Two or three open questions worth exploring next."),
});

export async function vaultThemes(
  _userId: string,
  { slips }: z.output<typeof vaultSlipsInput>,
): Promise<VaultThemes> {
  if (slips.length < 3) throw badRequest("Themes need at least three highlights.");
  const { doc, idFor } = slipDocument(slips);
  const { output } = await generateJson(themesSchema, {
    instructions: [
      "You help a reader see patterns in the passages they highlighted, with their own notes.",
      "Group the highlights into themes and point out connections between different sources.",
      "Ground everything in the highlights; refer to them only by their ids (s1, s2…).",
      "Write in the highlights' language, plainly, without flattery.",
    ].join("\n"),
    prompt: doc,
    maxOutputTokens: 1600,
  });
  return {
    themes: output.themes
      .map((t) => ({
        title: t.title.trim(),
        insight: t.insight.trim(),
        slipIds: mapIds(t.slips, idFor),
      }))
      .filter((t) => t.title && t.slipIds.length)
      .slice(0, 6),
    connections: output.connections
      .map((c) => ({ insight: c.insight.trim(), slipIds: mapIds(c.slips, idFor) }))
      .filter((c) => c.insight && c.slipIds.length >= 2)
      .slice(0, 3),
    questions: output.questions
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

const flashcardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().describe("A question or prompt that tests the idea, not the wording."),
        back: z.string().describe("A short answer, one to three sentences."),
        slip: z.string().describe("Id (s1, s2…) of the highlight the card comes from."),
      }),
    )
    .describe("One card per idea worth remembering; skip highlights with nothing to learn."),
});

const MAX_CARDS = 40;

export async function vaultFlashcards(
  _userId: string,
  { slips }: z.output<typeof vaultSlipsInput>,
): Promise<{ cards: VaultFlashcard[] }> {
  const batch = slips.slice(0, MAX_CARDS);
  const { doc, idFor } = slipDocument(batch);
  const { output } = await generateJson(flashcardsSchema, {
    instructions: [
      "You turn a reader's highlights into spaced-repetition flashcards.",
      "Each card tests understanding of one idea from one highlight (use its note as a hint to what mattered).",
      "Keep fronts short and specific; never just ask to complete the quote.",
      "Write in the highlights' language.",
    ].join("\n"),
    prompt: doc,
    maxOutputTokens: 3000,
  });
  const cards: VaultFlashcard[] = [];
  for (const card of output.cards) {
    const slipId = idFor.get(card.slip.replace(/[[\]\s]/g, ""));
    if (!slipId || !card.front.trim() || !card.back.trim()) continue;
    cards.push({ front: card.front.trim(), back: card.back.trim(), slipId });
    if (cards.length >= MAX_CARDS) break;
  }
  return { cards };
}

/** The article text around a passage, so a note can draw on its context. */
function passageContext(text: string, passage: string, radius = 1500): string {
  const at = text.toLowerCase().indexOf(passage.slice(0, 80).toLowerCase());
  if (at < 0) return clipText(text, radius * 2);
  return text.slice(Math.max(0, at - radius), at + passage.length + radius);
}

export async function draftHighlightNote(
  userId: string,
  { articleId, text }: z.output<typeof draftNoteInput>,
): Promise<{ note: string }> {
  // Slips inked by hand may have little or no article text: draft from the passage alone.
  let article: ArticleForAi | null = null;
  try {
    article = await loadArticleForAi(userId, articleId);
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 400)) throw err;
  }
  const { text: note } = await generateProse({
    instructions: [
      "You draft a short margin note for a passage the reader highlighted. The reader will edit it.",
      "In two to four plain sentences: restate the idea in your own words, then why it matters or what it connects to in the article.",
      "No headings, no lists, no quoting the passage back. Use the passage's language.",
    ].join("\n"),
    prompt: [
      `Highlighted passage:\n${asDocument(text)}`,
      ...(article
        ? [
            "",
            `Surrounding text from “${article.title}”:`,
            asDocument(passageContext(article.text, text)),
          ]
        : []),
    ].join("\n"),
    maxOutputTokens: 400,
  });
  return { note: note.slice(0, 1000) };
}
