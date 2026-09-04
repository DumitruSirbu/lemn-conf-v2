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

/**
 * A probe borrowed for the length of one command, and the thing that must give it back.
 *
 * **Why a lease and not a probe.** A probe is not plain data: the adapter's implementation closes
 * over a `Kit`, which owns GPU buffers, materials and canvas textures. A caller that needs a probe
 * at a depth other than the one the scene is standing at has to build a kit for it, and a kit built
 * and never released is a leak per command (ADR 0074 decision 3 — exactly one kit is alive per
 * mounted scene). Handing back a bare `BodyProbe` gives the borrower no way to say when it is done,
 * and gives the lender no way to know.
 *
 * `release` is idempotent and must be called on every path, success or refusal. A lease whose depth
 * the lender already has standing may release nothing at all — that is the ordinary case, and it is
 * why the borrower never asks which.
 */
export interface BodyProbeLease {
  readonly probe: BodyProbe;
  readonly release: () => void;
}

/**
 * **A probe built at a stated depth, rather than one handed in already built.**
 *
 * The same ruling `SetCabinetDepthInput.catalogAt` carries and for the same reason: a `probe:
 * BodyProbe` field lets a caller ask for 700 while passing a probe whose kit is at 600, and nothing
 * downstream can tell — the adapter's base, full-height, appliance and hood builders **ignore the
 * depth they are handed and build the kit's own** (ADR 0018), so the measurement comes back at the
 * old depth and is persisted as `seatDepthMm`. Measured, not argued: 580 from a 600-kit probe
 * against 680 from a 700-kit one, on the same 600 → 700 change
 * (`packages/three-adapter/tests/qa-6k-b-probe-kit-depth.adversarial.test.ts`).
 *
 * A factory makes that call site impossible to write instead of merely wrong.
 */
export type BodyProbeFactory = (cabinetDepthMm: number) => BodyProbeLease;
