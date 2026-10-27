import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/server/http";
import {
  newResearchTopic,
  researchTopics,
  topicNameInput,
} from "@/server/services/research/topics";

export const Route = createFileRoute("/api/research/topics/")({
  server: {
    handlers: {
      GET: apiHandler({}, ({ userId }) => researchTopics(userId)),
      POST: apiHandler({ body: topicNameInput }, ({ userId, body }) =>
        newResearchTopic(userId, body.name),
      ),
    },
  },
});
