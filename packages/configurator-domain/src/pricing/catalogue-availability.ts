import type { Handle } from "../design.js";

// What can be switched off, and what is currently switched off (M10 plan §8.4 a, A-17). Types only: pricing is the
// lower layer, and `price-dashboard/book-field-address.ts` imports these from here, never the reverse.
//
// Availability travels **beside** the book and is never a field of it, so a published version stays immutable and a
// switch never needs a publish. Ids are opaque strings, as a tier id is: this module imports no catalogue, no palette
// and no book (ADR 0062 seam 1), and the existence of an item is a question for the book, not for this type.

/**
 * One thing availability can be switched on or off for. A built-in or a linked accessory is one `accessory` ref. A
 * `finish` ref names a colour by the id of its palette entry.
 */
export type ItemRef =
  | { readonly kind: "material"; readonly tierId: string }
  | { readonly kind: "hardware"; readonly tierId: string }
  | { readonly kind: "finish"; readonly finishId: string }
  | { readonly kind: "handle"; readonly handle: Handle }
  | { readonly kind: "accessory"; readonly accessoryId: string };

export type ItemKind = ItemRef["kind"];

/**
 * What is currently switched off. `revision` is opaque: compared only for equality, never ordered above SQL, as
 * `DesignRevision` is.
 */
export interface CatalogueAvailability {
  readonly revision: string;
  readonly disabled: readonly ItemRef[];
}
