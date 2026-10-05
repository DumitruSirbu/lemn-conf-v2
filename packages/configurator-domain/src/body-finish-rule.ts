// What colour a body is drawn in, declared per catalogue entry and never inferred from a flag or read
// off a list of build ids (ADR 0099 decision 8; owner: structural cabinetry follows the kitchen,
// appliances never do, open shelves inherit the global colour).
//
// `canFinish: false` once covered the corner bodies, the open shelf, the hood and the freestanding
// fridge alike; the ruling splits them, so one boolean can no longer carry the answer. It is a second
// declaration, not a widening of `canFinish`, because the two answer different questions:
//
// - `canFinish`: may this body's document carry a colour of its own? The control gate: `setFinish`
//   refuses without it (`commands/set-appearance.ts`), `carriedAppearance` copies none
//   (`commands/built-body.ts`), the load seam strips one (`migrate-design.ts`), and §9 renders no
//   *Finisaj* section. A following body gains no control and its `finish` key stays absent
//   (ADR 0099 decision 2).
// - `finishRule`: what colour is this body drawn in? What `PlacementRecord.drawnFinish` answers
//   (ADR 0099 Amendment A section 3).
//
// They correlate in one direction and `bodyFinishRuleOf` refuses an entry where they disagree: a body
// chooses its own colour if and only if it can be finished.
//
// The stance is `cabinet-depth-rule.ts`'s (ADR 0058 decision 2, ADR 0103 decision 4): there is no
// "unknown" arm and no default, and `bodyFinishRuleOf` throws on an entry that answers none. Reading
// absence as "chooses" would paint a fridge; reading it as "never" would leave the next structural body
// uncoloured between coloured neighbours (backlog entry 60).

/** Which colour a body is drawn in, declared per catalogue entry (`BodyDefinition.finishRule`).
 *
 *  - `chooses-its-own-colour`: ordinary cabinetry. The customer may pick a colour for this body alone,
 *    and where they picked none it follows the kitchen and then the material's default (ADR 0099
 *    decision 1). The only arm that reads `placement.body.finish`.
 *  - `follows-the-kitchens-colour`: structural cabinetry and the open shelf. It wears the kitchen's
 *    colour but a customer selects no finish on it (§13.1), so its own `finish` key is never read: a
 *    colour reaching its document by a restored backup or another client is not drawn.
 *  - `is-never-painted`: a hood or a freestanding fridge. Not cabinetry, so no colour reaches it at any
 *    level; the same kind of fact `IS_A_MANUFACTURED_SIZE` states about depth. */
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

/** A catalogue entry that says nothing about the colour it is drawn in: a programming error, not a
 *  body to guess at. Neither wrong reading is visible in a scene until a customer applies a colour. */
export class UndeclaredBodyFinishRuleError extends Error {
  constructor(buildId: string, declared: unknown) {
    super(
      `No finish rule declared for buildId "${buildId}". ` +
        `Found: ${describeDeclared(declared)}.`,
    );
    this.name = "UndeclaredBodyFinishRuleError";
  }
}

/** The two declarations disagree on the one thing that binds them: a body chooses its own colour if
 *  and only if it can be finished. `chooses-its-own-colour` with no control offers a choice nothing can
 *  make; a control while following or never painting draws a colour picked nowhere. Refused where the
 *  two meet, so neither field becomes a second authority on the other. */
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

/** What this module needs: the two declarations and the id a refusal names. `rule` is typed wider than
 *  `BodyDefinition` declares it, as in `CabinetDepthRuleQuery`: `BodyCatalog` is a port, and a
 *  definition assembled outside TypeScript can arrive with no rule, which this module must refuse. */
export interface BodyFinishRuleQuery {
  readonly buildId: string;
  readonly rule: BodyFinishRule | undefined;
  /** `BodyDefinition.canFinish` for the same entry: the control gate the rule must agree with. */
  readonly canFinish: boolean;
}

/** The rule this entry declares, or a refusal naming the entry. Fails closed, for an entry that
 *  declares nothing and for one whose two declarations disagree. */
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

/** Does this body carry a colour of its own? Phrased as a question about the arm so a fourth arm is a
 *  compile error here instead of a silent `false` wherever the answer is asked. */
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
