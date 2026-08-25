import type { Design } from "./design.js";

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object") return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Deterministic wire form of a `Design`: identical for structurally-identical designs regardless
 *  of key insertion order. Used to compare persisted round trips — jsonb normalises key order and
 *  whitespace, so byte-identity of the stored column is not a valid round-trip assertion. */
export function canonicalSerializeDesign(design: Design): string {
  return JSON.stringify(sortKeysDeep(design));
}
