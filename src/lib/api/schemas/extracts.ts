import { z } from "zod";

/** Extract request bodies (server validates; client derives types via `z.input`). */

const name = z.string().trim().max(120);
const url = z.string().trim().min(4, "Paste the page URL.").max(2000);
const question = z
  .string()
  .trim()
  .min(8, "Describe what to pull from the page.")
  .max(2000, "Keep the question under 2000 characters.");

export const createSourceInput = z.object({ name: name.optional(), url, question });
export const updateSourceInput = z.object({
  name: name.optional(),
  url: url.optional(),
  question: question.optional(),
});
export const runInput = z.object({ fresh: z.boolean().optional() });
