// The constants the price arithmetic and the book parser both stand on, in a module that imports nothing so
// `book-reading.ts` (which derives `MAX_PRICE_COEFFICIENT_MINOR` from them) and `anchored-price-formula.ts` (which
// imports `book-reading.ts`) cannot form a cycle through it.

/** The unit a width or height is rounded up to and a step is quoted per ("+ lei per 50 mm"). Declared here
 *  as a pricing unit and never derived from the catalogue's own width module (ADR 0177 A-4). */
export const PRICE_STEP_MM = 50;

/** The largest whole percentage a material may add to the PAL cabinets. An architect's bound and not a business
 *  figure (ADR 0177 A-5, owner-visible); PAL itself is fixed at 0. */
export const MAX_MATERIAL_PERCENT = 200;

/** The largest whole percentage a 700 mm depth may add to a deepening cabinet (ADR 0177 A-5; frame D2E). */
export const MAX_DEEP_CABINET_PERCENT = 100;

/** What a percentage is a part of: `100 + m` is the multiplier of a cabinet carrying an `m` % uplift. */
export const PERCENT_BASE = 100;
