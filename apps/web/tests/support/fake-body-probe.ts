// The `BodyProbe` the store's command tests run against.
//
// The real probe needs Three.js, a `Kit` and a mounted room; the port exists so the store can be
// tested without any of them. Deterministic on purpose — the same request yields the same
// measurement — because that is a stated requirement of the real probe (ADR 0011 Gap B).
//
// **It reads the entry's `occupiedDepth` declaration rather than answering the request** (M6 wave
// 6K-d, ADR 0075 decision 3), which is the same correction wave S9 made to the domain's own fake one
// package over. Until 2026-09-04 this returned `request.depthM / 2`, modelling **every** builder as
// consuming the depth it is handed. Two recorded findings are the two halves of what that hid, and
// one honest fake closes both rather than each wave patching it:
//
//   - **The builders that consume their depth** — `wallCabinet` and `openShelf`, ADR 0018's own list
//     — build `D − frontAssembly` centred on z = 0, so the real probe measures 39 mm less than it
//     was asked for. Answering the request made a 600 → 700 → 600 round trip return two wall columns
//     39 mm deep, which ADR 0075 decision 2 traced to this file rather than to the catalogue.
//   - **The builders that ignore their depth** — base, full-height, appliance and hood — build the
//     **kit's** depth whatever they are handed (`baseCabinet`'s closure `CARC_D`). Answering the
//     request hid ADR 0074's finding entirely: the store's depth suites were green while a live
//     defect wrote base seats measured at the depth the session was leaving.
//
// `cabinetDepthMm` is therefore **the depth this fake pretends its kit was built at**, not a depth it
// is asked to build to. The two are the same thing for a real probe and that is the point: a test
// that wants to model the application's mistake passes the old depth deliberately.
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  toMetres,
  type BodyCatalog,
  type BodyMeasurement,
  type BodyProbe,
  type BodyProbeFactory,
  type BodyProbeRequest,
  createBodyProbeLease,
  type BodyProbeLease,
} from "@lemnaria/configurator-domain";
import { isCatalogBuildId } from "@lemnaria/three-adapter";

/** How much of a built body rises above its carcass into free air — a faucet, a hood chimney. */
const FREE_AIR_EXTENT_M = 0.36;

export interface FakeBodyProbeOptions {
  /** The depth the kit behind this probe is pretending to have been built at. Defaults to the
   *  declared default, which is what every caller predating wave 6K-d meant. */
  readonly cabinetDepthMm?: number;
}

/**
 * **The arm is chosen by whether the builder consumes the request, not by `measuredFrom`.**
 *
 * Measured with the real probe on 2026-09-04, not reasoned about: a **decomposition**
 * (`buildDecomposedBody`) takes no size argument at all, so its seat is identical whether it is
 * asked for its declared depth or twice it — 291 at a 600 kit and 361 at a 700 one for
 * `wall-corner-return-570`, unchanged by the request either time. Only a **catalogue** row can
 * consume a depth, and of those only the two ADR 0018 names — `wallCabinet` and `openShelf` — do,
 * which is what `recorded-shell` marks.
 *
 * Asking `measuredFrom` alone gets a decomposition wrong: `wall-corner-return-570` declares
 * `recorded-shell`, so the front assembly would be subtracted from a request its builder never sees,
 * writing 252 where the real probe writes 291 — a column 39 mm shallow at the depth it started at.
 *
 * `isCatalogBuildId` is the adapter's own predicate rather than a list restated here, for the reason
 * `build-any-body.ts` exists: two copies of "which builder owns this id" is the defect that wave
 * found.
 *
 * **A stated limit.** For a decomposition this answers the entry's declared `frameDepthMm`, which is
 * the fixture's own contract — each value is `2 x` the body's measured seat. `base-corner-x-900`
 * does not honour it: it declares 560 and the real probe measures 600. That gap is reported as a
 * finding rather than papered over here, because a fake that special-cased it would be encoding a
 * defect rather than modelling a builder.
 *
 * A build id the catalogue does not hold falls back to the request. Kept rather than thrown because
 * the store's suites insert synthetic ids that never reach a real builder, and a throw would turn
 * those into crashes rather than measurements.
 */
