/** Test-only. Narrows away an optional lookup with a message naming what was missing, so a broken
 *  assumption fails as "no corner X-leg" rather than as a downstream property access on undefined. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`Expected ${what} to exist`);
  return value;
}
