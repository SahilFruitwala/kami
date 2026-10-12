import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertCircle, ArrowUp, LoaderCircle, RotateCcw, Square, X } from "lucide-react";
import { ChatText } from "@/components/trips/chat-text.tsx";
import { cn } from "@/lib/utils.ts";

/** Errors from a chat route arrive as the raw `{ "error": "…" }` body. */
function errorText(err: Error): string {
  try {
    const parsed = JSON.parse(err.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: a stream error message, already user-facing.
  }
  if (/network error|failed to fetch|load failed|terminated/i.test(err.message)) {
    return "The connection dropped before the reply finished. Try again.";
  }
  return err.message || "Something went wrong. Try again.";
}

const messageText = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/**
 * A small, unsaved AI chat (article Q&A, Ask your library). The browser
 * keeps the conversation and sends it with each turn; reloading clears it.
 */
export function AiChat({
  id,
  api,
  label,
  intro,
  examples = [],
  placeholder = "Ask a question…",
  seed,
  renderMetadata,
  className,
}: {
  id: string;
  api: string;
  label: string;
  intro?: React.ReactNode;
  examples?: string[];
  placeholder?: string;
  /** Prefill the input (e.g. a selected passage); a new `nonce` re-applies it. */
  seed?: { text: string; nonce: number } | null;
  /** Extra content under an assistant reply, from the metadata the route sent. */
  renderMetadata?: (metadata: unknown) => React.ReactNode;
  className?: string;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api, credentials: "same-origin" }),
    [api],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!seed) return;
    setInput(seed.text);
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(seed.text.length, seed.text.length);
  }, [seed]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    clearError();
    void sendMessage({ text: value });
    setInput("");
  }

  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scroller}
        className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto py-2"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-2.5">
            {intro ? (
              <div className="font-body text-sm leading-relaxed opacity-75">{intro}</div>
            ) : null}
            {examples.length ? (
              <ul className="space-y-1.5">
                {examples.map((example) => (
                  <li key={example} className="list-none">
                    <button
                      type="button"
                      onClick={() => send(example)}
                      className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-left font-body text-sm opacity-80 transition-colors hover:border-hanko/40 hover:opacity-100"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <p
                key={m.id}
                className="ml-6 rounded-2xl rounded-br-sm bg-ink/10 px-3 py-2 font-body text-sm leading-snug break-words whitespace-pre-wrap"
              >
                {messageText(m)}
              </p>
            ) : (
              <div key={m.id} className="space-y-2 font-body text-sm leading-relaxed break-words">
                <div className="space-y-2">
                  <ChatText text={messageText(m)} />
                </div>
                {renderMetadata && m.metadata ? renderMetadata(m.metadata) : null}
              </div>
            ),
          )
        )}
        {status === "submitted" ? (
          <p className="flex items-center gap-1.5 font-sans text-xs opacity-60">
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
        className="flex items-end gap-1.5 border-t border-line pt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              setMessages([]);
              clearError();
            }}
            disabled={busy}
            title="Start over"
            aria-label="Start over"
            className="flex size-9 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <label htmlFor={`${id}-input`} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={`${id}-input`}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          className="max-h-32 min-h-9 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-surface px-3 py-2 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30 [field-sizing:content]"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper"
          >
            <Square className="size-3" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-hanko text-paper transition-colors hover:bg-shu disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  );
}
