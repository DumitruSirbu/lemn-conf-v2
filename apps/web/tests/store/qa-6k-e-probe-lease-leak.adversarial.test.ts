// Adversarial QA for wave 6K-e at the store seam — **the lease the store takes for itself**, which
// is a different lease from the one `setCabinetDepth` takes and releases.
//
// ADR 0074 decision 3 and the wave's own acceptance criterion: *"Exactly one long-lived kit stays
// alive. The probe's kit is transient: built at the target depth, used for the whole command,
// disposed when it ends."* The domain command honours that in a `finally`. The store then leases a
// **second** probe of its own — `bodyProbe` is `leaseAtCurrentDepth(probeAt, design)`, the probe
// `insert` and `setWidth` need — and that is the one this file is about.
//
// **Why a counting factory rather than a real kit.** `disposeKit` is the adapter's; what the store
// can be held to is the port's own contract, which `BodyProbeLease` states: *"`release` is
// idempotent and must be called on every path"*. A lease taken and never released is observable
// here as a subtraction, and it is observable in a browser as a leaked kit's buffers, materials and
// canvas textures.
//
// **The factory is asked for a depth, and it answers whether that depth is the one it is standing
// at.** That is exactly `probeFactoryFor`'s branch in `apps/web/src/scene/kitchen-stage.tsx`: same
// depth, a no-op release over the mounted kit; any other depth, a transient kit that must be freed.
// A store that drops the release of the second kind leaks one kit per depth change.
import {
  createBodyProbeLease,
  type BodyProbeRequest,
} from "@lemnaria/configurator-domain";
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  KITCHEN_L_DESIGN,
  type BodyProbeFactory,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-05T09:00:00.000Z";
const DEEPER_MM = 700;

/** A probe used after its lease was released. The real one would be measuring inside a disposed
 *  kit — shared geometries freed, materials freed, canvas textures freed — which Three.js answers
 *  with a black or invisible object rather than an error (`kit-disposal.ts`). So a fake that stayed
 *  usable would model the *one* outcome the real thing cannot give. */
export class ReleasedProbeUsedError extends Error {
  constructor(cabinetDepthMm: number) {
    super(
      `A probe leased at ${String(cabinetDepthMm)} mm was measured after its lease was released. ` +
        `The kit behind it is disposed.`,
    );
    this.name = "ReleasedProbeUsedError";
  }
}

interface LeaseLedger {
  readonly probeAt: BodyProbeFactory;
  /** One row per lease taken, in call order. */
  readonly leases: { readonly askedForMm: number; released: boolean }[];
  /** Leases over a **transient** kit — one the standing stage is not already holding — still open. */
  readonly leakedTransientKits: () => number;
}

/**
 * The scene's factory, modelled exactly: a lease over the standing stage's own kit for the depth it
 * is standing at, and a transient kit for anything else.
 *
 * **It counts and it revokes.** Counting alone catches the leak below, but it cannot catch the
 * mirror-image defect — a caller that releases correctly and then goes on using the probe — and
 * those two are the pair a lease exists to make impossible. So `release` disposes the fake as well
 * as recording that it was called, and `measure` after that throws.
 *
 * `standingDepthMm` is fixed for the life of the ledger because a mounted stage's kit is: the stage
 * memo re-keys and re-attaches on the *next* React commit, and everything below happens inside the
 * event handler that runs before it.
 */
function leaseLedger(standingDepthMm: number): LeaseLedger {
  const leases: { askedForMm: number; released: boolean }[] = [];
  return {
    leases,
    leakedTransientKits: () =>
      leases.filter(
        (lease) => lease.askedForMm !== standingDepthMm && !lease.released,
      ).length,
    probeAt: (cabinetDepthMm: number) => {
      const row = { askedForMm: cabinetDepthMm, released: false };
      leases.push(row);
      const probe = createFakeBodyProbe({ cabinetDepthMm });
      return createBodyProbeLease(
        {
          measure: (request: BodyProbeRequest) => {
            if (row.released) throw new ReleasedProbeUsedError(cabinetDepthMm);
            return probe.measure(request);
          },
        },
        // Idempotent, as `createBodyProbeLease` expects: a second call is not an error and does not
        // double-count.
        () => {
          row.released = true;
        },
      );
    },
  };
}

function createStore(ledger: LeaseLedger, design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: ledger.probeAt,
    now: () => OCCURRED_AT,
  });
}

