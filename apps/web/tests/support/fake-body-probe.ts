// The `BodyProbe` the store's command tests run against.
//
// The real probe needs Three.js, a `Kit` and a mounted room; the port exists so the store can be
// tested without any of them. Deterministic on purpose — the same request yields the same
// measurement — because that is a stated requirement of the real probe (ADR 0011 Gap B).
import type {
  BodyMeasurement,
  BodyProbe,
  BodyProbeRequest,
} from "@lemnaria/configurator-domain";

/** How much of a built body rises above its carcass into free air — a faucet, a hood chimney. */
const FREE_AIR_EXTENT_M = 0.36;

/** Measures exactly what it was asked to build, so an insert that passed the domain's guards
 *  succeeds rather than tripping the built-size re-check. */
export function createFakeBodyProbe(): BodyProbe {
  return {
    measure(request: BodyProbeRequest): BodyMeasurement {
      return {
        carcassWidthM: request.widthM,
        carcassHeightM: request.heightM,
        fullHeightM: request.heightM + FREE_AIR_EXTENT_M,
        seatOffsetM: request.depthM / 2,
      };
    },
  };
}
