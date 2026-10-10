import { http } from "./client";

/** Which AI features this server can run (each needs a provider key). */
export type AiStatus = { enabled: boolean; semanticSearch: boolean };

export const aiApi = {
  status: () => http.get<AiStatus>("/api/ai/status"),
};
