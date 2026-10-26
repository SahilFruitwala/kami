import "@tanstack/react-start/server-only";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { getDb } from "@/lib/db.server";
import { researchModel, type ResearchModelTier } from "@/lib/llm.server.ts";
import { cachedAnswer, storeAnswer } from "@/lib/research-model-cache-db.server.ts";
import { estimateTokens, modelCacheKey } from "@/lib/research/model-calls.ts";
import { UNTRUSTED_GUARD, aiError } from "@/server/ai";
import { RunStepError, type Meter } from "./runs";

/**
 * Every model call a research run makes: the tier's model chain, structured
 * output checked against a zod schema, the answer cache in front, and the
 * run's budget around it (checked before the call with a high estimate,
 * charged after with what the provider reported). A cache hit makes no call
 * and costs nothing.
 *
 * Research prompts carry scraped pages written by strangers: they wrap them
 * with `asDocument` (src/server/ai.ts), and the shared guard tells the model
 * to treat them as data, never as instructions.
 */

export type ModelCall<S extends z.ZodType> = {
  tier: ResearchModelTier;
  schema: S;
  /** Bumped whenever the prompt or schema changes, so old cached answers stop matching. */
  promptVersion: string;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
};

export type GenerateResult = {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
};

/** The provider call itself; swappable so tests never reach a provider. */
export type Generate = (
  model: LanguageModel,
  call: Omit<ModelCall<z.ZodType>, "tier" | "promptVersion">,
) => Promise<GenerateResult>;

const liveGenerate: Generate = async (model, call) => {
  const result = await generateText({
    model,
    instructions: `${call.instructions}\n\n${UNTRUSTED_GUARD}`,
    prompt: call.prompt,
    output: Output.object({ schema: call.schema }),
    maxOutputTokens: call.maxOutputTokens,
    temperature: call.temperature ?? 0.2,
    maxRetries: 1,
    // Short, structured tasks: a reasoning model would spend the output
    // budget thinking (and the run's credits) and return no text.
    providerOptions: { openrouter: { reasoning: { effort: "none" } } },
  });
  const usage = {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    modelId: result.response.modelId,
  };
  if (result.finishReason !== "stop" && !result.text) {
    return { output: null, ...usage };
  }
  return { output: result.output, ...usage };
};

/**
 * Run one structured model call for a research run and return its parsed
 * output. Throws `BudgetExceededError` (from the meter) before calling when
 * the worst case doesn't fit, and `RunStepError` with a user-facing message
 * when the provider fails or answers with something that doesn't parse.
 */
export async function callModel<S extends z.ZodType>(
  meter: Meter,
  call: ModelCall<S>,
  generate: Generate = liveGenerate,
): Promise<z.output<S>> {
  const tier = researchModel(call.tier);
  if (!tier) throw new RunStepError("AI isn't set up on this server.");

  const sent = {
    instructions: call.instructions,
    prompt: call.prompt,
    maxOutputTokens: call.maxOutputTokens,
    temperature: call.temperature ?? 0.2,
  };
  const key = modelCacheKey(tier.id, call.promptVersion, sent);
  const db = await getDb();
  const hit = await cachedAnswer(db, key);
  if (hit !== null) {
    const parsed = call.schema.safeParse(hit);
    if (parsed.success) return parsed.data;
  }

  meter.ensureBudget({
    tokensIn: estimateTokens(`${call.instructions}\n${UNTRUSTED_GUARD}\n${call.prompt}`),
    tokensOut: call.maxOutputTokens,
  });

  let result: GenerateResult;
  try {
    result = await generate(tier.model, { ...sent, schema: call.schema });
  } catch (err) {
    console.error(`[research] ${tier.id} failed`, err);
    throw new RunStepError(aiError(err).message);
  }
  // Charged even when the answer is unusable: the provider billed it.
  await meter.recordSpend({ tokensIn: result.inputTokens, tokensOut: result.outputTokens });

  const parsed = call.schema.safeParse(result.output);
  if (!parsed.success) {
    console.error(
      `[research] ${result.modelId} answered off-schema`,
      parsed.error.issues.slice(0, 3),
    );
    throw new RunStepError(
      "The AI returned an answer that couldn't be used. Try again in a moment.",
    );
  }
  await storeAnswer(db, {
    key,
    model: result.modelId,
    output: parsed.data,
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
  });
  return parsed.data;
}
