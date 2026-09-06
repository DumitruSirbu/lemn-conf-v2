// Adversarial QA on **the fake this package's command suites run against**, after wave 6K-d made
// its counterpart in `apps/web` honest.
//
// The two fakes model the same builders and they now disagree. `apps/web/tests/support/fake-body-probe.ts`
// chooses its arm on **whether the builder consumes the request**, and its own comment says why in
// the exact words this file is testing:
//
//   > Asking `measuredFrom` alone gets a decomposition wrong: `wall-corner-return-570` declares
//   > `recorded-shell`, so the front assembly would be subtracted from a request its builder never
//   > sees, writing 252 where the real probe writes 291 — a column 39 mm shallow at the depth it
//   > started at.
//
// **`packages/configurator-domain/tests/support/fake-probe.ts:87` asks `measuredFrom` alone.** So
// the correction wave 6K-d made one package over was not made here, and the two doubles for one port
// answer differently for the same body.
//
// **It is not a body nobody measures.** The four seeded ids with no `catalogEquivalentId` are the
// ones `setCabinetDepth`'s `reseat` arm hands to the probe on **every** depth change, and two of
// them — `wall-corner-return-570` and `wall-corner-return-570-top` — are decompositions declaring
// `recorded-shell`. `reseat` writes twice the answer straight into `seatDepthMm`.
//
// **The oracle is not written down here.** The entry's own `frameDepthMm` is what a decomposition's
// seat has to be — its builder takes no size, so its seat is a fact about the body — and that
// contract is held to the real geometry at both declared depths by
// `packages/three-adapter/tests/qa-6k-d-frame-depth-fixed-point.adversarial.test.ts`, which measures
// the built group's rear face rather than trusting the declaration.
import { measurableSeatOf } from "../../src/seat-rule.js";
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMetres, toMillimetres } from "../../src/millimetres.js";
import { declaredCabinetDepthsMm } from "../../src/worktop-depth.js";
import { createFakeProbe, createFakeProbeFactory } from "./fake-probe.js";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";

/** The seeded ids a depth change cannot resolve to a catalogue equivalent, so `reseat` handles them
 *  as they are. Derived from the declaration rather than listed.
 *
 *  **Joint-seated entries are excluded, and by their own declaration** (ADR 0077 decision 1). Since
 *  that ruling `reseat` does not measure them at all — it removes any stored seat and lets the
 *  declaration answer — so asking the probe for one is not a wrong number, it is a
 *  `JointSeatIsNotMeasurableError`. They are asserted separately below rather than dropped. */
function reseatedBuildIds(cabinetDepthMm: number): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  return [
    ...new Set(KITCHEN_L_DESIGN.placements.map((p) => p.body.buildId)),
  ].filter(
    (buildId) =>
      catalog.get(buildId)?.catalogEquivalentId === undefined &&
      catalog.get(buildId)?.seatRule?.seatedOn !== "joint",
  );
}

/** The joint-seated ids among the seeded population, by declaration. */
function jointSeatedBuildIds(cabinetDepthMm: number): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  return [
    ...new Set(KITCHEN_L_DESIGN.placements.map((p) => p.body.buildId)),
  ].filter((buildId) => catalog.get(buildId)?.seatRule?.seatedOn === "joint");
}

describe("the domain's fake probe, on the bodies reseat measures", () => {
  // Not a vacuous sweep, and the arm that matters must be present: a decomposition that declares
  // `recorded-shell` is the whole subject, and the set has to hold one.
  it.each(declaredCabinetDepthsMm())(
    "has a recorded-shell decomposition among them at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const shells = reseatedBuildIds(cabinetDepthMm).filter(
        (buildId) =>
          catalog.get(buildId)?.occupiedDepth.measuredFrom === "recorded-shell",
      );

      expect(reseatedBuildIds(cabinetDepthMm)).toHaveLength(3);
      expect(shells.length).toBeGreaterThan(1);
      expect(shells.length).toBeLessThan(4);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "answers the seat the entry declares, for every one of them, at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const probe = createFakeProbe({ catalog });
      const wrong: string[] = [];

      for (const buildId of reseatedBuildIds(cabinetDepthMm)) {
        const definition = catalog.get(buildId);
        if (!definition) throw new Error(`no entry for ${buildId}`);
        // The depth `reseat` hands the probe, exactly: the catalogue's declared frame depth.
        const answeredMm = toMillimetres(
          2 *
            probe.measure({
              buildId,
              seatedOn: measurableSeatOf({
                buildId,
                rule: definition.seatRule,
              }),
              widthM: 0.6,
              heightM: 0.72,
              depthM: toMetres(definition.frameDepthMm),
            }).seatOffsetM,
        );
        if (Math.round(answeredMm) !== definition.frameDepthMm) {
          wrong.push(
            `${buildId}: declared ${String(definition.frameDepthMm)}, ` +
              `fake answered ${String(Math.round(answeredMm))}`,
          );
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  // What the disagreement costs a document, so the finding is a seat and not a helper's arithmetic:
  // `reseat` writes twice the answer into `seatDepthMm`, and a corner return re-seated by this fake
  // records a shell it does not have.
  it.each(declaredCabinetDepthsMm())(
    "writes a seat a depth change can stand behind, at %i mm",
    (cabinetDepthMm) => {
      const result = setCabinetDepth({
        design: KITCHEN_L_DESIGN,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: createFakeProbeFactory(),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const reseated = new Set(reseatedBuildIds(cabinetDepthMm));

      const wrong = result.design.placements
        .filter((placement) => reseated.has(placement.body.buildId))
        .map((placement) => ({
          id: placement.id,
          buildId: placement.body.buildId,
          seatDepthMm: placement.body.seatDepthMm,
          declared: catalog.get(placement.body.buildId)?.frameDepthMm,
        }))
        .filter((row) => row.seatDepthMm !== row.declared);

      expect(wrong).toEqual([]);
    },
  );

  // **The joint arm, asserted rather than assumed absent.** A depth change must leave a joint-seated
  // body carrying no recorded seat at all, so `deriveFrame` falls through to the declaration at
  // whatever depth is current. A stored 600 written before ADR 0077 is removed on the next change.
  it.each(declaredCabinetDepthsMm())(
    "records no seat for a joint-seated body, at %i mm",
    (cabinetDepthMm) => {
      const result = setCabinetDepth({
        design: KITCHEN_L_DESIGN,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm,
        probeAt: createFakeProbeFactory(),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
      const jointSeated = new Set(jointSeatedBuildIds(cabinetDepthMm));

      // Non-vacuity: the seeded kitchen holds one, and if it ever holds none this test is silent.
      expect(jointSeated.size).toBeGreaterThan(0);
      const carryingASeat = result.design.placements
        .filter((placement) => jointSeated.has(placement.body.buildId))
        .filter((placement) => placement.body.seatDepthMm !== undefined);

      expect(carryingASeat).toEqual([]);
    },
  );
});
