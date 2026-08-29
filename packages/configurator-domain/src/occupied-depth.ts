// How deep the space a placed body fills actually is — which is **not** `frame.d`.
//
// ADR 0018: `frame.d` is twice a body's rear overhang, an encoding that exists so
// `deriveCabinetWorldTransform` can land any bounding box on the wall plane (§11 row 19). It
// coincided with the occupied depth for the two builders that consume a depth, and wave 5F ended
// that coincidence twice over. Everywhere the model reads it *as a depth* — the column extent
// §3.2 derives, and the opening a swap sees — has to convert first, and this is the one place that
// conversion lives.
import { EXTRACTOR_HOOD_KIND, WALL_CABINET_KIND } from "./body-kinds.js";
import { toMetres } from "./millimetres.js";
import type { PlacementRecord } from "./void-engine.js";
import { WALL_FRONT_ASSEMBLY_MM, WORKTOP_DEPTH_MM } from "./worktop-depth.js";

/** The distance from the wall plane to the front of the space this body fills.
 *
 *  - **A fronted wall carcass** records a shell that is its declared depth less the door and handle
 *    standing in front of it (ADR 0036 decision 1), so the space it fills is 39 mm deeper than its
 *    seat. Reading the seat raw is what would shrink a wall cabinet 330 → 291 → 252 on successive
 *    rebuilds, which `refuseBuiltSize` cannot see — ADR 0018 clause 4, in the shrinking direction.
 *  - **A hood** is hung at the front with the gap behind it (ADR 0039 decision 2), so its seat is
 *    larger than its 500 mm body: it runs from the wall plane to the cabinet-depth line, and that
 *    line is the depth of the space. Reading the seat raw would claim 700 mm at a 600 mm kitchen;
 *    reading the body raw claimed 500 and cost the opening 100 mm permanently (backlog entry 9).
 *  - **Everything else** is returned unchanged, and that is an inherited approximation rather than
 *    an identity. Measured: a base cabinet's seat is 290, its `frame.d` 580, and the space it fills
 *    620 — the counter is 620 deep and offset 20 mm forward, so the body is not symmetric about its
 *    origin. `tall-pantry` records 560 and occupies 599; `fridge-free` records 680 and occupies 742.
 *    ADR 0018's own finding says so ("the centring invariant … is already violated inside
 *    `baseCabinet`") and this function does not close it.
 *
 *    What it closes is the two divergences **wave 5F introduced**, which are the ones that compound
 *    on a reload. The pre-existing ones under-report `column.d` for those columns — a base column
 *    publishes 580 against ADR 0036's declared 600 — and are a recorded gap, not a fixed one.
 *
 *    §11 row 19's **first** named exception is in this set too: `base-corner-x-900` records 560 for
 *    a 600-deep carcass seated 20 mm inside the wall (ADR 0025), so it occupies 580 and this answers
 *    560. Unchanged by wave 5F — the old `Math.max(frame.d)` gave the same number — and its column
 *    is structural, so it can be neither resized nor deleted. Named here because this function bills
 *    itself as the single answer and silently gets that case wrong. */
export function occupiedDepthM(record: PlacementRecord): number {
  if (record.kind === EXTRACTOR_HOOD_KIND) return toMetres(WORKTOP_DEPTH_MM);
  if (record.kind === WALL_CABINET_KIND) {
    return record.frame.d + toMetres(WALL_FRONT_ASSEMBLY_MM);
  }
  return record.frame.d;
}
