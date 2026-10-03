/** URL search params shared by the /shelves/* routes. */
export type ShelvesSearch = {
  q?: string;
  status?: string;
};

export function validateShelvesSearch(search: Record<string, unknown>): ShelvesSearch {
  return {
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    status:
      typeof search.status === "string" && search.status.length > 0 ? search.status : undefined,
  };
}
