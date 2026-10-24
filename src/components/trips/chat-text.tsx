import { Fragment } from "react";

/**
 * Minimal, safe Markdown for agent replies: paragraphs, "- " / "1. " lists,
 * **bold**, and links. Built from React elements (never innerHTML), and only
 * http(s) links become anchors.
 */
export function ChatText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join("\n"))}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={blocks.length} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      // Drop Markdown heading marks; replies are short.
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-2 whitespace-pre-line">{blocks}</div>;
}

const TOKEN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>]+)|\*\*([^*]+)\*\*/g;

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={out.length}>{text.slice(last, at)}</Fragment>);
    if (m[2] || m[3]) {
      const href = m[2] ?? m[3];
      out.push(
        <a
          key={out.length}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-words text-hanko underline decoration-hanko/40 underline-offset-2 hover:decoration-hanko"
        >
          {m[1] ?? hostOf(href)}
        </a>,
      );
    } else if (m[4]) {
      out.push(
        <strong key={out.length} className="font-semibold">
          {m[4]}
        </strong>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={out.length}>{text.slice(last)}</Fragment>);
  return out;
}

function hostOf(href: string): string {
  try {
    const url = new URL(href);
    return url.hostname.replace(/^www\./, "") + (url.pathname.length > 1 ? url.pathname : "");
  } catch {
    return href;
  }
}
