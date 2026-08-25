// The fake `BodyProbe` the domain's own command tests run against.
//
// This is what proves the port is honest: if `insertBody` needed anything from Three.js beyond
// "here are four numbers about the built body", these tests could not exist without a renderer.
// It is deliberately deterministic — the same request yields the same measurement — because that
// is an acceptance criterion of the real probe, not an accident of the fake.
import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "../../src/body-probe.js";

/** How much of a built body rises above its carcass into free air — the sink's faucet, the hood's
 *  chimney. Enough to fail a naive full-extent fit check, which is the point (§11 row 7). */
const FREE_AIR_EXTENT_M = 0.36;

export interface FakeProbeOptions {
  /** Overrides the carcass the probe reports, to drive the built-size re-check. */
  readonly carcassWidthM?: number;
  readonly carcassHeightM?: number;
  readonly seatOffsetM?: number;
}

/** Measures exactly what it was asked to build, so an insert that passed the pre-probe guards
 *  succeeds unless a test deliberately says otherwise. */
export function createFakeProbe(options: FakeProbeOptions = {}): BodyProbe & {
  readonly requests: BodyProbeRequest[];
} {
  const requests: BodyProbeRequest[] = [];
  return {
    requests,
    measure(request: BodyProbeRequest): BodyMeasurement {
      requests.push(request);
      const carcassHeightM = options.carcassHeightM ?? request.heightM;
      return {
        carcassWidthM: options.carcassWidthM ?? request.widthM,
        carcassHeightM,
        fullHeightM: carcassHeightM + FREE_AIR_EXTENT_M,
        seatOffsetM: options.seatOffsetM ?? request.depthM / 2,
      };
    },
  };
}
