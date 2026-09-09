// **A seeded entry and the catalogue entry a rebuild resolves it to must not declare different
// depths under the same `measuredFrom` kind** (M6 wave 6K-d, ADR 0075 decision 1).
//
// `resolveRebuildBody` swaps a seeded entry for its `catalogEquivalentId` permanently (ADR 0022), so
// after one depth change a placement stands on the parameterised row and never returns. If the two
// rows disagree about what `frameDepthMm` *means*, nothing in the system can tell: both declare
// `recorded-shell`, so the disagreement is invisible to every reader.
//
// **That premise has one measured exception, and ADR 0101 decision 1 rules how it is taken.** Where
// the rebuilt body is in the wall band over a full-height column, `resolveDepthM` answers
// `columnBuildDepthM`'s lifted arm and **never consults the equivalent's `frameDepthMm` at all** —
// the equivalent declares 361 at a 700 mm kitchen where the rebuild plans 700. So "nothing in the
// system can tell" does not hold for those rows: the system does not read the disagreeing number.
// They are excluded on a **declaration they carry themselves**, and each one is then held to the
// authority that does govern it. One assertion is swapped for the correct one, never dropped.
//
// `wallCarcassSeatDepthMm`'s own comment already claims the seeded top and §7's `wall-cabinet`
// "cannot answer differently — the drift ADR 0028 exists to stop". This is that claim as a gate.
//
// **Swept over the whole catalogue at every declared depth**, not sampled: the wall pair is the one
// that was found, not necessarily the only one that could exist.
import { describe, expect, it } from "vitest";

import {
  columnBuildDepthMm,
  declaresALiftedColumnDepth,
  depthFollowsSetting,
} from "../src/cabinet-depth-rule.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { occupiedDepthOfEntryM } from "../src/occupied-depth.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";
import type { BodyCatalog, BodyDefinition } from "../src/void-engine.js";

/** Metres, and the finished depths compared here are millimetre quantities divided by 1000, so this
 *  is far tighter than any disagreement the gate exists to catch and looser than the float noise
 *  `561 / 1000 + 39 / 1000` produces. */
const FINISHED_DEPTH_TOLERANCE_DIGITS = 9;

interface Disagreement {
  readonly seeded: string;
  readonly equivalent: string;
  readonly seededFrameDepthMm: number;
  readonly equivalentFrameDepthMm: number;
}

/** Every seeded row that names a catalogue equivalent the catalogue actually holds. The one shape
 *  three of the sweeps below need, so none of them re-walks the map. */
function pairedRows(
  catalog: BodyCatalog,
): readonly (readonly [string, BodyDefinition])[] {
  return [...catalog].filter(
    ([, definition]) =>
      definition.catalogEquivalentId !== undefined &&
      catalog.get(definition.catalogEquivalentId) !== undefined,
  );
}

function disagreeingPairs(cabinetDepthMm: number): readonly Disagreement[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const found: Disagreement[] = [];
  for (const [seeded, definition] of pairedRows(catalog)) {
    // `pairedRows` has already established both, so neither branch is reachable; the reads are
    // written this way because the type is optional and a non-null assertion would hide it.
    const equivalentId = definition.catalogEquivalentId;
    if (equivalentId === undefined) continue;
    const equivalent = catalog.get(equivalentId);
    if (!equivalent) continue;
    // Only where the two agree about *how* the depth is measured. A pair declaring different kinds
    // is a different claim and would be refused elsewhere; what is invisible — and what this is
    // about — is two rows saying `recorded-shell` and meaning different quantities by it.
    if (
      equivalent.occupiedDepth.measuredFrom !==
      definition.occupiedDepth.measuredFrom
    ) {
      continue;
    }
    // **A row that does not follow the setting is meant to differ, and it says so.** A
    // `manufactured-size` appliance is a machine's depth and a `pinned` row is ADR 0058's held one;
    // either way the equivalent's parameterised number is not what the row is. Excluded by reading
    // its own `depthRule` rather than by name — the same declaration `movesWithTheSetting` asks, so
    // this sweep and the command cannot come to disagree about which rows move.
    if (
      definition.depthRule === undefined ||
      !depthFollowsSetting(definition.depthRule)
    ) {
      continue;
    }
    // **A row whose depth a lifted column answers is excluded by principle, not by a hole**
    // (ADR 0101 decision 1): the rebuild takes `columnBuildDepthM`'s lifted arm and the
    // equivalent's `frameDepthMm` never governs, so comparing the two would assert a relationship
    // nothing in the product reads. What *does* govern it is asserted below instead.
    if (declaresALiftedColumnDepth(definition)) continue;
    if (equivalent.frameDepthMm === definition.frameDepthMm) continue;
    found.push({
      seeded,
      equivalent: equivalentId,
      seededFrameDepthMm: definition.frameDepthMm,
      equivalentFrameDepthMm: equivalent.frameDepthMm,
    });
  }
  return found;
}

