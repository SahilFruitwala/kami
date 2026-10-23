/**
 * Narration needs Deepgram (speech) and a private R2 bucket (storage). When
 * any of these is missing, narration is off: no Create audio, no Listening
 * card, and the narration API answers 503. See .env.example.
 * Tested in scripts/narration-io.test.mjs.
 */

export type NarrationConfig = {
  deepgramApiKey: string;
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };
  /** Authenticates the narration run's calls to itself (16+ chars). */
  runSecret: string;
  /** Vercel's Protection Bypass for Automation secret, when deployment protection is on. */
  protectionBypass: string | null;
};

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string) => env[name]?.trim() || "";

export function narrationConfig(env: Env = process.env): NarrationConfig | null {
  const deepgramApiKey = read(env, "DEEPGRAM_API_KEY");
  const accountId = read(env, "R2_ACCOUNT_ID");
  const accessKeyId = read(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = read(env, "R2_SECRET_ACCESS_KEY");
  const bucket = read(env, "R2_BUCKET");
  const runSecret = read(env, "NARRATION_RUN_SECRET");
  if (!deepgramApiKey || !accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  if (runSecret.length < 16) return null;
  return {
    deepgramApiKey,
    r2: { accountId, accessKeyId, secretAccessKey, bucket },
    runSecret,
    protectionBypass: read(env, "VERCEL_AUTOMATION_BYPASS_SECRET") || null,
  };
}

export const narrationConfigured = (env?: Env) => narrationConfig(env) !== null;
