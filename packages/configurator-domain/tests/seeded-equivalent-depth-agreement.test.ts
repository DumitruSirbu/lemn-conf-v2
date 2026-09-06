// **A seeded entry and the catalogue entry a rebuild resolves it to must not declare different
// depths under the same `measuredFrom` kind** (M6 wave 6K-d, ADR 0075 decision 1).
//
// `resolveRebuildBody` swaps a seeded entry for its `catalogEquivalentId` permanently (ADR 0022), so
// after one depth change a placement stands on the parameterised row and never returns. If the two
// rows disagree about what `frameDepthMm` *means*, nothing in the system can tell: both declare
// `recorded-shell`, so the disagreement is invisible to every reader.
//
// `wallCarcassSeatDepthMm`'s own comment already claims the seeded top and §7's `wall-cabinet`
// "cannot answer differently — the drift ADR 0028 exists to stop". This is that claim as a gate.
//
// **Swept over the whole catalogue at every declared depth**, not sampled: the wall pair is the one
// that was found, not necessarily the only one that could exist.
import { describe, expect, it } from "vitest";

import { depthFollowsSetting } from "../src/cabinet-depth-rule.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";

interface Disagreement {
  readonly seeded: string;
  readonly equivalent: string;
  readonly seededFrameDepthMm: number;
  readonly equivalentFrameDepthMm: number;
}

function disagreeingPairs(cabinetDepthMm: number): readonly Disagreement[] {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const found: Disagreement[] = [];
  for (const [seeded, definition] of catalog) {
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
    // **A pinned entry is meant to differ, and it says so** (ADR 0058). `wall-2door-600-deep-top` is
    // held at a 600 mm finished depth at every setting, so its 561 mm shell against `wall-cabinet`'s
    // 291 at a 700 mm kitchen is the pin working, not a drift. Excluded by reading its own
    // `depthRule` rather than by name — the same declaration `movesWithTheSetting` asks, so this
    // sweep and the command cannot come to disagree about which rows are pinned.
    if (
      definition.depthRule === undefined ||
      !depthFollowsSetting(definition.depthRule)
    ) {
      continue;
    }
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
      const paired = [...catalog].filter(
        ([, definition]) => definition.catalogEquivalentId !== undefined,
      );
      const kinds = new Set(
        paired.map(([, definition]) => definition.occupiedDepth.measuredFrom),
      );

      expect(paired.length).toBeGreaterThan(5);
      expect(kinds).toEqual(new Set(["recorded-shell", "wall-plane"]));
      // And the sweep reaches rows on both sides of the pin, so excluding the pinned ones cannot
      // have emptied it.
      const following = paired.filter(
        ([, definition]) =>
          definition.depthRule !== undefined &&
          depthFollowsSetting(definition.depthRule),
      );
      expect(following.length).toBeGreaterThan(0);
      expect(paired.length).toBeGreaterThan(following.length);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "declares the same frame depth as its equivalent at %i mm",
    (cabinetDepthMm) => {
      expect(disagreeingPairs(cabinetDepthMm)).toEqual([]);
    },
  );
});
