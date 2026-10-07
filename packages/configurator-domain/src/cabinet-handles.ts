// How many handles on a body are the cabinet's, which is not how many handle meshes its builder draws
// (ADR 0061 decision 2): `tall-oven-tower` builds four `handle_bar` groups and two are the cabinet's;
// the oven's and the microwave's are neither restyled by a cabinet-hardware chip nor billed.
//
// Declared per entry, and forced to be (ADR 0061 decision 3, §12): pricing is a pure domain query with
// no meshes, and the rule that tells a cabinet's handle from an appliance's inspects geometry. A
// three-adapter parity gate (`cabinet-handle-count.parity.test.ts`) holds every declaration to the
// meshes actually built (ADR 0028's remedy for two numbers agreeing by luck).
import { deriveDoorCount } from "./door-count.js";

/** How many cabinet handles this entry's builder draws, declared per catalogue entry
 *  (`BodyDefinition.cabinetHandles`) and never inferred from a kind: `base-hob-oven` and
 *  `base-3drawer` are both `base_cabinet` and carry different bar populations (ADR 0061).
 *
 *  - `declared-count`: the same handles at every width. Every seeded instance is one (ADR 0011
 *    Gap A), and so is every §7 row with a fixed front population.
 *  - `door-count`: a row declaring `doorCountFollowsWidth`. `deriveDoorCount` answers leaves per tier,
 *    so the count is `doorTiers` × `handlesPerLeaf` × that: `wall-cabinet` is one tier, one bar at
 *    400 mm and two at 600; `tall-pantry` stacks two tiers, so two and four.
 *
 *  No arm counts fronts: `base-hob-oven`'s only front is a fixed filler panel that carries no bar. */
export type CabinetHandleRule =
  | { readonly countedFrom: "declared-count"; readonly handles: number }
  | {
      readonly countedFrom: "door-count";
      readonly doorTiers: number;
      readonly handlesPerLeaf: number;
    };

/** The two numbers a `door-count` row is made of, kept apart because they are different facts: how
 *  many door bands are stacked up the front, and how many bars hang on one leaf. */
export interface DoorLeafHandles {
  readonly doorTiers: number;
  readonly handlesPerLeaf: number;
}

/** A body whose builder draws the same handles whatever width it is built to. */
export function carriesHandles(handles: number): CabinetHandleRule {
  return { countedFrom: "declared-count", handles };
}

/** A row whose door count follows its width: this many tiers of leaves, each carrying this many
 *  handles. Two numbers rather than one product, so a row says what the cabinet is. */
export function handlesOnDoorLeaves(
  leaves: DoorLeafHandles,
): CabinetHandleRule {
  return {
    countedFrom: "door-count",
    doorTiers: leaves.doorTiers,
    handlesPerLeaf: leaves.handlesPerLeaf,
  };
}

/** What a row with a fixed front population contributes to a width-derived leaf count. Not a claim
 *  that the body has no doors (`base-sink` has two), only that its width decides none. */
const NO_WIDTH_DERIVED_LEAVES = 0;

/** A body with no cabinet handle at all (an open shelf, a hood, a freestanding fridge whose only bars
 *  are the appliance's). Named so the rule reads as a statement about the product, as
 *  `NO_FRONT_ASSEMBLY_MM` does for a depth. */
export const NO_CABINET_HANDLES: CabinetHandleRule = carriesHandles(0);

/** Every rule field that holds a count, the only things a refusal can name. A literal union so a typo
 *  in a refusal message is a compile error. */
export type CabinetHandleCountField =
  | "handles"
  | "doorTiers"
  | "handlesPerLeaf";

/** A catalogue entry that declares no usable handle count: a programming error, not a number to guess
 *  at (ADR 0061 decision 4). A fallback to the mesh count would bill an appliance's bars, and a
 *  fallback to zero would stop billing hardware the customer buys; neither is visible in a scene.
 *
 *  Two shapes of unusable: a rule that is missing, `null` or tagged with an unknown `countedFrom`
 *  (refused by the tag), and a rule with a known tag and no number, which would return `NaN` or
 *  `undefined` out of a function typed `: number`. `missingField` names which number was absent. */
