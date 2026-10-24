import { useEffect, useMemo, useRef, useState } from "react";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { useChat } from "@ai-sdk/react";
import {
  useTrip,
  useTripActions,
  useTripChat,
  useRefreshTrip,
  useSetTripAgentCanUndo,
} from "@/hooks/use-trips.ts";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  AlertCircle,
  ArrowUp,
  Check,
  Globe,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Undo2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { tripsApi, TRIP_WRITE_TOOLS, type TripChat as TripChatData } from "@/lib/api/trips";
import { needsAgentIntake } from "@/lib/trip-agent-prompt.ts";
import { cn } from "@/lib/utils.ts";
import { ChatText } from "./chat-text.tsx";
import { TripAgentIntake } from "./trip-agent-intake.tsx";

const WRITE_TOOLS = new Set<string>(TRIP_WRITE_TOOLS);

const EXAMPLES = [
  "We're two adults, 4 nights in May, about €150 a night. Food-first, no early mornings — what else do you need before you plan?",
  "Shortlist three hotels in a walkable area that fit our budget, then ask me which base you should plan days around.",
  "Plan day 1 around cafés and one short hike — keep it light and ask if anything conflicts with our pace.",
];

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

/**
 * The trip agent: a "Plan with agent" button on the board that opens the chat
 * as a drawer (a bottom sheet on a phone). Hidden unless an AI model is
 * configured. The chat mounts on first open and stays mounted, so closing the
 * drawer never drops a reply that is still streaming.
 */
export function TripAgent({ tripId }: { tripId: string }) {
  const { enabled } = useAiStatus();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
        className="fixed right-4 bottom-20 z-50 inline-flex h-12 items-center gap-2 rounded-full bg-hanko px-5 font-sans text-sm font-medium text-paper shadow-[var(--shadow-raised)] transition-colors hover:bg-shu lg:right-8 lg:bottom-8"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        Plan with agent
      </button>
      {opened ? (
        <div className={cn("fixed inset-0 z-[70]", !open && "hidden")}>
          <button
            type="button"
            aria-label="Close the trip agent"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <aside
            role="dialog"
            aria-label="Trip agent"
            className="absolute inset-x-0 bottom-0 flex h-[80dvh] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[var(--shadow-raised)] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-[28rem] lg:rounded-none lg:rounded-l-3xl"
          >
            <TripChat tripId={tripId} onClose={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function TripChat({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const query = useTripChat(tripId);

  if (query.isPending) {
    return <div className="m-4 h-60 animate-pulse rounded-2xl bg-paper-warm" aria-hidden="true" />;
  }
  if (query.isError) {
    return (
      <p className="p-6 font-body text-sm text-ink-soft">
        {query.error instanceof Error ? query.error.message : "Could not load the conversation."}
      </p>
    );
  }
  return <ChatPanel tripId={tripId} data={query.data} onClose={onClose} />;
}

function ChatPanel({
  tripId,
  data,
  onClose,
}: {
  tripId: string;
  data: TripChatData;
  onClose: () => void;
}) {
  const refreshTrip = useRefreshTrip(tripId);
  const setCanUndo = useSetTripAgentCanUndo(tripId);
  const tripQuery = useTrip(tripId);
  const chatQuery = useTripChat(tripId);
  const actions = useTripActions(tripId);
  const { undoAgent } = actions;
  const trip = tripQuery.data;
  const [intakeSkipped, setIntakeSkipped] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: tripsApi.chatUrl(tripId),
        credentials: "same-origin",
        // The server keeps the history; send only the new message.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { message: messages[messages.length - 1] },
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
  const canUndo = chatQuery.data?.canUndo ?? data.canUndo;

  const showIntake =
    messages.length === 0 && !intakeSkipped && trip != null && needsAgentIntake(trip);

  async function undo() {
    if (busy || undoAgent.isPending) return;
    if (
      !window.confirm(
        "Undo the agent's latest changes to the trip board? This only works if you have not edited the board yourself since.",
      )
    ) {
      return;
    }
    try {
      await undoAgent.mutateAsync();
    } catch {
      // The mutation already toasted the error.
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
      refreshTrip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTrip is rebuilt every render
  }, [messages]);

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

  async function clearChat() {
    if (busy || !window.confirm("Clear this conversation? The trip board stays as it is.")) return;
    try {
      await tripsApi.clearChat(tripId);
      setMessages([]);
      applied.current = new Set();
      setIntakeSkipped(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the conversation.");
    }
  }

  if (showIntake && trip) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
          <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-ink">
            <Sparkles className="size-4 text-hanko" aria-hidden="true" />
            Before we plan
          </p>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <TripAgentIntake
          trip={trip}
          actions={actions}
          onDone={() => setIntakeSkipped(true)}
          onSkip={() => setIntakeSkipped(true)}
        />
      </div>
    );
  }

  return (
    <section aria-label="Trip agent" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
        <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Trip agent
        </p>
        <div className="flex items-center gap-1.5">
          {canUndo ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy || undoAgent.isPending}
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
              className="flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
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
              hours, then fills in the trip board. You can edit everything it adds. It plans only:
              the trip's status is yours to set.
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
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft shadow-[var(--shadow-border)] hover:text-ink"
          >
            <Square className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            title="Send"
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-hanko text-paper transition-colors hover:bg-shu disabled:opacity-50"
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
