import { toast } from "sonner";

/**
 * User-facing text for a caught error. API errors already carry the server's
 * `{ error }` message (see `ApiError`); anything else gets `fallback`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Toast a caught error with `errorMessage`. */
export function toastError(err: unknown, fallback: string): void {
  toast.error(errorMessage(err, fallback));
}
