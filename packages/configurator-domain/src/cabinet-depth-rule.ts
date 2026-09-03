// Whether a catalogue entry's depth follows the cabinet-depth setting — **declared per entry, never
// inferred from a band or a kind, and never a constant that quietly stops tracking anything.**
//
// ADR 0058 decision 2. Two of the shipped top cabinets are deliberately deep because the columns
// they hang over are, and the owner ruled that they stay at 600 in a 700 mm kitchen. A body that
// holds still because somebody wrote 600 down is indistinguishable, six months later, from a body
// that holds still because somebody forgot to parameterise it — and the second is exactly what wave
// 6H found in `BASE_DEPTH_MM` and wave 6I found in `COLUMN_DEPTH_MM`. So the pin is a declaration a
// reader can grep and a test can sweep, and an entry that declares nothing **throws** rather than
// being read as pinned.
//
// The same stance `occupied-depth.ts` takes for an undeclared depth rule and `cabinet-handles.ts`
// takes for an undeclared handle count, for the same reason: the failure is invisible in a scene.

/** **Whether this entry's depth follows the cabinet-depth setting** — declared per catalogue entry
 *  (`BodyDefinition.depthRule`).
 *
 *  Three answers, because the shipped catalogue holds three kinds of body and no more:
 *
 *  - **`cabinet-depth`** — cabinetry. Its finished depth is a function of the setting, whether
 *    through the base formula, the wall map or the column carcass (ADR 0036 decision 5). Most of
 *    the catalogue.
 *  - **`manufactured-size`** — an appliance whose depth is a real machine's, so the setting cannot
 *    move it: a freestanding fridge is 742 mm deep in a 600 mm kitchen and in a 700 mm one. This is
 *    **not** an exception being granted; it is a statement that the body is not cabinetry.
 *  - **`pinned`** — cabinetry that is deliberately held at one depth anyway (ADR 0058 decision 1).
 *    The pin carries the body's own **finished** depth — the space it fills, ADR 0058 decision 3's
 *    "identical (600) at both" — so the declaration says what the body *is* rather than merely that
 *    it does not move. Deliberately **not** the cabinet-depth setting it happens to coincide with:
 *    a reader rebuilding a pinned row from a setting value would send it back through the wall map,
 *    and `wallCarcassSeatDepthMm(600)` is 291 where these two rows seat at 561.
 *
 *  There is deliberately no arm meaning "unknown" and no default. An entry that answers none of
 *  these has not been thought about, and `cabinetDepthRuleOf` refuses it. */
export type CabinetDepthRule =
  | { readonly follows: "cabinet-depth" }
  | { readonly follows: "manufactured-size" }
  | { readonly follows: "pinned"; readonly pinnedFinishedDepthMm: number };

/** Cabinetry: this body's depth is a function of the setting. */
export const FOLLOWS_CABINET_DEPTH: CabinetDepthRule = {
  follows: "cabinet-depth",
};

/** An appliance: this body's depth is a machine's, and no setting reaches it. Named rather than
 *  written as a pin at every depth, because the two are different facts — a pin is a decision about
 *  a cabinet and this is a fact about a product nobody here builds. */
export const IS_A_MANUFACTURED_SIZE: CabinetDepthRule = {
  follows: "manufactured-size",
};

/** ADR 0058 decision 1: cabinetry deliberately held at one declared **finished** depth — the space
 *  the built body fills, which is what a 6J migration reading "rebuild it at the depth it is pinned
 *  at" has to be handed. The two shipped pinned rows finish at 600 at every setting. */
export function pinnedAtFinishedDepthMm(
  pinnedFinishedDepthMm: number,
): CabinetDepthRule {
  return { follows: "pinned", pinnedFinishedDepthMm };
}

/** A catalogue entry that says nothing about whether its depth follows the setting. **A programming
 *  error rather than a body to guess at**: read as "does not follow" it silently ships a cabinet
 *  that stopped tracking the setting, and read as "follows" it silently unpins one of ADR 0058's two
 *  deliberately deep tops. Neither failure is visible in a scene at the one depth the product ships
 *  at today, which is precisely how `COLUMN_DEPTH_MM` stayed a literal 560 with every suite green. */
export class UndeclaredCabinetDepthRuleError extends Error {
  constructor(buildId: string, declared: unknown) {
    super(
      `No cabinet-depth rule declared for buildId "${buildId}". ` +
        `Found: ${describeDeclared(declared)}.`,
    );
    this.name = "UndeclaredCabinetDepthRuleError";
  }
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What this module needs and nothing more: the declaration, and the id a refusal has to name.
 *
 *  `rule` is typed **wider than `BodyDefinition` declares it, on purpose**, for the reason
 *  `occupied-depth.ts` and `cabinet-handles.ts` widen their own: `BodyCatalog` is a port, a
 *  definition assembled outside TypeScript can arrive with no rule at all, and that is the case this
 *  module must refuse rather than guess at. */
export interface CabinetDepthRuleQuery {
  readonly buildId: string;
  readonly rule: CabinetDepthRule | undefined;
}

/** **The rule this entry declares**, or a refusal naming the entry. Fails closed. */
export function cabinetDepthRuleOf(
  query: CabinetDepthRuleQuery,
): CabinetDepthRule {
  switch (query.rule?.follows) {
    case "cabinet-depth":
    case "manufactured-size":
    case "pinned":
      return query.rule;
    default:
      throw new UndeclaredCabinetDepthRuleError(query.buildId, query.rule);
  }
}

/** **Whether this entry's finished depth is allowed to differ between two cabinet depths.** The one
 *  question wave 6I's gate and wave 6J's migration both ask, so neither restates the switch: an
 *  entry that tracks the setting must move, and one that declares an exception must not.
 *
 *  Phrased as "may move" rather than "is pinned" so that adding a fourth arm to the rule is a
 *  compile error here instead of a silent `false` at every call site. */
export function depthFollowsSetting(rule: CabinetDepthRule): boolean {
  switch (rule.follows) {
    case "cabinet-depth":
      return true;
    case "manufactured-size":
    case "pinned":
      return false;
  }
}
