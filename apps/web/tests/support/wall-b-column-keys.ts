// ADR 0090 decision 2: **a wall-B column's key is a function of the cabinet-depth setting.**
//
// Both walls walk from the room's corner, so a wall-A body's *depth* is measured along wall B: when
// the setting deepens the corner body, the space it takes comes out of wall B and the whole run
// slides. `deriveColumnKeyAt` buckets on that coordinate, so every wall-B key moves with it —
// `base-formula` by 100 mm between the two declared settings and `wall-map` by 70.
//
// A test that names `B|1.80` is therefore naming a coordinate at a **setting**, not a column. The
// assertions in this suite are unchanged; only the anchors they are hung on became
// setting-dependent, which is exactly what ADR 0090 decision 7 says of the fixtures it permits to
// move.
//
// **Stated as measured literals rather than computed through the production reader.** Running
// `alongWallExtentPositionAtMm` here would make every one of these tests assert the shift against
// itself; ADR 0090's own measurement table is the source of the pairs below, so a wave that changed
// a chain turns these red rather than carrying them along.
const AT_THE_DEEPER_SETTING: Readonly<Record<string, string>> = {
  // `wall-corner-return-570`/`-top`, the one `wall-map` column on the wall: +70 mm.
  "B|0.61": "B|0.69",
  // The four `base-formula` columns: +100 mm each.
  "B|0.74": "B|0.84",
  "B|1.20": "B|1.30",
  "B|1.80": "B|1.90",
  "B|2.45": "B|2.55",
};

/** The 700 mm setting, named here rather than imported from a test that happens to declare one. */
const DEEPER_MM = 700;

/** The key this column is filed under at that setting. Wall A is anchored at the corner and does not
 *  move, so an `A|…` key passes through untouched — as does any wall-B key the table above does not
 *  name, which is the shape a new fixture column would arrive in and is meant to fail loudly at the
 *  assertion rather than quietly here. */
export function columnKeyAt(key: string, cabinetDepthMm: number): string {
  if (cabinetDepthMm !== DEEPER_MM) return key;
  return AT_THE_DEEPER_SETTING[key] ?? key;
}
