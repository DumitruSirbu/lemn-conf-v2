// How many handles on a body are the **cabinet's** — which is not how many handle meshes its
// builder draws.
//
// ADR 0061 decision 2: `tall-oven-tower` builds four `handle_bar` groups and exactly two of them are
// the cabinet's; the oven's and the microwave's arrived with the appliances and are neither restyled
// by a cabinet-hardware chip nor billed as cabinet hardware. A naive mesh count bills four where the
// customer is buying two.
//
// **Declared per entry, and forced to be** (ADR 0061 decision 3, §12): pricing is a pure domain
// query, the domain has no meshes to look at, and the rule that tells a cabinet's handle from an
// appliance's — a `handle` group whose parent also holds a front — inspects geometry. So the domain
// cannot count handles; it can only read a number the catalogue states. What keeps that number
// honest is a three-adapter parity gate holding every declaration to the meshes actually built
// (`cabinet-handle-count.parity.test.ts`), ADR 0028's remedy for two numbers agreeing by luck.
import { deriveDoorCount } from "./door-count.js";

/** **How many cabinet handles this entry's builder draws** — declared per catalogue entry
 *  (`BodyDefinition.cabinetHandles`), never inferred from a kind. ADR 0061's own rejected
 *  alternative: `base-hob-oven` and `base-3drawer` are both `base_cabinet` and carry different bar
 *  populations, so `kind` is demonstrably not enough.
 *
 *  Two shapes, because the shipped builders come in two kinds and no more:
 *
 *  - **`declared-count`** — the builder draws the same handles at every width it is built to. Every
 *    seeded instance is one of these by construction (ADR 0011 Gap A: one already-built body at one
 *    size), and so is every §7 row whose front population is fixed — three drawers are three drawers
 *    at 300 mm and at 800.
 *  - **`door-count`** — a row that declares `doorCountFollowsWidth`, whose leaves are decided at
 *    build time from the width by `deriveDoorCount`. `deriveDoorCount` answers **leaves per tier**,
 *    so the count is `doorTiers` × `handlesPerLeaf` × that: `wall-cabinet` is one tier of leaves
 *    carrying one bar each, so one bar at 400 mm and two at 600, while `tall-pantry` stacks **two**
 *    tiers of such leaves and so carries two and four.
 *
 *  There is deliberately no arm that counts fronts. A front is not a handle: `base-hob-oven`'s only
 *  front is the hob band's fixed filler panel, which opens nothing and carries no bar, and the two
 *  numbers part company there. */
export type CabinetHandleRule =
  | { readonly countedFrom: "declared-count"; readonly handles: number }
  | {
      readonly countedFrom: "door-count";
      readonly doorTiers: number;
      readonly handlesPerLeaf: number;
    };

/** The two numbers a `door-count` row is made of, kept apart because they are different facts about
 *  the product: how many door bands are stacked up the front, and how many bars hang on one leaf.
 *  `deriveDoorCount` decides the third — how many leaves fill one band at this width. */
export interface DoorLeafHandles {
  readonly doorTiers: number;
  readonly handlesPerLeaf: number;
}

/** A body whose builder draws the same handles whatever width it is built to. */
export function carriesHandles(handles: number): CabinetHandleRule {
  return { countedFrom: "declared-count", handles };
}

/** A row whose door count follows its width: this many tiers of leaves, each leaf carrying this
 *  many handles. Stated as two numbers rather than one product, so a row says what the cabinet
 *  *is* — `tall-pantry` is two stacked bands of single-bar leaves, not "two bars on a door". */
export function handlesOnDoorLeaves(
  leaves: DoorLeafHandles,
): CabinetHandleRule {
  return {
    countedFrom: "door-count",
    doorTiers: leaves.doorTiers,
    handlesPerLeaf: leaves.handlesPerLeaf,
  };
}

