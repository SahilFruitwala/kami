/**
 * Browser client for the app's REST API (`src/routes/api/*`).
 *
 *   src/routes/api/**       thin HTTP routes (method + path → service call)
 *   src/server/http.ts      auth, same-site, rate limit, zod parsing, errors
 *   src/server/services/**  business logic + DB access (server-only)
 *   src/lib/api/**          typed fetch client + shared contracts (this folder)
 */
export { ApiError, isApiError } from "./client";
export { articlesApi } from "./articles";
export { journalApi } from "./journal";
export { libraryApi, type LibraryItemPatch } from "./library";
export { lookupApi } from "./lookup";
export { shelvesApi, type BookProgress, type NewShelfItem, type ShelfType } from "./shelves";
export * from "./types";
