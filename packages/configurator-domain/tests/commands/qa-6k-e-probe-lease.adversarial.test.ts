// Adversarial QA for wave 6K-e's lease, at the seam that owns it.
//
// `setCabinetDepth` leases a probe and releases it in a `finally`. The lease is not bookkeeping: the
// adapter's factory builds a **transient kit** for any depth the mounted stage is not standing at,
// and a kit owns buffers, materials and canvas textures (ADR 0074 decision 3 — exactly one kit is
// alive per mounted scene). A path that leaks one leaks it per command.
//
// The wave's own file asserts the happy path. Everything here is a path that does *not* reach the
// end of the rebuild: the two refusals before the lease is taken, the refusal in the middle of it,
// and a probe that throws.
//
// **The lease is counted, not inspected.** A test that asked the command whether it released would
// be asking the thing under test; this hands it a factory that records, so `acquired` and
// `released` are two independent numbers and a leak is a subtraction.
import { describe, expect, it } from "vitest";

import type { BodyProbe, BodyProbeFactory } from "../../src/body-probe.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
} from "../../src/worktop-depth.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEEPER_MM = 700;

interface CountingFactory {
  readonly probeAt: BodyProbeFactory;
  /** Every depth the factory was asked to build a probe at, in call order. */
  readonly askedForMm: number[];
  readonly acquired: () => number;
  readonly released: () => number;
}

/** A factory that counts, wrapping whatever probe a test wants behind it. */
function countingFactory(
  probeFor: (cabinetDepthMm: number) => BodyProbe = (cabinetDepthMm) =>
    createFakeProbe({ catalog: buildKitchenLBodyCatalog(cabinetDepthMm) }),
): CountingFactory {
  const askedForMm: number[] = [];
  let acquired = 0;
  let released = 0;
  return {
    askedForMm,
    acquired: () => acquired,
    released: () => released,
    probeAt: (cabinetDepthMm: number) => {
      askedForMm.push(cabinetDepthMm);
      acquired += 1;
      return {
        probe: probeFor(cabinetDepthMm),
        release: () => {
          released += 1;
        },
      };
    },
  };
}

function changeTo(
  design: Design,
  cabinetDepthMm: number,
  factory: CountingFactory,
  occurredAt: string = OCCURRED_AT,
) {
  return setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: factory.probeAt,
    occurredAt,
  });
}

describe("the probe lease a depth change takes", () => {
  it("is released on the path that succeeds", () => {
    const factory = countingFactory();

    const result = changeTo(KITCHEN_L_DESIGN, DEEPER_MM, factory);

    expect(result.ok).toBe(true);
    // A floor on the arm under test: a command that never leased would trivially satisfy
    // `acquired === released`, and this file would certify nothing.
    expect(factory.acquired()).toBe(1);
    expect(factory.released()).toBe(1);
  });

  // **The lease is taken at the depth being moved to, never at the one being left.** A factory asked
  // for the old depth is the pre-6K-e application verbatim (ADR 0074's finding).
  it.each(declaredCabinetDepthsMm())(
    "is taken at %i mm and at no other depth",
    (cabinetDepthMm) => {
      const factory = countingFactory();

      changeTo(KITCHEN_L_DESIGN, cabinetDepthMm, factory);

      expect(factory.askedForMm).toEqual([cabinetDepthMm]);
    },
  );

  // The two refusals ahead of the lease. Nothing to release is the strongest form of released, and
  // it is asserted as "the factory was never called" rather than as a balanced count, which a
  // leaking command could also produce.
  it("is never taken when the timestamp is refused", () => {
    const factory = countingFactory();

    const result = changeTo(
      KITCHEN_L_DESIGN,
      DEEPER_MM,
      factory,
      "not-a-timestamp",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
    expect(factory.acquired()).toBe(0);
  });

  it.each([0, -600, 599, 650, 701, 1200, Number.NaN, Number.POSITIVE_INFINITY])(
    "is never taken for the undeclared depth %p",
    (cabinetDepthMm) => {
      const factory = countingFactory();

      const result = changeTo(KITCHEN_L_DESIGN, cabinetDepthMm, factory);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.code).toBe("UNKNOWN_CABINET_DEPTH");
      expect(factory.acquired()).toBe(0);
    },
  );

  // **The refusal in the middle of the rebuild**, which is one of the two the `finally` exists for:
  // the lease is already open when `rebuild` returns a refusal for a body part-way down the loop.
  //
  // Reached through the probe rather than through a malformed design, because the built-carcass
  // re-check is the one guard inside `rebuild` a depth change can actually trip — a probe reporting a
  // carcass wider than the opening it was asked for is exactly what `refuseBuiltSize` is for.
  it("is released when the rebuild refuses part-way through", () => {
    const factory = countingFactory((cabinetDepthMm) =>
      createFakeProbe({
        catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
        carcassWidthM: 9,
      }),
    );

    const result = changeTo(KITCHEN_L_DESIGN, DEEPER_MM, factory);

    expect(result.ok).toBe(false);
    expect(factory.acquired()).toBe(1);
    expect(factory.released()).toBe(1);
  });

  // **The branch the module documents as a refusal is a throw**, and the lease survives it either
  // way — which is the property this file is about. Recorded as a finding rather than asserted as
  // desirable: `set-cabinet-depth.ts`'s `!record` guard says *"a body this command cannot resolve is
  // a refusal, never a pass-through"*, but `derivePlacementRecords` is a 1:1 `map` that calls
  // `lookupDefinition` first, so an id the catalogue does not hold throws `UnknownBodyError` before
  // the loop starts and `TARGET_NOT_FOUND` is unreachable from this command.
  it("is released when an unknown build id crashes the rebuild", () => {
    const factory = countingFactory();
    const [first] = KITCHEN_L_DESIGN.placements;
    if (!first) throw new Error("the seeded kitchen holds no placement");
    const withAStranger: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        ...KITCHEN_L_DESIGN.placements,
        {
          ...first,
          id: "not-in-the-catalogue",
          body: { ...first.body, buildId: "no-such-body" },
        },
      ],
    };

    expect(() => changeTo(withAStranger, DEEPER_MM, factory)).toThrow(
      /no-such-body/,
    );
    expect(factory.acquired()).toBe(1);
    expect(factory.released()).toBe(1);
  });

  // A probe that throws is the live crash `measure-built-body.ts` carried for two waves: the real
  // one threw `No catalog builder registered` for every seeded decomposition id. The command does
  // not catch it — it must not, a swallowed builder crash is how that defect survived — but the kit
  // must still be freed on the way out.
  it("is released when the probe throws, and the throw is not swallowed", () => {
    const factory = countingFactory(() => ({
      measure: () => {
        throw new Error("No catalog builder registered");
      },
    }));

    expect(() => changeTo(KITCHEN_L_DESIGN, DEEPER_MM, factory)).toThrow(
      /No catalog builder registered/,
    );
    expect(factory.acquired()).toBe(1);
    expect(factory.released()).toBe(1);
  });

  // The seat is written from the probe the lease handed over, so a command that kept a reference and
  // measured after releasing would be measuring a disposed kit. Asserted as ordering rather than as
  // a count: every measurement happens before the release.
  it("takes every measurement before it releases", () => {
    const events: string[] = [];
    const probeAt: BodyProbeFactory = (cabinetDepthMm: number) => {
      const inner = createFakeProbe({
        catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
      });
      return {
        probe: {
          measure: (request) => {
            events.push("measure");
            return inner.measure(request);
          },
        },
        release: () => events.push("release"),
      };
    };

    const result = setCabinetDepth({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEPER_MM,
      probeAt,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    expect(
      events.filter((event) => event === "measure").length,
    ).toBeGreaterThan(0);
    expect(events.indexOf("release")).toBe(events.length - 1);
  });
});

