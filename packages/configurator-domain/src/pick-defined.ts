/** The listed keys of `source` that hold a value, and no key for an absent one: a document never states an absent
 *  setting, so a copy built from it never does either. */
export function pickDefined<Source extends object, Key extends keyof Source>(
  source: Source | undefined,
  keys: readonly Key[],
): Partial<Pick<Source, Key>> {
  const picked: Partial<Pick<Source, Key>> = {};
  if (source === undefined) return picked;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
