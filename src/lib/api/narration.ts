import { http } from "./client";
import type { AllowanceEntry } from "@/lib/allowance";

/** The caller's narration allowance (never the Deepgram balance). */
export type AllowanceView = {
  /** Narration is set up on this server. */
  enabled: boolean;
  available: number;
  reserved: number;
  entries: AllowanceEntry[];
};

export const narrationApi = {
  allowance: () => http.get<AllowanceView>("/api/allowance"),
};
