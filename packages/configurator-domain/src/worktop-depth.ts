// The one place a worktop depth exists, and the one place a wall carcass's depth is decided from it.
//
// `DEVELOPMENT-SPEC.md` §7's `nominalDepthMm` for the wall entries and §5.2's head-clearance cap
// were **two independent constants that happened to agree at 400** — `catalog.ts`'s `WALL_DEPTH_MM`
// and `insert-fit.ts`'s `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`. Nothing compared them, so the
// seeded kitchen could be authored at 330 with every gate green while a re-inserted top-row cabinet
// built 400 mm beside its 330 mm neighbours. Both now read this module, so the pair cannot drift
// apart again: there is exactly one 330 in the source. Owner's decisions of 2026-08-27, recorded in
// `docs/milestones/M5-width.md`.

/** **Misnamed, deliberately and temporarily.** ADR 0036 decision 3 makes the declared setting the
 *  **cabinet** depth — the worktop is an external part the customer usually buys separately, may be
 *  620, and influences neither geometry nor price. This constant holds the *cabinet* depth, and
 *  every 5F caller reads it as one (`occupied-depth.ts` calls the value it returns "the cabinet-depth
 *  line"; `cabinet-depth-source.test.ts` passes it as a cabinet depth).
 *
 *  The rename is ADR 0036's Consequences and is deferred: it is 8 files plus error-message text and
 *  test names, and folding it into the wave that moved four geometry baselines would have made that
 *  diff unreviewable. Until it lands, read "worktop" here as "cabinet".
 *
 *  The kitchen's cabinet depth. **Configurable data, deliberately at the top level**: M5 declares
 *  it, and M6's *Setări globale* control replaces this line with a read from that setting — one
 *  line, because the map lookup and (from M5 wave 5F) the base carcass formula both read this
 *  constant rather than copying its value.
 *
 *  Nothing persists it and nothing sets it: `DesignSchema` has no field for it, no command takes
 *  one, and M5 therefore never holds two worktop depths at once.
 *
 *  **M6 wave 6H narrowed what this constant is without changing its value.** The catalogue's
 *  depth-derived facts are now functions of a cabinet depth (`buildInsertableBodyDefinitions`,
 *  `wallCarcassMaxDepthOverWorktopM`), so this is the *declared* depth the shipped kitchen is built
 *  at rather than the only depth the model can express. Wave 6J's control and wave 6K's stored
 *  setting are what finally give a design one of its own; until then this is the single argument
 *  every caller passes, which is why it is still one line to replace. */
export const WORKTOP_DEPTH_MM = 600;

/** Wall and top carcass depth per worktop depth — **a declaration, not a computation**.
 *
 *  Wall cabinets come in manufactured sizes (300 / 330 / 350 / 400) and the owner's own numbers are
 *  non-linear: 100 mm of worktop buys 70 mm of wall. A formula would invent a 372 mm cabinet nobody
 *  makes, which is why a third worktop size is a new row here and never an interpolation.
 *
 *  Extensible by adding a row. `800 -> 500` is a plausible future row and is **not** a commitment,
 *  so it is not written here. */
const WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM: ReadonlyMap<number, number> = new Map([
  [600, 330],
  [700, 400],
]);

/** A worktop depth the map does not declare. It is a programming error rather than a number to
 *  guess at: no interpolation, no rounding, no nearest row, no silent default. */
export class UnknownWorktopDepthError extends Error {
  constructor(worktopDepthMm: number) {
    super(
      `No wall depth declared for a worktop depth of ${String(worktopDepthMm)} mm. ` +
        `Declared worktop depths: ${declaredWorktopDepthsMm().join(", ")} mm.`,
    );
    this.name = "UnknownWorktopDepthError";
  }
}

/** The wall/top carcass depth a given worktop implies. Throws rather than falling back, because a
 *  guessed depth builds a cabinet that is not manufactured. */
export function wallDepthMmForWorktop(worktopDepthMm: number): number {
  const wallDepthMm = WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM.get(worktopDepthMm);
  if (wallDepthMm === undefined) {
    throw new UnknownWorktopDepthError(worktopDepthMm);
  }
  return wallDepthMm;
}

/** The worktop depths the map declares, for a refusal sentence and for the tests that sweep the
 *  whole map rather than a hand-picked row. */
export function declaredWorktopDepthsMm(): readonly number[] {
  return [...WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM.keys()];
}

/** **ADR 0036 decision 1, as one declared number**: a declared dimension is the *finished* cabinet,
 *  doors included, so a fronted carcass is built at its declared depth less what stands in front of
 *  it — an 18 mm door slab and a bar handle reaching 21 mm past that.
 *
 *  Measured with the real `BodyProbe` in wave 5F, not estimated: ADR 0036 put it at "the door is
 *  18 mm and the gap 4, which is 22, so something else contributes the rest", and the rest is the
 *  **handle**. The 4 mm it counted is `kitchen-parts.ts`'s `GAP`, the *lateral* shadow gap between
 *  two door leaves, which never reaches the depth axis at all.
 *
 *  It is a **product rule and not a builder detail** — §12 — which is why it lives beside the depth
 *  map rather than in the adapter: it is what makes "330" mean the same thing to the catalogue, to
 *  a swap's opening and to the geometry. The adapter derives its own value from the door and handle
 *  it actually builds, and a three-adapter gate asserts the two are the same number, which is
 *  ADR 0028's own remedy for two constants agreeing by luck. */
export const WALL_FRONT_ASSEMBLY_MM = 39;
