/** Random id for new rows (UUID where available). Isomorphic. */
export function uid(): string {
  return (
    crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  );
}
