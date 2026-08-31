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
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../../src/millimetres.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";

/** How much of a built body rises above its carcass into free air — the sink's faucet, the hood's
 *  chimney. Enough to fail a naive full-extent fit check, which is the point (§11 row 7). */
const FREE_AIR_EXTENT_M = 0.36;

export interface FakeProbeOptions {
  /** Overrides the carcass the probe reports, to drive the built-size re-check. */
  readonly carcassWidthM?: number;
  readonly carcassHeightM?: number;
  readonly seatOffsetM?: number;
  /** The catalogue the probe reads a body's declared depth off. Defaults to the seeded one; a test
   *  that inserts a synthetic entry passes the catalogue it added it to. */
  readonly catalog?: BodyCatalog;
}

/** A build id the seeded catalogue does not hold, which a fake probe cannot seat: the seat of a
 *  body whose builder ignores its depth argument is a property of that body, and there is nothing
 *  to read it off. A test with such an id passes `seatOffsetM` explicitly instead. */
export class UnseatableFakeBodyError extends Error {
  constructor(buildId: string) {
    super(
      `The fake probe cannot seat buildId "${buildId}": no catalogue entry declares its depth. ` +
        `Pass \`seatOffsetM\` to state the seat this test needs.`,
    );
    this.name = "UnseatableFakeBodyError";
  }
}

function requireDefinition(
  catalog: BodyCatalog,
  buildId: string,
): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new UnseatableFakeBodyError(buildId);
  return definition;
}

/** Where a body's group origin sits relative to its back face — the one number a fake probe cannot
 *  get from `request.depthM` alone, and the one backlog entry 9 is about: *"a fake probe reports
 *  back the depth it was handed, so a domain test with a fake probe cannot see a depth defect at
 *  all."*
 *
 *  **Read off the catalogue's own `occupiedDepth` declaration, not re-typed here** (wave S9). The
 *  two arms are exactly the two builder families that declaration names:
 *
 *  - A **`recorded-shell`** entry is a carcass whose builder consumes the depth it is handed and
 *    centres the shell on z = 0, so the shell is the requested finished depth less what stands in
 *    front of it — 39 mm for a fronted wall carcass (ADR 0036 decision 1), nothing for an open
 *    shelf — and the seat is half of that.
 *  - A **`wall-plane`** entry's builder ignores the depth argument altogether (ADR 0018) and always
 *    produces the same body, so its seat is the one its catalogue entry declares. `frameDepthMm` is
 *    that number by construction: the fixture's own contract is that each value is `2 ×` the body's
 *    measured seat offset. It covers the front-hung hood without a second rule — 700 for a body
 *    that is 500 deep, §11 row 19's second named exception.
 *
 *  Before wave S9 the fallback was `request.depthM / 2`, which modelled **every** builder as
 *  consuming its depth. It was DOM-002's defect wearing the other hat: a base body handed a 620 mm
 *  opening reported a 620 mm seat, where the real builder reports 580 whatever it is handed. The
 *  duplicated `FRONTED_WALL_BUILD_IDS` set this file used to carry — the ADR 0028 shape its own
 *  comment complained about — is gone with it: there is one declaration and this reads it. */
function seatOffsetFor(
  catalog: BodyCatalog,
  request: BodyProbeRequest,
): number {
  const { occupiedDepth, frameDepthMm } = requireDefinition(
    catalog,
    request.buildId,
  );
  if (occupiedDepth.measuredFrom === "recorded-shell") {
    return (request.depthM - toMetres(occupiedDepth.frontAssemblyMm)) / 2;
  }
  return toMetres(frameDepthMm) / 2;
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
        seatOffsetM:
          options.seatOffsetM ??
          seatOffsetFor(options.catalog ?? KITCHEN_L_BODY_CATALOG, request),
      };
    },
  };
}
