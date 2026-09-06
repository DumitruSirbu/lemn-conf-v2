import type { MeasurableSeatedOn } from "./seat-rule.js";
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
  /** **Which plane to measure the seat against — and a two-member union, deliberately** (ADR 0077
   *  decision 3). `SeatRule.seatedOn` has three arms; `joint` is not one of them here, so asking the
   *  probe to measure a joint-seated body does not typecheck rather than throwing at runtime. This
   *  is also what lets the adapter delete its own `FRONT_ALIGNED_BUILD_IDS` list: the request now
   *  carries the fact the list was standing in for. */
  readonly seatedOn: MeasurableSeatedOn;
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
 * A probe borrowed for the length of one bracketed use, and nothing longer.
 *
 * **Why a lease and not a probe.** A probe is not plain data: the adapter's implementation closes
 * over a `Kit`, which owns GPU buffers, materials and canvas textures. A caller that needs a probe
 * at a depth other than the one the scene is standing at has to build a kit for it, and a kit built
 * and never released is a leak per command (ADR 0074 decision 3 — exactly one kit is alive per
 * mounted scene).
 *
 * **Why the lease *is* the use, rather than a pair of fields** (ADR 0076 decision 3). A
 * `{ probe, release }` shape asks every borrower to remember an obligation, and the web store forgot
 * it at five call sites — including the load path, so a `/d/{id}` link at another depth stranded a
 * kit on first paint. `.probe` was the whole of that defect, so `.probe` is gone: there is no
 * `release` to forget because there is no `release` on this side of the interface, and the release
 * moves to the site that allocated it.
 *
 * **The honest limit**, recorded rather than glossed: `lease.use((probe) => probe)` still compiles.
 * TypeScript has no lifetime. What changes is that smuggling a probe past its scope is now something
 * a reviewer can see being *written*, where the leak was something a reader had to notice being
 * *missing* — and a fake that revokes on release makes the escaped probe fail loudly at the point of
 * use rather than answering (ADR 0076 decision 5).
 */
export interface BodyProbeLease {
  /** Invokes `borrow` with the probe and releases before returning, on every path including a
   *  throw. The borrower never learns which arm it got — a lease at a depth the lender already has
   *  standing releases nothing, and that is the ordinary case. */
  use<T>(borrow: (probe: BodyProbe) => T): T;
}

/**
 * The only constructor for a lease, and **the only `finally` in this seam**.
 *
 * `release` is called exactly once per `use`, before it returns, and is expected to be idempotent —
 * a lender whose depth is already standing passes one that frees nothing.
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
