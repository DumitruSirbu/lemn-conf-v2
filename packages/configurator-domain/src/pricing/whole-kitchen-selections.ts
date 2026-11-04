// The whole-kitchen choices a design was configured with. Type-only, so pricing's pricing query and the module that
// names the items a design chose share one shape without importing each other.

/** The whole-kitchen choices a design was configured with, passed in by the caller holding the book.
 *  An absent choice is priced at the book's own default tier.
 *
 *  Each key is `string | undefined`, not merely optional: `DesignSettings` is inferred from a Zod
 *  `.optional()`, which `exactOptionalPropertyTypes` would refuse to assign to a plain `?: string`. */
export interface WholeKitchenSelections {
  readonly hardwareTierId?: string | undefined;
  readonly materialTierId?: string | undefined;
}
