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

/** The two wall corner returns' kinds — **names, not mechanisms** (ADR 0066), the wall band's mirror
 *  of ADR 0025's `corner_base_x` / `corner_base_return`.
 *
 *  Two kinds and not one shared kind, because the breakdown line renders `describeBodyLabelAt`
 *  alone — label and width, no band — so a single kind leaves the two lines identical in the one
 *  place the defect was reported, at two different prices. The bodies differ by *row*: the 570 × 700
 *  return stands on the `wall` line and the 570 × 400 one on the `top` line.
 *
 *  Declared here beside the kinds the domain reads as decisions, even though nothing branches on
 *  these two, for `EXTRACTOR_HOOD_KIND`'s reason: three sites have to spell each kind identically —
 *  the fixture row, `KIND_LABELS_RO` and the tests — and the label table is the one that goes wrong
 *  when they diverge. A divergence drops `describeKindLabel` through to `UNKNOWN_KIND_LABEL_RO`, so
 *  **both returns would read "Corp"** in the panel header and in wave 6D's priced document,
 *  silently reinstating the defect ADR 0066 exists to remove: two identical descriptions against two
 *  different amounts.
 *
 *  **Not** because a typo would empty a swap list, which is true in general and false here (ADR 0066
 *  correction 2026-09-03). It does hold for a body that can be replaced — `EXTRACTOR_HOOD_KIND`'s
 *  case — but `describeReplaceSection` returns at `if (!meta.canReplace)` one line before it reaches
 *  `isKnownKind`, and both returns are structural (ADR 0021), so they render no swap list at any
 *  spelling. */
export const WALL_CORNER_RETURN_KIND = "corner_wall_return";
export const WALL_CORNER_RETURN_TOP_KIND = "corner_wall_return_top";
