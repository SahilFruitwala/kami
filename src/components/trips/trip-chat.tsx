import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  AlertCircle,
  ArrowUp,
  Check,
  Globe,
  LoaderCircle,
  RotateCcw,
  Undo2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { tripsApi, TRIP_WRITE_TOOLS, type TripChat as TripChatData } from "@/lib/api/trips";
import { queryKeys } from "@/lib/query-client.ts";
import { cn } from "@/lib/utils.ts";
import { ChatText } from "./chat-text.tsx";

const MODEL_KEY = "kami-trip-model";
const WRITE_TOOLS = new Set<string>(TRIP_WRITE_TOOLS);

const EXAMPLES = [
  "4 days here in May for two of us, around €150 a night. We love food and hate early mornings.",
  "Find three well-reviewed hotels in a walkable area.",
  "Plan day 1 around the best cafés and a short hike.",
];

function readStoredModel(): string | null {
  try {
    return window.localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

/** Errors from the chat route arrive as the raw `{ "error": "…" }` body. */
function errorText(err: Error): string {
  try {
    const parsed = JSON.parse(err.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: a stream error message, already user-facing.
  }
  if (/network error|failed to fetch|load failed|terminated/i.test(err.message)) {
    return "The connection dropped before the agent finished. It may still be working: reopen this tab in a minute to see its reply.";
  }
  return err.message || "The trip agent hit an error. Try again.";
}

export function TripChat({ tripId }: { tripId: string }) {
  const query = useQuery({
    queryKey: queryKeys.trips.chat(tripId),
    queryFn: () => tripsApi.chat(tripId),
    // The live conversation is owned by useChat once loaded.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (query.isPending) {
    return <div className="kami-sheet h-[32rem] animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (query.isError) {
    return (
      <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
        {query.error instanceof Error ? query.error.message : "Could not load the conversation."}
      </p>
    );
  }
  if (!query.data.defaultModel) {
    return (
      <section aria-label="Trip agent" className="kami-sheet space-y-2 p-5">
        <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Trip agent
        </p>
        <p className="font-body text-sm leading-relaxed text-ink-soft">
          The agent isn't set up on this server yet. Add <code>GOOGLE_GENERATIVE_AI_API_KEY</code>{" "}
          or <code>OPENROUTER_API_KEY</code> to the environment. Until then you can plan by hand on
          the board.
        </p>
      </section>
    );
  }
  return <ChatPanel tripId={tripId} data={query.data} />;
}

function ChatPanel({ tripId, data }: { tripId: string; data: TripChatData }) {
  const client = useQueryClient();
  const usable = data.models.filter((m) => m.available);
  const [model, setModel] = useState(() => {
    const stored = typeof window === "undefined" ? null : readStoredModel();
    return usable.some((m) => m.id === stored) ? stored! : data.defaultModel!;
  });
  // The transport is created once; it reads the current model through a ref.
  const modelRef = useRef(model);
  modelRef.current = model;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: tripsApi.chatUrl(tripId),
        credentials: "same-origin",
        // The server keeps the history; send only the new message.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { message: messages[messages.length - 1], model: modelRef.current },
        }),
      }),
    [tripId],
  );

  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id: `trip-${tripId}`,
    messages: data.messages,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // The agent's latest edits can be undone while a snapshot exists.
  const [canUndo, setCanUndo] = useState(data.canUndo);
  const [undoing, setUndoing] = useState(false);
  async function undo() {
    if (busy || undoing || !window.confirm("Undo the agent's latest changes to the trip board?")) {
      return;
    }
    setUndoing(true);
    try {
      const trip = await tripsApi.undoAgent(tripId);
      client.setQueryData(queryKeys.trips.detail(tripId), trip);
      void client.invalidateQueries({ queryKey: queryKeys.trips.list() });
      setCanUndo(false);
      toast.success("Restored the trip from before the agent's changes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo the agent's changes.");
    } finally {
      setUndoing(false);
    }
  }

  // Refresh the board whenever a write tool finishes successfully.
  const applied = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done = new Set<string>();
    for (const m of messages) {
      for (const part of m.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue;
        if (!WRITE_TOOLS.has(getToolName(part))) continue;
        const output = part.output as { ok?: boolean } | undefined;
        if (output?.ok) done.add(part.toolCallId);
      }
    }
    const before = applied.current;
    applied.current = done;
    if (before && [...done].some((id) => !before.has(id))) {
      setCanUndo(true);
      void client.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.trips.list() });
    }
  }, [messages, client, tripId]);

  // Keep the newest message in view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const [input, setInput] = useState("");
  function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    clearError();
    void sendMessage({ text: value });
    setInput("");
  }

  function pickModel(id: string) {
    setModel(id);
    try {
      window.localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
  }

  async function clearChat() {
    if (busy || !window.confirm("Clear this conversation? The trip board stays as it is.")) return;
    try {
      await tripsApi.clearChat(tripId);
      setMessages([]);
      applied.current = new Set();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the conversation.");
    }
  }

  return (
    <section
      aria-label="Trip agent"
      className="kami-sheet flex h-[min(44rem,calc(100dvh-8rem))] min-h-[28rem] flex-col overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
        <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Trip agent
        </p>
        <div className="flex items-center gap-1.5">
          <label htmlFor={`trip-model-${tripId}`} className="sr-only">
            Model
          </label>
          <select
            id={`trip-model-${tripId}`}
            value={model}
            onChange={(e) => pickModel(e.target.value)}
            disabled={busy}
            className="h-7 max-w-[13rem] truncate rounded-md border border-line bg-bg/70 px-1.5 font-sans text-[11px] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            {data.models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.label}
                {m.available ? "" : " (no key)"}
              </option>
            ))}
          </select>
          {canUndo ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy || undoing}
              title="Undo the agent's latest changes"
              aria-label="Undo the agent's latest changes"
              className="flex h-7 items-center gap-1 rounded-md px-1.5 font-sans text-[11px] text-ink-muted hover:bg-paper-warm hover:text-ink disabled:opacity-50"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              Undo
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => void clearChat()}
              disabled={busy}
              title="Clear conversation"
              aria-label="Clear conversation"
              className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-paper-warm hover:text-ink disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        ref={scroller}
        className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="font-body text-sm leading-relaxed text-ink-soft">
              Tell the agent what you want from this trip. It researches hotels, places and opening
              hours, then fills in the trip board. You can edit everything it adds.
            </p>
            {!data.research ? (
              <p className="flex items-start gap-1.5 font-sans text-xs text-ink-muted">
                <Globe className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Web research is off (no <code>FIRECRAWL_API_KEY</code>), so suggestions come from
                the model's own knowledge.
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {EXAMPLES.map((example) => (
                <li key={example} className="list-none">
                  <button
                    type="button"
                    onClick={() => setInput(example)}
                    className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-left font-body text-sm text-ink-soft transition-colors hover:border-hanko/40 hover:text-ink"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
        {status === "submitted" ? (
          <p className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            Thinking…
          </p>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg bg-shu-tint px-3 py-2 font-sans text-xs text-hanko">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{errorText(error)}</span>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss error"
              className="shrink-0"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor={`trip-chat-input-${tripId}`} className="sr-only">
          Message the trip agent
        </label>
        <textarea
          id={`trip-chat-input-${tripId}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Ask for hotels, cafés, hikes, a day plan…"
          className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-lg border border-line bg-bg/70 px-3 py-2 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink/20"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => void stop()}
            title="Stop"
            aria-label="Stop"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-soft shadow-[var(--shadow-border)] hover:text-ink"
          >
            <Square className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            title="Send"
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-hanko text-white shadow-sm transition-colors hover:bg-shu disabled:opacity-50"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  );
}

// ---------- Messages ----------

function Message({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    return (
      <div className="ml-8 rounded-lg bg-shu-tint px-3 py-2 font-body text-sm whitespace-pre-line text-ink">
        {text}
      </div>
    );
  }
  return (
    <div className="mr-4 space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text.trim() ? (
            <div key={i} className="font-body text-sm leading-relaxed text-ink">
              <ChatText text={part.text} />
            </div>
          ) : null;
        }
        if (isToolUIPart(part)) return <ToolLine key={part.toolCallId} part={part} />;
        return null;
      })}
    </div>
  );
}

type ToolPart = Extract<UIMessage["parts"][number], { toolCallId: string }>;

function ToolLine({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const input = (part.input ?? {}) as Record<string, unknown>;
  const output = (part.state === "output-available" ? part.output : undefined) as
    { error?: string } | undefined;
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || typeof output?.error === "string";
  const errorMessage =
    part.state === "output-error" ? part.errorText : (output?.error ?? undefined);

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 font-sans text-xs",
        failed ? "text-ink-muted" : "text-ink-soft",
      )}
    >
      {running ? (
        <LoaderCircle className="mt-px size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : failed ? (
        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Check
          className={cn(
            "mt-px size-3.5 shrink-0",
            WRITE_TOOLS.has(name) ? "text-ok" : "text-hanko",
          )}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 break-words">
        {describeTool(name, input)}
        {failed && errorMessage ? ` — ${errorMessage}` : null}
      </span>
    </p>
  );
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function describeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return str(input.query) ? `Searching “${str(input.query)}”` : "Searching the web";
    case "read_page": {
      const url = str(input.url);
      try {
        return url ? `Reading ${new URL(url).hostname.replace(/^www\./, "")}` : "Reading a page";
      } catch {
        return "Reading a page";
      }
    }
    case "update_trip":
      return "Saved trip details";
    case "shortlist_hotel":
      return str(input.name) ? `Shortlisted ${str(input.name)}` : "Shortlisted a hotel";
    case "update_hotel":
      return input.status === "chosen" ? "Marked the chosen hotel" : "Updated a hotel";
    case "remove_hotel":
      return "Removed a hotel";
    case "set_day": {
      const count = Array.isArray(input.items) ? input.items.length : 0;
      return typeof input.day === "number"
        ? `Planned day ${input.day} (${count} ${count === 1 ? "plan" : "plans"})`
        : "Planned a day";
    }
    case "add_item":
      return str(input.title)
        ? `Added “${str(input.title)}”${typeof input.day === "number" ? ` to day ${input.day}` : ""}`
        : "Added a plan";
    case "update_item":
      return str(input.title) ? `Updated “${str(input.title)}”` : "Updated a plan";
    case "remove_item":
      return "Removed a plan";
    default:
      return name.replace(/_/g, " ");
  }
}