describe("the kits a depth change leaves behind", () => {
  // The premise, so nothing below is a claim about an unused factory: the store really does lease.
  // Was "leases at the depth the design holds when the scene attaches", asserting that construction
  // took one lease. **ADR 0076 decision 2 deleted the thing it was watching**: the store publishes no
  // probe, so construction and `attachBodyProbe` take no lease at all and there is nothing to hold.
  // Rewritten rather than removed, because the claim worth keeping is the stronger half of decision
  // 7 — *no transient arm is ever taken in steady state* — which a store that dutifully built and
  // freed a kit per command would satisfy on "leaks nothing" and still fail here.
  it("takes no lease at all when the scene attaches", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);

    createStore(ledger);

    expect(ledger.leases).toEqual([]);
    expect(ledger.leakedTransientKits()).toBe(0);
  });

  // **The finding.** `applyResult` re-derives `bodyProbe` as `leaseAtCurrentDepth(state.probeAt,
  // application.state.design)` — `apps/web/src/store/configurator-store.ts` — and
  // `leaseAtCurrentDepth` returns `probeAt?.(...).probe`, dropping `release` on the floor. The design
  // now carries 700 while the mounted stage is still at 600, so that call takes the *transient* arm
  // of the scene's factory: a kit is built at 700 and nothing ever frees it.
  //
  // One kit per depth change, and the kit is the object ADR 0074 decision 3 says must be unique.
  it("leaks the transient kit the store leases for itself after the change", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(store.getState().design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    expect(ledger.leakedTransientKits()).toBe(0);
  });

  // The same defect compounding, which is what makes it a leak rather than a one-off: a customer
  // toggling the control four times strands four kits.
  it("strands one kit per change over a repeated toggle", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);

    for (const depthMm of [
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
    ]) {
      store.getState().setCabinetDepth(depthMm);
    }

    expect(ledger.leakedTransientKits()).toBe(0);
  });

  // The load half. `hydrate` leases the same way, and a `/d/{id}` link to a 700 mm design opened in
  // a session standing at 600 takes the transient arm on the very first paint.
  it("leaks the kit a hydrate at another depth leases", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);
    const deeper = deepenedDocument();

    store.getState().hydrate({
      design: deeper,
      designId: "d1",
      revision: "1",
      canWrite: true,
    });

    expect(store.getState().design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    expect(ledger.leakedTransientKits()).toBe(0);
  });

  // `detachBodyProbe` is the scene's unmount half. It clears the two published fields and releases
  // nothing, so a lease still open when the stage goes is open forever — the store is module-scoped
  // and outlives the mount.
  it("releases whatever it is still holding when the scene detaches", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);
    store.getState().setCabinetDepth(DEEPER_MM);

    store.getState().detachBodyProbe();

    expect(store.getState().isBodyProbeAttached).toBe(false);
    expect(ledger.leases.every((lease) => lease.released)).toBe(true);
  });
});

// **The mirror-image defect, which counting alone cannot see**: a store that releases its lease
// correctly and then keeps measuring through the probe it was holding. The count would balance and
// the kit would still be disposed under a live probe.
//
// These pass today only because the store never releases at all — a fix for the leak above that
// releases the *published* `bodyProbe` without also dropping it would turn them red, which is the
// whole reason they are here before 6K-f rather than after it.
describe("a probe the store publishes after its lease ended", () => {
  // The premise: the fake really does revoke, or every assertion below is about nothing.
  it("is refused by the ledger's own fake", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const lease = ledger.probeAt(DEEPER_MM);
    const request = {
      buildId: "base-3drawer",
      widthM: 0.6,
      heightM: 0.72,
      depthM: 0.58,
    };

    // Inside the scope the probe answers; `use` releases before it returns, so the smuggled
    // reference is dead afterwards. `use((probe) => probe)` compiling is ADR 0076's stated limit —
    // escape is now something written rather than something missing, and this asserts it fails loud.
    const escaped = lease.use((probe) => {
      expect(() => probe.measure(request)).not.toThrow();
      return probe;
    });

    expect(() => escaped.measure(request)).toThrow(ReleasedProbeUsedError);
  });

  it("is never measured through by an insert after a depth change", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);
    store.getState().setCabinetDepth(DEEPER_MM);

    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const opening = store
      .getState()
      .voids.find((record) => record.col === "A|2.00");
    if (!opening) throw new Error("deleting p1 freed no opening at A|2.00");
    store.getState().select({ kind: "void", id: opening.id });

    expect(() => {
      store.getState().insert("base-3drawer");
    }).not.toThrow();
    expect(store.getState().lastRejection).toBeNull();
  });

  it("is never measured through by a resize after a depth change", () => {
    const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
    const store = createStore(ledger);
    store.getState().setCabinetDepth(DEEPER_MM);

    store.getState().select({ kind: "placement", id: "p0" });

    expect(() => {
      store.getState().setWidth(700);
    }).not.toThrow();
    expect(store.getState().lastRejection).toBeNull();
  });
});

/** The shipped kitchen as the deeper document a save would have stored and a load would return —
 *  through the wire schema, so this is a document the API could actually deliver. */
function deepenedDocument(): Design {
  const ledger = leaseLedger(DEFAULT_CABINET_DEPTH_MM);
  const store = createStore(ledger);
  store.getState().setCabinetDepth(DEEPER_MM);
  return DesignSchema.parse(
    JSON.parse(JSON.stringify(store.getState().design)),
  );
}
