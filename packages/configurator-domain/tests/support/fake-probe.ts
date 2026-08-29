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
import { toMetres } from "../../src/millimetres.js";
import {
  WALL_FRONT_ASSEMBLY_MM,
  WORKTOP_DEPTH_MM,
} from "../../src/worktop-depth.js";

const WALL_FRONT_ASSEMBLY_M = toMetres(WALL_FRONT_ASSEMBLY_MM);
const CABINET_DEPTH_M = toMetres(WORKTOP_DEPTH_MM);

/** How much of a built body rises above its carcass into free air — the sink's faucet, the hood's
 *  chimney. Enough to fail a naive full-extent fit check, which is the point (§11 row 7). */
const FREE_AIR_EXTENT_M = 0.36;

export interface FakeProbeOptions {
  /** Overrides the carcass the probe reports, to drive the built-size re-check. */
  readonly carcassWidthM?: number;
  readonly carcassHeightM?: number;
  readonly seatOffsetM?: number;
}

/** The ids whose real builder stands a door and a bar handle in front of the shell it is given.
 *  `open-shelf` has neither, and every other builder ignores its depth argument (ADR 0018). */
const FRONTED_WALL_BUILD_IDS: ReadonlySet<string> = new Set([
  "wall-cabinet",
  "wall-lift",
]);

/** ADR 0039 decision 1: standard, and exempt from the depth map. */
const HOOD_DEPTH_M = 0.5;

/** Where a body's group origin sits relative to its back face — the one number a fake probe cannot
 *  get from `request.depthM` alone, and the one backlog entry 9 is about: *"a fake probe reports
 *  back the depth it was handed, so a domain test with a fake probe cannot see a depth defect at
 *  all."* Since wave 5F two builders disagree with `depthM / 2`, and both disagreements are
 *  decisions rather than noise, so the fake models them or every domain depth assertion here is
 *  asserting a geometry that is not built.
 *
 *  - **A fronted wall carcass** (ADR 0036 decision 1) is built at its declared depth *less* the
 *    39 mm door-and-handle assembly, so its rear overhang is half of that shell.
 *  - **A hood** (ADR 0039 decision 2) is hung from the front: its front face lands on the
 *    cabinet-depth line and the gap goes behind it, so its origin sits `cabinetDepth − 250` off the
 *    wall whatever depth it was handed. §11 row 19's second named exception.
 *
 *  `packages/three-adapter/tests/measure-built-body.test.ts` is the authority; this only has to
 *  agree with it, which `insert-depth.qa.test.ts` in that package checks against the real probe. */
function seatOffsetFor(request: BodyProbeRequest): number {
  if (request.buildId === "hood") {
    return CABINET_DEPTH_M - HOOD_DEPTH_M / 2;
  }
  if (FRONTED_WALL_BUILD_IDS.has(request.buildId)) {
    return (request.depthM - WALL_FRONT_ASSEMBLY_M) / 2;
  }
  return request.depthM / 2;
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
        seatOffsetM: options.seatOffsetM ?? seatOffsetFor(request),
      };
    },
  };
}
