// The one thing `insertBody` cannot do purely: measure a body that does not exist yet.
//
// ADR 0011 Gap B. `frameDepthMm` is a measurement of one specific seeded body, so it cannot seat a
// body built at a width, height and depth chosen at insert time — and §6.2 records two failed
// attempts at *predicting* a seat instead of measuring one. The domain declares the port; the
// Three.js adapter implements it in Wave 3B. Declaring an interface imports nothing, which is what
// keeps `eslint.config.mjs`'s `no-restricted-imports` block satisfied.
export interface BodyProbeRequest {
  readonly buildId: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
}

export interface BodyMeasurement {
  /** §5.2: fit is judged on the CARCASS. The sink base once measured 1220 mm because of its
   *  faucet and was refused from an 860 mm opening it fits perfectly (§11 row 7). */
  readonly carcassWidthM: number;
  readonly carcassHeightM: number;
  /** The whole group's height, faucets and hood chimneys included. Reported so a caller can see
   *  what rises into free air; deliberately not a fit gate, per §5.2. */
  readonly fullHeightM: number;
  /** Distance from the group origin to the back face along the wall normal, measured from the
   *  bounding box after construction. `insertBody` persists `2 ×` this as `seatDepthMm`. */
  readonly seatOffsetM: number;
}

export interface BodyProbe {
  /** Must be deterministic: the same request has to yield the same measurement on every call, or
   *  a reloaded design will not reproduce the scene it was saved from. */
  measure(request: BodyProbeRequest): BodyMeasurement;
}
