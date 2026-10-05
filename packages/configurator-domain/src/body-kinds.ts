// The `kind` strings the domain reads as decisions rather than as labels. A leaf module on purpose:
// `void-engine.ts` and `occupied-depth.ts` both need these, and `catalog.ts` (where they lived) imports
// `void-engine.ts` for `MIN_WIDTH_M`, so keeping them there would make the cycle real. `catalog.ts`
// re-exports them.

/** The `kind` a hood declares, and the only thing that identifies one to the resize path and the depth
 *  rules. A hood is sized to its cooktop, so it is exempt from its column's width while staying an ordinary
 *  placement in the column; the exemption is keyed off the hood's catalogue identity (`kind`), not a new body
 *  kind or a per-placement flag, since the standalone-accessory machinery is deleted. Exported because four
 *  declarations must agree on the string: the `hood` row, the seeded `hood-600`, `setWidth`'s exemption and
 *  the depth rules. see ADR 0039 decision 4 */
export const EXTRACTOR_HOOD_KIND = "extractor_hood";

/** The `kind` of a carcass whose builder stands a door and a bar handle in front of its shell, so the one
 *  ADR 0036 decision 1's front-assembly correction applies to. An open shelf (`open_shelf_unit`) has
 *  neither, so its shell and declared depth are one number. */
export const WALL_CABINET_KIND = "wall_cabinet";

/** The two wall corner returns' kinds: names, not mechanisms, the wall band's mirror of `corner_base_x` /
 *  `corner_base_return` (ADR 0066). Two kinds, not one, because the breakdown line renders
 *  `describeBodyLabelAt` alone (label and width, no band), so one shared kind would leave two identical
 *  lines at two different prices; the 570 × 700 return stands on the `wall` line and the 570 × 400 one on
 *  the `top` line.
 *
 *  Declared here for `EXTRACTOR_HOOD_KIND`'s reason although nothing branches on them: the fixture row,
 *  `catalog.ts`'s known-kind set and the `catalog.kinds.*` messages must spell each identically, and a
 *  divergence drops the kind to `catalog.unknownKind`, so both returns would read the same generic word. A
 *  typo would not empty a swap list: both returns are structural (ADR 0021) and render none at any
 *  spelling. */
export const WALL_CORNER_RETURN_KIND = "corner_wall_return";
export const WALL_CORNER_RETURN_TOP_KIND = "corner_wall_return_top";