/** A body with no cabinet handle at all — an open shelf, a hood, a freestanding fridge whose only
 *  bars are the appliance's. Named rather than written as a bare `carriesHandles(0)`, so the rule
 *  reads as a statement about the product instead of as an arithmetic no-op, exactly as
 *  `NO_FRONT_ASSEMBLY_MM` does for a depth. */
export const NO_CABINET_HANDLES: CabinetHandleRule = carriesHandles(0);

/** Every rule field that holds a count — the only things a refusal can name. A literal union rather
 *  than `string`, so a typo in a refusal message is a compile error instead of a message pointing at
 *  a field no rule has, the discipline `countedFrom` and `measuredFrom` already keep. */
export type CabinetHandleCountField =
  | "handles"
  | "doorTiers"
  | "handlesPerLeaf";

/** A catalogue entry that declares no usable handle count. **It is a programming error rather than a
 *  number to guess at** (ADR 0061 decision 4), the same stance `UndeclaredOccupiedDepthError` takes:
 *  a silent fallback to the mesh count would bill an appliance's bars as cabinet hardware, and a
 *  silent fallback to zero would stop billing hardware the customer is buying. Neither failure is
 *  visible in a scene, which is how four families carried a wrong `occupiedDepth` with every suite
 *  green (DOM-002).
 *
 *  **Two shapes of unusable, and the second was found by QA one field later than the first.** A rule
 *  that is missing, `null`, or tagged with a `countedFrom` this module does not know is refused by
 *  the tag. A rule tagged with one it *does* know and carrying no number — `{ countedFrom:
 *  "door-count" }`, the shape a row authored with the tag and without the count arrives as through
 *  the `BodyCatalog` port — used to return `NaN`, and the `declared-count` arm `undefined`, out of a
 *  function typed `: number`. A `NaN` quantity on a price line is the same defect as a wrong one,
 *  wearing a shape nothing downstream can even compare. `missingField` names which number was not
 *  there, so the refusal points at the row's field rather than only at the row. */
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

/** What `cabinetHandleCount` needs and nothing more: the declaration, the width a door-count rule is
 *  relative to, and the id a refusal has to name.
 *
 *  `rule` is typed **wider than `BodyDefinition` declares it, on purpose**, for the reason
 *  `occupied-depth.ts` widens its own: `BodyCatalog` is a port, a definition assembled outside
 *  TypeScript can arrive with no rule at all, and that is the case this module must refuse rather
 *  than guess at. */
export interface CabinetHandleQuery {
  readonly buildId: string;
  readonly rule: CabinetHandleRule | undefined;
  readonly widthMm: number;
}

/** **The number of handles this body's cabinetry carries at this width** — the quantity M6's handle
 *  line is billed for, and the number the three-adapter parity gate holds to the built meshes.
 *
 *  Fails closed: a query whose entry declares nothing throws rather than answering. */
export function cabinetHandleCount(query: CabinetHandleQuery): number {
  switch (query.rule?.countedFrom) {
    case "declared-count":
      return usableCountOf(query, query.rule.handles, "handles");
    case "door-count":
      return (
        usableCountOf(query, query.rule.doorTiers, "doorTiers") *
        usableCountOf(query, query.rule.handlesPerLeaf, "handlesPerLeaf") *
        deriveDoorCount(query.widthMm)
      );
    default:
      throw new UndeclaredCabinetHandleCountError({
        buildId: query.buildId,
        declared: query.rule,
      });
  }
}

/** The number a recognised rule is made of, held to being a **quantity**: whole, non-negative, and
 *  small enough to be exact. Handles are counted objects, so a fraction or a negative is not a
 *  count that was merely surprising — it is one nothing can be billed for, and it must refuse here
 *  rather than reach a price line. `0` is a real answer and passes: a hood carries no handle.
 *
 *  Typed `unknown` deliberately, although `CabinetHandleRule` declares both fields `number`. That
 *  declaration is what the port cannot guarantee, and this function exists for exactly the values
 *  TypeScript already believes are impossible. */
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
