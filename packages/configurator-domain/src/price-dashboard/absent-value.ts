/** A side of a row that has no value: the field, or the description, is not in that book (D8's new depth rule reads
 *  "Regulă nouă", before "—"). */
export interface AbsentValue {
  readonly kind: "absent";
}
export const ABSENT_VALUE: AbsentValue = Object.freeze({ kind: "absent" });
