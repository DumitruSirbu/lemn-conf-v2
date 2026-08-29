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
 *  - **Everything else** builds its own depth and ignores what it is handed, so its rear overhang
 *    already is the space it fills. */
export function occupiedDepthM(record: PlacementRecord): number {
  if (record.kind === EXTRACTOR_HOOD_KIND) return toMetres(WORKTOP_DEPTH_MM);
  if (record.kind === WALL_CABINET_KIND) {
    return record.frame.d + toMetres(WALL_FRONT_ASSEMBLY_MM);
  }
  return record.frame.d;
}
