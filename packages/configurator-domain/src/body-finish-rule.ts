// **What colour a body is drawn in — declared per catalogue entry, never inferred from a flag and
// never read off a list of build ids.**
//
// The owner's ruling of 2026-09-09: *"structural cabinetry follows the kitchen, appliances never
// do"*, and *"open shelves can have and by default should inherit global set color"*. That splits a
// class `canFinish: false` used to hold whole. The four corner bodies seeded then (six since M7C wave
// C2), an open shelf, a hood and a freestanding fridge all declared the same `false`, and ADR 0099
// decision 8 read it as *"painted at neither level"* for all of them. After the ruling the corners and the shelf
// take the kitchen's colour and the two machines take none, so **one boolean can no longer carry the answer**.
//
// It is a second declaration rather than a widening of `canFinish`, because the two answer different
// questions and only one of them moved:
//
// - **`canFinish`** — *may this body's document carry a colour of its own?* It is the control gate:
//   `setFinish` refuses a body without it (`commands/set-appearance.ts`), `carriedAppearance` does
//   not copy a colour onto one (`commands/built-body.ts`), the load seam strips one that arrived
//   anyway (`migrate-design.ts`) and §9 renders no *Finisaj* section. **The ruling changes it for no
//   body**: a following body follows, it does not choose, so it still gains no control and its
//   `finish` key must stay absent (ADR 0099 decision 2).
// - **`finishRule`** — *what colour is this body drawn in?* The question `PlacementRecord.drawnFinish`
//   exists to answer (ADR 0099 Amendment A section 3), and the one the ruling moved.
//
// They are correlated in exactly one direction and `bodyFinishRuleOf` refuses an entry where they
// disagree, so the pair cannot silently drift into two authorities: **a body chooses its own colour
// if and only if it can be finished.** The other two arms say "no control" in two different ways,
// and that difference is the whole ruling.
//
// The stance is `cabinet-depth-rule.ts`'s, for the reason ADR 0058 decision 2 gives — *"a constant
// that silently stops tracking anything rots; a declaration is greppable and testable"* — and
// ADR 0103 decision 4 repeats one declaration over. There is deliberately no arm meaning "unknown"
// and no default: an entry that answers none of these has not been thought about, and
// `bodyFinishRuleOf` throws rather than guessing. Reading absence as *chooses* would paint a fridge;
// reading it as *never* would leave the next structural body white between coloured neighbours,
// which is the defect this record closes (backlog entry 60).

/** **Which colour a body is drawn in** — declared per catalogue entry (`BodyDefinition.finishRule`).
 *
 *  Three answers, because the shipped catalogue holds three kinds of body and no more:
 *
 *  - **`chooses-its-own-colour`** — ordinary cabinetry. The customer may pick a colour for this body
 *    alone, and where they picked none it follows the kitchen and then the material's declared
 *    default (ADR 0099 decision 1's order, unchanged). Most of the catalogue, and the only arm that
 *    reads `placement.body.finish`.
 *  - **`follows-the-kitchens-colour`** — structural cabinetry and the open shelf. It is cabinetry, so
 *    it wears the kitchen's colour; it is not a body a customer selects a finish on (§13.1: *"corners
 *    are structural"*), so it never carries a choice of its own and **its own `finish` key is never
 *    read**. A colour that reached such a body's document by a restored backup or another client is
 *    therefore not drawn, which is the protection `canFinish` used to give at the renderer.
 *  - **`is-never-painted`** — a machine somebody else builds. A hood is a canopy and a chimney and a
 *    freestanding fridge is an appliance; neither is cabinetry and no colour reaches either at any
 *    level. **Not an exception being granted** — it is a statement that the body is not cabinetry,
 *    the same fact `IS_A_MANUFACTURED_SIZE` states about its depth. */
export type BodyFinishRule =
  | "chooses-its-own-colour"
  | "follows-the-kitchens-colour"
  | "is-never-painted";

