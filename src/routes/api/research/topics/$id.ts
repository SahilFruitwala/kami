import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiHandler } from "@/server/http";
import {
  deleteResearchTopic,
  renameResearchTopic,
  researchTopic,
  topicNameInput,
} from "@/server/services/research/topics";

const params = z.object({ id: z.string().min(1).max(100) });

export const Route = createFileRoute("/api/research/topics/$id")({
  server: {
    handlers: {
      GET: apiHandler({ params }, ({ userId, params }) => researchTopic(userId, params.id)),
      PATCH: apiHandler({ params, body: topicNameInput }, ({ userId, params, body }) =>
        renameResearchTopic(userId, params.id, body.name),
      ),
      DELETE: apiHandler({ params }, ({ userId, params }) =>
        deleteResearchTopic(userId, params.id),
      ),
    },
  },
});
