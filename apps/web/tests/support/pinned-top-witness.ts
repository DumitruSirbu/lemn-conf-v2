// **A pinned cabinet, declared by the suites that assert about one** — ADR 0101 decision 3, applying
// ADR 0093 decision 2's *"the fixture that makes a rule falsifiable is declared by the test that
// asserts it."*
//
// Until 2026-09-07 three placements of the shipped kitchen were pinned at 600 mm at every setting
// (ADR 0058), and the store suites that measure what a depth change does with a body the setting
// cannot move borrowed them. ADR 0101 unpinned all three — they were the only placements of
// twenty-five that did not follow the setting, and the owner reported them — so the `pinned` arm of
// `CabinetDepthRule` keeps its rule and loses its population.
//
// The arm is kept rather than retired, so a compile error greets the next person who needs a pin
// instead of a blank page; and it stays falsifiable because this module supplies the body. **Holding
// one of the owner's three cabinets back to feed a test is the "moved fixture" ADR 0093 refuses**:
// it would make the product's geometry a function of its test coverage, and it would leave the owner
// one wrong cabinet.
//
// It lives under `tests/support/` rather than inside one file because three suites in this package
// need the same body and a third copy is where two copies start to disagree. Nothing in `src/`
// imports it and nothing in the shipped catalogue declares it.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  pinnedAtFinishedDepthMm,
  type BodyCatalog,
  type BodyDefinition,
  type Design,
} from "@lemnaria/configurator-domain";

export const PINNED_TOP_WITNESS_BUILD_ID = "pinned-deep-top-witness";

/** The finished depth the witness is held at, at every setting.
 *
 *  **600 on purpose, and it is what makes the suites' shape reachable.** It wins `B|1.80`'s §3.2 MAX
 *  at the shallow setting, where `tall-pantry-600` measures 599, and loses it at the deep one, where
 *  the pantry grows to 699 — so a column whose recorded source is a body no setting moves ends up
 *  carrying a depth deeper than that source declares. That is the exact state wave 6K-c's floor is
 *  about, and it is the state ADR 0058's own pins used to supply. */
export const PINNED_TOP_WITNESS_FINISH_MM = 600;

/** The placement the witness stands in for: `p23`, the top over `tall-pantry-600` at `B|1.80`. */
export const PINNED_TOP_WITNESS_PLACEMENT_ID = "p23";

/** The row the witness is copied from, so it differs from a shipped deep top in its depth
 *  declaration and in nothing else. */
const COPIED_FROM_BUILD_ID = "wall-2door-600-deep-top";

/** The shipped catalogue at this setting, plus the witness.
 *
 *  It carries no `builtDepthFollowsALiftedColumn`: a pin and a lifted column are two different
 *  answers to *what decides this row's depth*, and a row claiming both would state nothing coherent.
 *  Its `frameDepthMm` is a literal rather than a function of the setting, which is what being pinned
 *  means and is the shape ADR 0058's own entries had. */
export function catalogWithAPinnedTop(cabinetDepthMm: number): BodyCatalog {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const copiedFrom = catalog.get(COPIED_FROM_BUILD_ID);
  if (!copiedFrom) {
    throw new Error(`the catalogue no longer holds ${COPIED_FROM_BUILD_ID}`);
  }
  const witness: BodyDefinition = {
    ...copiedFrom,
    frameDepthMm:
      PINNED_TOP_WITNESS_FINISH_MM - wallFrontAssemblyMmOf(copiedFrom),
    depthRule: pinnedAtFinishedDepthMm(
      PINNED_TOP_WITNESS_FINISH_MM,
      "base-formula",
    ),
    builtDepthFollowsALiftedColumn: false,
  };
  return new Map([...catalog, [PINNED_TOP_WITNESS_BUILD_ID, witness]]);
}

/** The shipped kitchen with the witness standing where `p23` does. */
export function designWithAPinnedTop(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === PINNED_TOP_WITNESS_PLACEMENT_ID
        ? {
            ...placement,
            body: {
              ...placement.body,
              buildId: PINNED_TOP_WITNESS_BUILD_ID,
            },
          }
        : placement,
    ),
  };
}

/** What stands in front of the copied row's shell, read off its own declaration rather than
 *  re-imported: the witness has to finish at `PINNED_TOP_WITNESS_FINISH_MM`, and a second copy of
 *  ADR 0036's 39 mm here is a number that could drift from the one the row is measured by. */
function wallFrontAssemblyMmOf(definition: BodyDefinition): number {
  const rule = definition.occupiedDepth;
  if (rule.measuredFrom !== "recorded-shell") {
    throw new Error(`${COPIED_FROM_BUILD_ID} stopped recording its shell`);
  }
  return rule.frontAssemblyMm;
}
