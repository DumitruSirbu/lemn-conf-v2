/**
 * Opaque persisted identifiers have no locale. Compare their UTF-16 code units directly so two
 * machines cannot reorder the same document through locale-sensitive collation.
 */
export function compareOpaqueIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
