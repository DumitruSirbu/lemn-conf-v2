import type { MeasurableSeatedOn } from "./seat-rule.js";
// The one thing `insertBody` cannot do purely: measure a body that does not exist yet. `frameDepthMm`
// measures one specific seeded body, so it cannot seat a body built at an insert-time width, height and
// depth, and §6.2 records two failed attempts at predicting a seat (ADR 0011 Gap B). The domain declares the
// port and the Three.js adapter implements it; declaring an interface imports nothing, which satisfies
// `eslint.config.mjs`'s `no-restricted-imports` block.
export interface BodyProbeRequest {
  readonly buildId: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
  /** Which plane to measure the seat against: a two-member union, deliberately (ADR 0077 decision 3).
   *  `SeatRule.seatedOn` has a third arm, `joint`, so asking the probe to measure a joint-seated body fails
   *  to typecheck instead of throwing at runtime. */
  readonly seatedOn: MeasurableSeatedOn;
}

export interface BodyMeasurement {
  /** §5.2: fit is judged on the carcass, not the faucet-inclusive group (§11 row 7). */
  readonly carcassWidthM: number;
  readonly carcassHeightM: number;
  /** The whole group's height, faucets and hood chimneys included. Reported so a caller can see what rises
   *  into free air; deliberately not a fit gate, per §5.2. */
  readonly fullHeightM: number;
  /** Distance from the group origin to the back face along the wall normal, measured from the bounding box
   *  after construction. `insertBody` persists `2 ×` this as `seatDepthMm`. */
  readonly seatOffsetM: number;
}

export interface BodyProbe {
  /** Must be deterministic: the same request has to yield the same measurement on every call, or a
   *  reloaded design will not reproduce the scene it was saved from. */
  measure(request: BodyProbeRequest): BodyMeasurement;
}

/**
 * A probe borrowed for the length of one bracketed use, and nothing longer. A probe is not plain data: the
 * adapter's implementation closes over a `Kit`, which owns GPU buffers, materials and canvas textures, and
 * a kit built for another depth and never released is a leak per command (exactly one kit is alive per
 * mounted scene, ADR 0074 decision 3).
 *
 * The lease is the use, not a `{ probe, release }` pair (ADR 0076 decision 3): a borrower that must remember
 * a `release` forgets it, so there is none on this side of the interface and the release moves to the site
 * that allocated it. Limit: `lease.use((probe) => probe)` still compiles, as TypeScript has no lifetime; a
 * fake that revokes on release makes an escaped probe fail loudly at the point of use (ADR 0076 decision 5).
 */
export interface BodyProbeLease {
  /** Invokes `borrow` with the probe and releases before returning, on every path including a throw. The
   *  borrower never learns which arm it got: a lease at a depth the lender already has standing releases
   *  nothing, and that is the ordinary case. */
  use<T>(borrow: (probe: BodyProbe) => T): T;
}

/**
 * The only constructor for a lease, and the only `finally` in this seam. `release` is called exactly once
 * per `use`, before it returns, and must be idempotent: a lender whose depth is already standing passes one
 * that frees nothing.
 */
export function createBodyProbeLease(
  probe: BodyProbe,
  release: () => void,
): BodyProbeLease {
  return {
    use(borrow) {
      try {
        return borrow(probe);
      } finally {
        release();
      }
    },
  };
}

/**
 * A probe built at a stated depth, not handed in already built (as `SetCabinetDepthInput.catalogAt`): a
 * `probe: BodyProbe` field would let a caller ask for 700 while passing a probe whose kit is at 600, and the
 * adapter's base, full-height, appliance and hood builders ignore the depth they are handed and build the
 * kit's own (ADR 0018), so the old depth would be persisted as `seatDepthMm` (580 against 680). A factory
 * makes that call site impossible to write.
 */
export type BodyProbeFactory = (cabinetDepthMm: number) => BodyProbeLease;
