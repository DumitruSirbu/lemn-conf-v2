/** Whether the browser reports this media query as matching. False where there is no `window` or no `matchMedia` (a
 *  server render, a test DOM), so a caller states the answer it wants for "unknown" by which side of the query it asks
 *  about. */
export function matchesMedia(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}