// **A depth change that is not a change still leases.** The store reaches this whenever the sheet is
// applied unchanged, and the adapter's factory answers it with the standing stage's own probe and a
// release that frees nothing. Asserted so a future short-circuit cannot skip the release with it.
describe("a depth change to the depth already held", () => {
  it("still balances its lease", () => {
    const factory = countingFactory();

    const result = changeTo(
      KITCHEN_L_DESIGN,
      DEFAULT_CABINET_DEPTH_MM,
      factory,
    );

    expect(result.ok).toBe(true);
    expect(factory.acquired()).toBe(factory.released());
    expect(factory.released()).toBeGreaterThan(0);
  });
});

// The factory that ships as the domain's own test double must itself follow the depth it is asked
// for, or every suite above it is measuring one catalogue at two names.
//
// **Asked of a `wall-plane` row on purpose.** A `recorded-shell` row's seat is a function of the
// *request*, so it would answer differently at two depths even from a factory pinned at one — the
// arm that can hide a pinned factory is the one whose seat is read off the catalogue.
describe("the fake factory these suites run against", () => {
  it("builds a different catalogue per declared depth", () => {
    const factory = createFakeProbeFactory();
    const request = {
      buildId: "base-3drawer",
      widthM: 0.6,
      heightM: 0.72,
      depthM: 0.58,
    };

    const seats = declaredCabinetDepthsMm().map((cabinetDepthMm) => {
      const lease = factory(cabinetDepthMm);
      const seat = lease.probe.measure(request).seatOffsetM;
      lease.release();
      return seat;
    });

    expect(new Set(seats).size).toBe(declaredCabinetDepthsMm().length);
  });

  // **A caller that passes its own catalogue silently gets a pinned factory.**
  // `createFakeProbeFactory`'s body is `catalog: options.catalog ?? buildKitchenLBodyCatalog(cabinetDepthMm)`,
  // so a stated catalogue shadows the depth argument entirely. No caller does this today, which is
  // why the trap is latent rather than active; this is what makes it loud the day one does.
  it("ignores the depth it is asked for when a catalogue is passed", () => {
    const pinnedAt600 = createFakeProbeFactory({
      catalog: buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    });
    const request = {
      buildId: "base-3drawer",
      widthM: 0.6,
      heightM: 0.72,
      depthM: 0.58,
    };

    const atDefault = pinnedAt600(DEFAULT_CABINET_DEPTH_MM).probe.measure(
      request,
    ).seatOffsetM;
    const atDeeper = pinnedAt600(DEEPER_MM).probe.measure(request).seatOffsetM;

    // Documented as observed behaviour, not endorsed: the two must differ for an honest factory and
    // they do not. Reported as finding QA-6Kde-3.
    expect(atDeeper).toBe(atDefault);
  });
});