export class UndeclaredCabinetHandleCountError extends Error {
  constructor(refusal: {
    readonly buildId: string;
    readonly declared: unknown;
    /** The rule field that held no usable count, on a rule whose `countedFrom` was recognised. */
    readonly missingField?: CabinetHandleCountField;
  }) {
    super(
      `No cabinet-handle count declared for buildId "${refusal.buildId}". ` +
        describeMissing(refusal.missingField) +
        `Found: ${describeDeclared(refusal.declared)}.`,
    );
    this.name = "UndeclaredCabinetHandleCountError";
  }
}

function describeMissing(
  missingField: CabinetHandleCountField | undefined,
): string {
  if (missingField === undefined) return "";
  return `Its rule declares no usable "${missingField}" — a whole, non-negative count. `;
}

function describeDeclared(declared: unknown): string {
  return declared === undefined ? "nothing" : JSON.stringify(declared);
}

/** What `cabinetHandleCount` needs: the declaration, the width a door-count rule is relative to, and
 *  the id a refusal names. `rule` is typed wider than `BodyDefinition` declares it, as in
 *  `occupied-depth.ts`: `BodyCatalog` is a port, and a definition assembled outside TypeScript can
 *  arrive with no rule, which this module must refuse. */
export interface CabinetHandleQuery {
  readonly buildId: string;
  readonly rule: CabinetHandleRule | undefined;
  readonly widthMm: number;
}

/** The number of handles this body's cabinetry carries at this width: the quantity M6's handle line
 *  is billed for and the parity gate holds to the built meshes. Fails closed: an entry that declares
 *  nothing throws rather than answering. */
export function cabinetHandleCount(query: CabinetHandleQuery): number {
  switch (query.rule?.countedFrom) {
    case "declared-count":
      return usableCountOf(query, query.rule.handles, "handles");
    case "door-count":
      // `doorTiers` is read first, inside the call, so a rule missing both numbers names `doorTiers`.
      return (
        widthDerivedDoorLeafCount(query) *
        usableCountOf(query, query.rule.handlesPerLeaf, "handlesPerLeaf")
      );
    default:
      throw new UndeclaredCabinetHandleCountError({
        buildId: query.buildId,
        declared: query.rule,
      });
  }
}

/**
 * How many door leaves this body's width decides: `deriveDoorCount`'s per-band answer multiplied by
 * the bands the row stacks. `wall-cabinet` is one band (one leaf below 500 mm, two from it);
 * `tall-pantry` stacks two (two leaves and four).
 *
 * The one composition of `doorTiers × deriveDoorCount` in the repository, read by this module's
 * handle count and M6's per-door price step; a reader calling `deriveDoorCount` directly would
 * under-count every banded cabinet. `NO_WIDTH_DERIVED_LEAVES` for a fixed-front row, whose price does
 * not step. No amount may be named here: `pricing-seams.test.ts` reads this package for a price
 * outside the book.
 *
 * Fails closed on an unusable declaration, like `cabinetHandleCount`: a guessed leaf count is a wrong
 * amount on a customer-visible line.
 */
export function widthDerivedDoorLeafCount(query: CabinetHandleQuery): number {
  switch (query.rule?.countedFrom) {
    case "declared-count":
      return NO_WIDTH_DERIVED_LEAVES;
    case "door-count":
      return (
        usableCountOf(query, query.rule.doorTiers, "doorTiers") *
        deriveDoorCount(query.widthMm)
      );
    default:
      throw new UndeclaredCabinetHandleCountError({
        buildId: query.buildId,
        declared: query.rule,
      });
  }
}

/** The number a recognised rule is made of, held to being a quantity: whole, non-negative and exact.
 *  A fraction or a negative is a count nothing can be billed for and must refuse here rather than
 *  reach a price line. `0` passes: a hood carries no handle. Typed `unknown` although
 *  `CabinetHandleRule` declares `number`: the port cannot guarantee it. */
function usableCountOf(
  query: CabinetHandleQuery,
  declaredCount: unknown,
  field: CabinetHandleCountField,
): number {
  if (
    typeof declaredCount === "number" &&
    Number.isSafeInteger(declaredCount) &&
    declaredCount >= 0
  ) {
    return declaredCount;
  }
  throw new UndeclaredCabinetHandleCountError({
    buildId: query.buildId,
    declared: query.rule,
    missingField: field,
  });
}
