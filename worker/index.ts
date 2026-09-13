/**
 * Cloudflare Workers entry for the Quarto API.
 * Deploy: `npm run worker:deploy` (requires `wrangler login`).
 */
import { createQuartoApi } from "../src/server/quarto-api.ts";

const app = createQuartoApi();

export default {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) => app.fetch(request, env, ctx),
};
