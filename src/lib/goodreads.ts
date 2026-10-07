/**
 * Goodreads library export (My Books → Import and export → Export library)
 * parsed into book shelf rows. Pure — shared by the settings UI and tests.
 */

export type GoodreadsStatus = "to_try" | "in_progress" | "done" | "abandoned";

export type GoodreadsBook = {
  title: string;
  author?: string;
  isbn?: string;
  year?: number;
  pages?: number;
  status: GoodreadsStatus;
  /** 1–5, omitted when unrated. */
  rating?: number;
  goodreadsId?: string;
  /** ISO dates. */
  dateAdded?: string;
  dateRead?: string;
  review?: string;
};

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Goodreads wraps ISBNs as `="0439023483"` so spreadsheets keep the zeros. */
function cleanIsbn(value: string | undefined): string | undefined {
  const digits = value?.replace(/^="?|"$/g, "").replace(/[^0-9X]/gi, "");
  return digits && (digits.length === 10 || digits.length === 13) ? digits.toUpperCase() : undefined;
}

function positiveInt(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `2023/05/14` (or `2023-05-14`) → `2023-05-14`. */
function isoDate(value: string | undefined): string | undefined {
  const m = value?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/** Exclusive shelf → status. Custom shelves read as "want to read" unless they say otherwise. */
function shelfStatus(shelf: string): GoodreadsStatus {
  const s = shelf.trim().toLowerCase();
  if (s === "read") return "done";
  if (s === "currently-reading") return "in_progress";
  if (/(did-?not-?finish|dnf|abandon|gave-?up)/.test(s)) return "abandoned";
  return "to_try";
}

/** Review text comes through with `<br/>` tags. */
function plainText(value: string | undefined): string | undefined {
  const text = value
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text ? text : undefined;
}

/** Parse a Goodreads export CSV. Throws when the header doesn't look like one. */
export function parseGoodreadsCsv(text: string): GoodreadsBook[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("That file is empty.");
  const col = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
  if (!col.has("title") || !col.has("exclusive shelf")) {
    throw new Error("That doesn't look like a Goodreads library export.");
  }
  const get = (row: string[], name: string) => {
    const i = col.get(name);
    const v = i == null ? undefined : row[i]?.trim();
    return v ? v : undefined;
  };

  const books: GoodreadsBook[] = [];
  for (const row of rows) {
    const title = get(row, "title");
    if (!title) continue;
    const rating = positiveInt(get(row, "my rating"));
    books.push({
      title,
      author: get(row, "author"),
      isbn: cleanIsbn(get(row, "isbn13")) ?? cleanIsbn(get(row, "isbn")),
      year:
        positiveInt(get(row, "original publication year")) ??
        positiveInt(get(row, "year published")),
      pages: positiveInt(get(row, "number of pages")),
      status: shelfStatus(get(row, "exclusive shelf") ?? ""),
      rating: rating && rating <= 5 ? rating : undefined,
      goodreadsId: get(row, "book id")?.match(/^\d+$/)?.[0],
      dateAdded: isoDate(get(row, "date added")),
      dateRead: isoDate(get(row, "date read")),
      review: plainText(get(row, "my review")),
    });
  }
  return books;
}
