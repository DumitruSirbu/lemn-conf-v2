import type { PriceBook } from "../pricing/price-book.js";

import { addressKey } from "./address-key.js";
import {
  changeFromReading,
  readEditableFields,
  type AppliedDraftChange,
} from "./editable-fields.js";

/**
 * The changes that make `active` equal `archived` on every editable field both books state: one per field whose value
 * differs, set to the archived value, in the order the dashboard lists fields. A field only one book states (a depth
 * rule where the other states none, a row the other lacks) has no change to make: no change kind creates a row. A stored
 * `-0` is emitted as `0`, which `applyChanges` accepts. Equal books give none.
 */
export function restoreChanges(
  archived: PriceBook,
  active: PriceBook,
): readonly AppliedDraftChange[] {
  const archivedValues = new Map(
    readEditableFields(archived).map((reading) => [
      addressKey(reading.address),
      reading.value,
    ]),
  );
  return readEditableFields(active).flatMap((reading) => {
    const archivedValue = archivedValues.get(addressKey(reading.address));
    if (archivedValue === undefined || archivedValue === reading.value)
      return [];
    return [
      changeFromReading({
        address: reading.address,
        value: archivedValue === 0 ? 0 : archivedValue,
      }),
    ];
  });
}