describe("a seeded entry and its catalogue equivalent declare one depth", () => {
  // Not a vacuous sweep: there must be pairs to compare, and they must span both measurement kinds,
  // or "no pair disagrees" would be a claim about an empty set or about one arm only.
  it.each(declaredCabinetDepthsMm())(
    "has pairs of both measurement kinds to sweep at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const paired = pairedRows(catalog);
      const kinds = new Set(
        paired.map(([, definition]) => definition.occupiedDepth.measuredFrom),
      );

      expect(paired.length).toBeGreaterThan(5);
      expect(kinds).toEqual(new Set(["recorded-shell", "wall-plane"]));

      // **And the sweep reaches rows on both sides of the "does it move?" question**, so excluding
      // the rows that do not cannot have emptied it.
      const following = paired.filter(
        ([, definition]) =>
          definition.depthRule !== undefined &&
          depthFollowsSetting(definition.depthRule),
      );
      expect(following.length).toBeGreaterThan(0);
      expect(paired.length).toBeGreaterThan(following.length);

      // **Re-founded by ADR 0101 decision 1**, and the row that makes the line above true is named
      // rather than merely counted. It was satisfied by ADR 0058's two pinned deep tops until
      // 2026-09-07, and those rows now follow the setting like everything else; had nothing else
      // been on the other side, a count-only guard would have kept passing over an empty exclusion.
      expect(
        paired
          .filter(
            ([, definition]) =>
              definition.depthRule !== undefined &&
              !depthFollowsSetting(definition.depthRule),
          )
          .map(([buildId]) => buildId),
      ).toEqual(["fridge-free-700"]);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "declares the same frame depth as its equivalent at %i mm",
    (cabinetDepthMm) => {
      expect(disagreeingPairs(cabinetDepthMm)).toEqual([]);
    },
  );

  describe("a row whose depth a lifted column answers", () => {
    // ADR 0101 decision 1's non-vacuity limb: the exemption is only an exemption if the sweep holds
    // rows on both sides of it. Declared here rather than assumed, because an exclusion that has
    // quietly swallowed the whole catalogue asserts nothing and still passes.
    it.each(declaredCabinetDepthsMm())(
      "is a declared minority of the paired rows at %i mm",
      (cabinetDepthMm) => {
        const paired = pairedRows(buildKitchenLBodyCatalog(cabinetDepthMm));
        const lifted = paired.filter(([, definition]) =>
          declaresALiftedColumnDepth(definition),
        );

        expect(lifted.map(([buildId]) => buildId)).toEqual([
          "wall-2door-600-deep-top",
          "wall-2door-700-over-fridge",
        ]);
        expect(paired.length).toBeGreaterThan(lifted.length);
      },
    );

    // **The replacement assertion.** The skipped comparison is swapped for the one that is true of
    // these rows: their finished depth is `columnBuildDepthMm`'s lifted arm at this setting, which
    // is the cabinet-depth line — 600 at 600 and 700 at 700, against `wall-cabinet`'s 330 and 400.
    it.each(declaredCabinetDepthsMm())(
      "finishes at its column's build depth at %i mm",
      (cabinetDepthMm) => {
        const liftedBuildDepthM =
          columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder: true }) /
          1000;
        const paired = pairedRows(buildKitchenLBodyCatalog(cabinetDepthMm));

        const lifted = paired.filter(([, definition]) =>
          declaresALiftedColumnDepth(definition),
        );
        expect(lifted.length).toBeGreaterThan(0);
        for (const [buildId, definition] of lifted) {
          expect(occupiedDepthOfEntryM({ buildId, definition })).toBeCloseTo(
            liftedBuildDepthM,
            FINISHED_DEPTH_TOLERANCE_DIGITS,
          );
        }
      },
    );
  });
});
