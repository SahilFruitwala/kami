import { useId, useState, type FormEvent } from "react";
import { ImageOff, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useBookSearch, useUpdateBook } from "@/hooks/use-shelf-queries.ts";
import type { LookupResult } from "@/lib/api/types";
import { previewImageSrc } from "@/lib/image-url.ts";
import { toastError } from "@/lib/errors";

export type EditableBook = {
  id: string;
  title: string;
  author: string | null;
  publishYear: number | null;
  overview: string | null;
  pageCount: number | null;
  imageUrl: string | null;
};

/** Open Library search hands back medium covers; the shelf shows them large. */
function largeCover(url: string): string {
  return url.replace(/^(https:\/\/covers\.openlibrary\.org\/b\/id\/\d+)-[SM]\.jpg$/, "$1-L.jpg");
}

/** Edit a book's record: cover, title, author, year, synopsis and page count. */
export function BookEditDialog({
  book,
  open,
  onOpenChange,
}: {
  book: EditableBook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Edit book</DialogTitle>
          <DialogDescription>
            Fix the details, pick a cover or write your own synopsis. Progress and status are
            changed on the page.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the fields start from the saved record each time. */}
        <EditForm book={book} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ book, onDone }: { book: EditableBook; onDone: () => void }) {
  const save = useUpdateBook();
  const fieldId = useId();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [year, setYear] = useState(book.publishYear != null ? String(book.publishYear) : "");
  const [pages, setPages] = useState(book.pageCount != null ? String(book.pageCount) : "");
  const [overview, setOverview] = useState(book.overview ?? "");
  const [cover, setCover] = useState(book.imageUrl ?? "");
  const [error, setError] = useState("");

  /** Take a cover from an Open Library record, and fill any fields still empty. */
  function pickRecord(r: LookupResult) {
    if (r.imageUrl) setCover(largeCover(r.imageUrl));
    const m = r.metadata;
    if (!author.trim() && m.author) setAuthor(m.author);
    if (!year.trim() && m.year) setYear(m.year);
    if (!pages.trim() && m.pages) setPages(m.pages);
    if (!overview.trim() && m.overview) setOverview(m.overview);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const yearNum = year.trim() === "" ? null : Number.parseInt(year, 10);
    const pagesNum = pages.trim() === "" ? null : Number.parseInt(pages, 10);
    if (!title.trim()) return setError("A book needs a title.");
    if (yearNum != null && !(yearNum >= 1 && yearNum <= 3000))
      return setError("Enter a real year.");
    if (pagesNum != null && !(pagesNum >= 1 && pagesNum <= 100_000))
      return setError("Pages must be a positive number.");
    const coverUrl = cover.trim();
    if (coverUrl && !/^https?:\/\/\S+$/i.test(coverUrl))
      return setError("The cover must be a web address starting with https://.");
    try {
      await save.mutateAsync({
        id: book.id,
        fields: {
          title: title.trim(),
          author: author.trim() || null,
          publishYear: yearNum,
          overview: overview.trim() || null,
          pageCount: pagesNum,
          imageUrl: coverUrl || null,
        },
      });
      onDone();
    } catch (err) {
      toastError(err, "Couldn't save the book.");
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 font-sans text-sm">
      <CoverField
        fieldId={fieldId}
        cover={cover}
        onCoverChange={setCover}
        query={[title, author]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")}
        onPick={pickRecord}
      />
      <label className="grid gap-1.5" htmlFor={`${fieldId}-title`}>
        <span className="kami-label text-ink-muted">Title</span>
        <Input
          id={`${fieldId}-title`}
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="grid gap-1.5" htmlFor={`${fieldId}-author`}>
        <span className="kami-label text-ink-muted">Author</span>
        <Input
          id={`${fieldId}-author`}
          value={author}
          maxLength={300}
          onChange={(e) => setAuthor(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1.5" htmlFor={`${fieldId}-year`}>
          <span className="kami-label text-ink-muted">Year published</span>
          <Input
            id={`${fieldId}-year`}
            type="number"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="tabular-nums"
          />
        </label>
        <label className="grid gap-1.5" htmlFor={`${fieldId}-pages`}>
          <span className="kami-label text-ink-muted">Pages</span>
          <Input
            id={`${fieldId}-pages`}
            type="number"
            inputMode="numeric"
            min={1}
            value={pages}
            onChange={(e) => setPages(e.target.value)}
            className="tabular-nums"
          />
        </label>
      </div>
      <label className="grid gap-1.5" htmlFor={`${fieldId}-overview`}>
        <span className="kami-label text-ink-muted">Synopsis</span>
        <Textarea
          id={`${fieldId}-overview`}
          value={overview}
          maxLength={4000}
          rows={6}
          onChange={(e) => setOverview(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-hanko">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save
        </Button>
      </div>
    </form>
  );
}

function CoverField({
  fieldId,
  cover,
  onCoverChange,
  query,
  onPick,
}: {
  fieldId: string;
  cover: string;
  onCoverChange: (url: string) => void;
  query: string;
  onPick: (record: LookupResult) => void;
}) {
  const [searched, setSearched] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const search = useBookSearch(searched ?? "", searched != null);
  const withCovers = (search.data ?? []).filter((r) => r.imageUrl);
  const shown = cover.trim();

  return (
    <div className="grid gap-2">
      <span className="kami-label text-ink-muted">Cover</span>
      <div className="flex gap-3">
        <div className="flex aspect-[2/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-paper-warm text-ink-faint">
          {shown && broken !== shown ? (
            <img
              src={previewImageSrc(shown)}
              alt="Cover preview"
              className="size-full object-cover"
              onError={() => setBroken(shown)}
            />
          ) : (
            <ImageOff className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="grid min-w-0 flex-1 content-start gap-2">
          <label className="sr-only" htmlFor={`${fieldId}-cover`}>
            Cover image address
          </label>
          <Input
            id={`${fieldId}-cover`}
            type="url"
            value={cover}
            maxLength={2000}
            placeholder="https://… image address"
            onChange={(e) => onCoverChange(e.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={query.length < 2 || search.isFetching}
              onClick={() => setSearched(query)}
            >
              {search.isFetching ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              Find covers
            </Button>
            {shown ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onCoverChange("")}>
                Remove
              </Button>
            ) : null}
          </div>
          {broken && broken === shown ? (
            <p className="text-xs text-hanko">That address didn't load as an image.</p>
          ) : null}
        </div>
      </div>
      {searched != null && !search.isFetching ? (
        withCovers.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-ink-muted">
              Open Library records for “{searched}”. Picking one sets the cover and fills any empty
              fields.
            </p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {withCovers.map((r) => {
                const url = largeCover(r.imageUrl!);
                const selected = url === shown;
                const label = [r.title, r.metadata.author, r.metadata.year]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li key={r.link ?? r.imageUrl}>
                    <button
                      type="button"
                      onClick={() => onPick(r)}
                      aria-pressed={selected}
                      title={label}
                      aria-label={`Use ${label}`}
                      className={
                        "block w-full overflow-hidden rounded-md border-2 transition-colors " +
                        (selected ? "border-ink" : "border-transparent hover:border-line")
                      }
                    >
                      <img
                        src={r.imageUrl}
                        alt=""
                        loading="lazy"
                        className="aspect-[2/3] w-full object-cover"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            {search.isError
              ? "Couldn't reach Open Library. Try again in a moment."
              : `No covers found for “${searched}”. Try changing the title or author, or paste an image address.`}
          </p>
        )
      ) : null}
    </div>
  );
}
