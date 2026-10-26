// The percentage bounds the book parser and the percentage seam both stand on (ADR 0177 A-5): a module that imports
// nothing, so neither can form a cycle through it.

/** The largest whole percentage a material may add to the PAL cabinets. An architect's bound and not a business
 *  figure (ADR 0177 A-5, owner-visible); PAL itself is fixed at 0. */
export const MAX_MATERIAL_PERCENT = 200;

/** The largest whole percentage a 700 mm depth may add to a deepening cabinet (ADR 0177 A-5; frame D2E). */
export const MAX_DEEP_CABINET_PERCENT = 100;

/** What a percentage is a part of: `100 + m` is the multiplier of a cabinet carrying an `m` % uplift. */
export const PERCENT_BASE = 100;
