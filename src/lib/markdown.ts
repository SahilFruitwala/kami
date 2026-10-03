import { xmlEscape } from "./xml.ts";

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.join("<br/>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    list = [];
  };
  const inline = (s: string) => {
    // Protect inline `code` spans from further markdown processing.
    const codeSpans: string[] = [];
    const protected_ = s.replace(/`([^`]+)`/g, (_, code: string) => {
      codeSpans.push(`<code>${xmlEscape(code)}</code>`);
      return `@@INLINECODE${codeSpans.length - 1}@@`;
    });
    const formatted = xmlEscape(protected_)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img alt="$1" src="$2"/>`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/@@INLINECODE(\d+)@@/g, (_, i: string) => codeSpans[Number(i)] ?? "");
    // Restore any code spans whose <code> tags got entity-escaped.
    return formatted.replace(/&lt;code&gt;/g, "<code>").replace(/&lt;\/code&gt;/g, "</code>");
  };

  let inFence = false;
  let fenceBuf: string[] = [];
  const flushFence = () => {
    if (!fenceBuf.length) return;
    // Strip one leading/trailing blank line (common in fences) but keep indentation.
    while (fenceBuf.length && !fenceBuf[0].trim()) fenceBuf.shift();
    while (fenceBuf.length && !fenceBuf[fenceBuf.length - 1].trim()) fenceBuf.pop();
    out.push(`<pre><code>${xmlEscape(fenceBuf.join("\n"))}</code></pre>`);
    fenceBuf = [];
  };

  const splitTableRow = (line: string): string[] | null => {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return null;
    // Strip optional leading/trailing pipes, then split on unescaped pipes.
    const inner = trimmed.replace(/^\||\|$/g, "").trim();
    if (!inner) return null;
    const cells: string[] = [];
    let current = "";
    let escaped = false;
    for (const ch of inner) {
      if (escaped) {
        current += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    if (cells.length < 2) return null;
    return cells;
  };
  const isTableDelimiter = (line: string): boolean => {
    const cells = splitTableRow(line);
    if (!cells || cells.length < 2) return false;
    return cells.every((c) => /^:?-+:?$/.test(c.trim()));
  };

  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      if (inFence) {
        flushFence();
        inFence = false;
      } else {
        flushPara();
        flushList();
        inFence = true;
        fenceBuf = [];
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(raw.replace(/\r$/, ""));
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    // GitHub-style pipe tables: header row + delimiter row + body rows.
    if (line.includes("|")) {
      const headerCells = splitTableRow(line);
      const nextLine = li + 1 < lines.length ? (lines[li + 1] ?? "") : "";
      if (headerCells && isTableDelimiter(nextLine)) {
        const bodyRows: string[][] = [];
        let cursor = li + 2;
        while (cursor < lines.length) {
          const candidate = lines[cursor] ?? "";
          if (!candidate.trim() || !candidate.includes("|")) break;
          if (/^```/.test(candidate.trim())) break;
          const cells = splitTableRow(candidate);
          if (!cells) break;
          bodyRows.push(cells);
          cursor += 1;
        }
        flushPara();
        flushList();
        const colCount = headerCells.length;
        const normalize = (cells: string[]) => {
          const out = cells.slice(0, colCount);
          while (out.length < colCount) out.push("");
          return out;
        };
        const thead = `<thead><tr>${normalize(headerCells)
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead>`;
        const tbody =
          bodyRows.length > 0
            ? `<tbody>${bodyRows
                .map(
                  (row) =>
                    `<tr>${normalize(row)
                      .map((c) => `<td>${inline(c)}</td>`)
                      .join("")}</tr>`,
                )
                .join("")}</tbody>`
            : "";
        out.push(`<table>${thead}${tbody}</table>`);
        li = cursor - 1;
        continue;
      }
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      list.push(inline(line.replace(/^[-*]\s+/, "")));
      continue;
    }
    para.push(inline(line.trim()));
  }
  if (inFence) flushFence();
  flushPara();
  flushList();
  return out.join("");
}