function seatOffsetFor(
  catalog: BodyCatalog,
  request: BodyProbeRequest,
): number {
  const definition = catalog.get(request.buildId);
  if (!definition) return request.depthM / 2;
  const { occupiedDepth, frameDepthMm } = definition;
  const consumesTheRequest =
    isCatalogBuildId(request.buildId) &&
    occupiedDepth.measuredFrom === "recorded-shell";
  if (consumesTheRequest) {
    return (request.depthM - toMetres(occupiedDepth.frontAssemblyMm)) / 2;
  }
  return toMetres(frameDepthMm) / 2;
}

/** Measures what the builder would actually produce, so an insert that passed the domain's guards
 *  succeeds rather than tripping the built-size re-check. */
export function createFakeBodyProbe(
  options: FakeBodyProbeOptions = {},
): BodyProbe {
  const catalog = buildKitchenLBodyCatalog(
    options.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
  );
  return {
    measure(request: BodyProbeRequest): BodyMeasurement {
      return {
        carcassWidthM: request.widthM,
        carcassHeightM: request.heightM,
        fullHeightM: request.heightM + FREE_AIR_EXTENT_M,
        seatOffsetM: seatOffsetFor(catalog, request),
      };
    },
  };
}

/**
 * The `BodyProbeFactory` the store takes, backed by the fake above.
 *
 * **It builds at the depth it is asked for**, which is the behaviour wave 6K-e gives the application:
 * a probe measuring a 600 → 700 change is built by a 700 kit. Before that wave the store handed
 * `setCabinetDepth` the scene's standing probe, whose kit was at the depth the session was *leaving*
 * — `createPinnedFakeProbeFactory` is how a test models that deliberately.
 *
 * The lease **counts and revokes** — see `revokingLease`. Pass a ledger to assert that leases taken
 * equal leases released.
 */
export function createFakeProbeFactory(ledger?: {
  take: () => void;
  release: () => void;
}): BodyProbeFactory {
  return (cabinetDepthMm: number) =>
    revokingLease(createFakeBodyProbe({ cabinetDepthMm }), ledger);
}

/** A factory whose kit never moves, whatever depth it is asked for — the application's behaviour
 *  before wave 6K-e, so a test can assert what that costs rather than describing it. */
export function createPinnedFakeProbeFactory(
  cabinetDepthMm: number,
): BodyProbeFactory {
  const probe = createFakeBodyProbe({ cabinetDepthMm });
  return () => revokingLease(probe);
}

/**
 * A lease over a fake probe that **counts and revokes** (ADR 0076 decision 5).
 *
 * Every fake in this repo used to return `release: () => undefined` and a probe that kept working
 * afterwards, which is precisely why a dropped release was invisible at the store layer — that
 * leniency has now been the reason four separate defects were green. So a fake lease records that it
 * was taken and released, and `measure` after release throws rather than answering.
 *
 * **Revoking is deliberately stricter than reality, and that is the point.** A real probe over a
 * disposed kit does not throw; it measures a black or invisible object. A fake may be stricter than
 * the thing it stands for **when reality's failure is silent** — that is the only kind of infidelity
 * that makes a test more truthful.
 */
export class ReleasedProbeUsedError extends Error {
  constructor() {
    super(
      "measure() was called on a probe whose lease had already been released",
    );
    this.name = "ReleasedProbeUsedError";
  }
}

export interface LeaseLedger {
  readonly taken: number;
  readonly released: number;
}

export function createLeaseLedger(): LeaseLedger & {
  take: () => void;
  release: () => void;
} {
  const counts = { taken: 0, released: 0 };
  return {
    get taken() {
      return counts.taken;
    },
    get released() {
      return counts.released;
    },
    take: () => {
      counts.taken += 1;
    },
    release: () => {
      counts.released += 1;
    },
  };
}

/** Wraps a probe in a lease that revokes it on release. `release` stays idempotent. */
function revokingLease(
  probe: BodyProbe,
  ledger?: { take: () => void; release: () => void },
): BodyProbeLease {
  let released = false;
  ledger?.take();
  const guarded: BodyProbe = {
    measure: (request) => {
      if (released) throw new ReleasedProbeUsedError();
      return probe.measure(request);
    },
  };
  return createBodyProbeLease(guarded, () => {
    if (released) return;
    released = true;
    ledger?.release();
  });
}
