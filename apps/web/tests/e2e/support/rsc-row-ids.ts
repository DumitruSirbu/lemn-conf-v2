/**
 * The RSC flight payload a page inlines numbers its rows (`33:D…`, `8f:I[…]`) and refers to them
 * (`$L8f`, `$8d`). Under `next dev` the numbering is not stable between two renders of the same
 * page: a dev-only debug row (`33:D"$89"`) appears or not depending on how the concurrent renders
 * interleave, shifting every later id by the same amount — measured on the share view, where two
 * requests differed only by a constant +2 on every id past row 0x37 and carried an identical design.
 * A production build emits none of these rows, so its bodies stay byte-identical.
 */

const ROW_HEAD = /(?<=\\n|\[1,")([0-9a-f]+):/g;
const ROW_REFERENCE = /(\$L?)([0-9a-f]+)(?![0-9A-Za-z])/g;

/**
 * Renames every row id to `r0`, `r1`, … in order of first appearance. Two bodies are equal after
 * this exactly when they are the same payload under one consistent renaming of ids — so a changed
 * value, an added or dropped row, or a reference pointing at a different row still differs.
 */
export function canonicaliseRowIds(body: string): string {
  const labels = new Map<string, string>();
  const labelOf = (rowId: string): string => {
    const known = labels.get(rowId);
    if (known !== undefined) return known;
    const label = `r${String(labels.size)}`;
    labels.set(rowId, label);
    return label;
  };
  return body
    .replace(ROW_HEAD, (_match, rowId: string) => `${labelOf(rowId)}:`)
    .replace(
      ROW_REFERENCE,
      (_match, sigil: string, rowId: string) => `${sigil}${labelOf(rowId)}`,
    );
}