/** Ordinary cabinetry: the customer may colour this body, and absence means it follows. */
export const CHOOSES_ITS_OWN_COLOUR: BodyFinishRule = "chooses-its-own-colour";

/** Structural cabinetry and the open shelf: painted with the kitchen, never with a choice. */
export const FOLLOWS_THE_KITCHENS_COLOUR: BodyFinishRule =
  "follows-the-kitchens-colour";

/** An appliance: no colour at any level, at any time. */
export const IS_NEVER_PAINTED: BodyFinishRule = "is-never-painted";

/** A catalogue entry that says nothing about the colour it is drawn in. **A programming error rather
 *  than a body to guess at**: read as *chooses* it paints an appliance the kitchen's colour, and read
 *  as *never* it leaves the next structural body standing white between coloured neighbours — which
 *  is backlog entry 60, the defect that produced this declaration. Neither failure is visible in a
 *  scene until a customer applies a colour, which is precisely why absence is refused. */
export class UndeclaredBodyFinishRuleError extends Error {
  constructor(buildId: string, declared: unknown) {
    super(
      `No finish rule declared for buildId "${buildId}". ` +
        `Found: ${describeDeclared(declared)}.`,
    );
    this.name = "UndeclaredBodyFinishRuleError";
  }
}

/** The two declarations disagree on the one thing that binds them: **a body chooses its own colour
 *  if and only if it can be finished.** An entry declaring `chooses-its-own-colour` with no control
 *  offers a choice nothing can make; one declaring a control while following or never painting draws
 *  a colour the customer picked nowhere. Refused where the two meet, so neither field can become a
 *  second authority on the other. */
export class ContradictoryBodyFinishRuleError extends Error {
  constructor(buildId: string, rule: BodyFinishRule, canFinish: boolean) {
    super(
      `Finish rule "${rule}" on buildId "${buildId}" contradicts canFinish: ${String(canFinish)}. ` +
        `Only "${CHOOSES_ITS_OWN_COLOUR}" may be finished.`,
    );
    this.name = "ContradictoryBodyFinishRuleError";
  }
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What this module needs and nothing more: the two declarations, and the id a refusal has to name.
 *
 *  `rule` is typed **wider than `BodyDefinition` declares it, on purpose**, for the reason
 *  `CabinetDepthRuleQuery` widens its own: `BodyCatalog` is a port, a definition assembled outside
 *  TypeScript can arrive with no rule at all, and that is the case this module must refuse rather
 *  than guess at. */
export interface BodyFinishRuleQuery {
  readonly buildId: string;
  readonly rule: BodyFinishRule | undefined;
  /** `BodyDefinition.canFinish` for the same entry — the control gate the rule must agree with. */
  readonly canFinish: boolean;
}

/** **The rule this entry declares**, or a refusal naming the entry. Fails closed, twice: once for an
 *  entry that declares nothing, and once for one whose two declarations disagree. */
export function bodyFinishRuleOf(query: BodyFinishRuleQuery): BodyFinishRule {
  const rule = declaredRuleOf(query);
  if (choosesItsOwnColour(rule) !== query.canFinish) {
    throw new ContradictoryBodyFinishRuleError(
      query.buildId,
      rule,
      query.canFinish,
    );
  }
  return rule;
}

/** **Does this body carry a colour of its own?** Phrased as a question about the arm rather than as
 *  an equality at each call site, so a fourth arm is a compile error here instead of a silent
 *  `false` wherever the answer is asked. */
export function choosesItsOwnColour(rule: BodyFinishRule): boolean {
  switch (rule) {
    case "chooses-its-own-colour":
      return true;
    case "follows-the-kitchens-colour":
    case "is-never-painted":
      return false;
  }
}

function declaredRuleOf(query: BodyFinishRuleQuery): BodyFinishRule {
  switch (query.rule) {
    case "chooses-its-own-colour":
    case "follows-the-kitchens-colour":
    case "is-never-painted":
      return query.rule;
    default:
      throw new UndeclaredBodyFinishRuleError(query.buildId, query.rule);
  }
}
