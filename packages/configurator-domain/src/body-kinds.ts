// The `kind` strings the domain reads as decisions rather than as labels.
//
// A leaf module on purpose: `void-engine.ts` and `occupied-depth.ts` both need these, and
// `catalog.ts` — where they used to live — imports `void-engine.ts` for `MIN_WIDTH_M`, so keeping
// them there would have made the cycle real. `catalog.ts` re-exports them, so nothing that already
// read them from there had to move.

/** The `kind` a hood declares, and the **only** thing that identifies one to the resize path
 *  (ADR 0035 decision 6 as amended 2026-08-28, ADR 0039 decision 4) or to the depth rules
 *  (ADR 0039 decisions 1 and 2).
 *
 *  A hood is sized to the cooktop it extracts over, not to the run it hangs on, so it is exempt
 *  from its column's width while staying an ordinary placement in that column — owner: *"without
 *  separating it again from cabinets."* The exemption therefore has to be keyed off the hood's own
 *  catalogue identity, which `kind` already is (ADR 0022: an entry declares what it is, nothing
 *  infers it), and **not** off a new body kind or a per-placement flag: ADR 0038 deleted the
 *  standalone-accessory machinery and this is not a reason to rebuild it.
 *
 *  Exported because four declarations have to agree on the string — the `hood` catalogue row, the
 *  seeded `hood-600` instance, `setWidth`'s exemption and the depth rules — and a literal repeated
 *  in four files is how the fifth one gets it wrong. */
export const EXTRACTOR_HOOD_KIND = "extractor_hood";

/** The `kind` of a carcass whose builder stands a door and a bar handle in front of its shell, and
 *  therefore the one that ADR 0036 decision 1's front-assembly correction applies to. An open shelf
 *  (`open_shelf_unit`) has neither, so its shell and its declared depth are the same number. */
export const WALL_CABINET_KIND = "wall_cabinet";
