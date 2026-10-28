import { DEFAULT_TOKENS_PER_CREDIT } from "./research/credits.ts";

/**
 * Research needs Firecrawl (search and page reads) and at least one AI model.
 * On Vercel it also needs a run secret so a run can hand itself off to a
 * fresh invocation (docs/adr/0001). When any of these is missing, Research is
 * off: no nav entry, and the research API answers 503. See .env.example.
 * Tested in tests/research-credits.test.mjs.
 */

export type ResearchConfig = {
  firecrawlApiKey: string;
  /** Model tokens that make one research credit. */
  tokensPerCredit: number;
  /** Characters kept per stored source. */
  maxPageChars: number;
  /** Authenticates a run's calls to itself (16+ chars); null off Vercel, where runs never hand off. */
  runSecret: string | null;
  /** Vercel's Protection Bypass for Automation secret, when deployment protection is on. */
  protectionBypass: string | null;
};

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string) => env[name]?.trim() || "";

export const DEFAULT_MAX_PAGE_CHARS = 60_000;

/** A positive integer from the environment, or the fallback when unset or invalid. */
function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = read(env, name);
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * `aiReady` is passed in (from `aiConfigured()`) so this stays free of the
 * model SDKs and can be tested with a plain env object.
 */
export function researchConfig(env: Env = process.env, aiReady: boolean): ResearchConfig | null {
  const firecrawlApiKey = read(env, "FIRECRAWL_API_KEY");
  if (!firecrawlApiKey || !aiReady) return null;
  const secret = read(env, "RESEARCH_RUN_SECRET");
  const onVercel = Boolean(read(env, "VERCEL"));
  if (onVercel && secret.length < 16) return null;
  return {
    firecrawlApiKey,
    tokensPerCredit: positiveInt(env, "RESEARCH_TOKENS_PER_CREDIT", DEFAULT_TOKENS_PER_CREDIT),
    maxPageChars: positiveInt(env, "RESEARCH_MAX_PAGE_CHARS", DEFAULT_MAX_PAGE_CHARS),
    runSecret: secret.length >= 16 ? secret : null,
    protectionBypass: read(env, "VERCEL_AUTOMATION_BYPASS_SECRET") || null,
  };
}
