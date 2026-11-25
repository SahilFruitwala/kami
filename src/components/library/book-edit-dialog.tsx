import { useId, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
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
import { useUpdateBook } from "@/hooks/use-shelf-queries.ts";
import { toastError } from "@/lib/errors";

export type EditableBook = {
  id: string;
  title: string;
  author: string | null;
  publishYear: number | null;
  overview: string | null;
  pageCount: number | null;
};

/** Edit a book's record: title, author, year, synopsis and page count. */
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
            Fix the details or write your own synopsis. Progress and status are changed on the page.
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
  const [error, setError] = useState("");

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
    try {
      await save.mutateAsync({
        id: book.id,
        fields: {
          title: title.trim(),
          author: author.trim() || null,
          publishYear: yearNum,
          overview: overview.trim() || null,
          pageCount: pagesNum,
        },
      });
      onDone();
    } catch (err) {
      toastError(err, "Couldn't save the book.");
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 font-sans text-sm">
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
