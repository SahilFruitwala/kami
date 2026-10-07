import { createFileRoute } from "@tanstack/react-router";
import { hookHandler, readJsonCapped } from "@/server/hooks";
import { INBOUND_MAX_BYTES, ingestInboundEmail } from "@/server/feeds/newsletter";

/** Inbound newsletter webhook (Postmark inbound JSON or the generic shape). */
export const Route = createFileRoute("/api/hooks/inbound-email")({
  server: {
    handlers: {
      POST: hookHandler("INBOUND_EMAIL_SECRET", async (request) =>
        ingestInboundEmail(await readJsonCapped(request, INBOUND_MAX_BYTES)),
      ),
    },
  },
});
