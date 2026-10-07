// ADR 0110 Amendment E: the block of full-height columns at the free end the layout leaves, and the
// hob that follows it. The block follows the run (Amendment I): this rule never knew a wall letter,
// and its caller feeds it the free end of whichever wall carries the reading order's suffix.
//
// One question, one answer for both halves (E5 stage 3): whether a block stands and whether the hob
// keeps its own oven are returned together, because a substitution that fires while the block does not
// stand ships a kitchen with no oven anywhere (E4).
//
// The only module under `src/generation/` that names the block's bodies, and it names no size of one:
// the declared 600 mm and 2200 mm belong to the catalogue and its caller threads them in, since a
// generation-side constant kept in step with the catalogue is a second authority (ADR 0102).
//
// A pure leaf over numbers, beside `leftover-rule.ts`: no catalogue, no probe, no design, and no
// knowledge of how a run is laid out.
import {
  headroomBelowTheCeilingMm,
  STORAGE_BODY_WIDTH_MM,
} from "./leftover-rule.js";

/** ADR 0110 E12.1: the oven-and-microwave column, the door column, and the hob that carries drawers
 *  because the oven has moved into a column. */
export const OVEN_TOWER_BUILD_ID = "tall-oven-tower";
export const DOOR_COLUMN_BUILD_ID = "tall-pantry";
/** The hob a block's own tower leaves behind. Exported so the U's tall layout, which stands a lone
 *  tower this module's E6.2 would refuse (RQ17, U-only), names the same id rather than a second
 *  literal. */
export const HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID = "base-hob-2drawer";

/** The owner's "two, three columns" (E2.2) and the one number this rule states. The 3300 / 3900 /
 *  4500 mm of the block's wall that the three block sizes need are consequences of the declared widths
 *  and the corner's reach and move with them. */
export const MAX_TALL_BLOCK_COLUMNS = 3;

/** What a body may be built to, as the catalogue declares it. */
export interface WidthBoundMm {
  readonly minMm: number;
  readonly maxMm: number;
}

/** The catalogue's word on the two column rows, read by `generateKitchen` and passed in whole. */
export interface DeclaredColumnSizes {
  /** One column's width — the oven tower's, fixed, and what one leftover module holds. */
  readonly columnWidthMm: number;
  /** The door column's bound; the one `'fit'` full-height row (ADR 0048). */
  readonly doorColumnWidthMm: WidthBoundMm;
  readonly columnHeightMm: number;
  /** The widest width the bottle cargo row declares: the module a generated run chooses (ADR 0110
   *  Amendment H1), read by the U's bottle; the L keeps its own `BOTTLE_CARGO` item. */
  readonly bottleWidthMm: number;
}

export interface TallEndRuleInput {
  /** E3 clause 1: the full core survived, so `dropped` is empty. A kitchen that gave up its fridge
   *  for want of space must not gain a second oven. */
  readonly coreSurvivedWhole: boolean;
  /** E3 clause 2 with E2, as Amendment I2 re-points it: the free end the layout leaves is the reading
   *  order's suffix wall's, whichever physical wall that is. The prefix wall's free end holds core
   *  bodies and has no leftover modules to swap for columns, so a hob landing there means no block and
   *  a hob that keeps its oven. */
  readonly hobStandsOnTheFreeEndWall: boolean;
  /** E3 clause 3, from `planLeftover` and nowhere else: generation holds one remainder arithmetic. */
  readonly freeEndStorageCount: number;
  readonly freeEndRemainderMm: number;
  /** E3 clause 4: the room must be at least as tall as the column planned into it. */
  readonly roomHeightMm: number;
  /** The id the hob carries where no block stands, so this module names only its own bodies. */
  readonly hobWithItsOwnOvenBuildId: string;
  readonly declared: DeclaredColumnSizes;
}

export interface PlannedTallColumn {
  readonly buildId: string;
  readonly widthMm: number;
}

export interface TallEndPlan {
  /** Innermost first: the oven tower, then the door columns outboard (E12.2). Empty where no block
   *  stands. */
  readonly columns: readonly PlannedTallColumn[];
  /** The storage modules the block's own wall keeps once the block has taken its own. */
  readonly storageCount: number;
  /** The bare wall past the composed run, `0` where the outermost column absorbed it. */
  readonly remainderMm: number;
  readonly hobBuildId: string;
}

/**
 * The block at the free end the layout leaves, the storage the leftover rule keeps, and the hob's
 * build id. A block never enters core selection and never causes a role to be dropped (E5.1): it takes
 * modules the leftover rule had already planned.
 */
export function planTallEndBlock(input: TallEndRuleInput): TallEndPlan {
  refuseAColumnThatIsNotOneStorageModule(input.declared.columnWidthMm);

  const withoutABlock: TallEndPlan = {
    columns: [],
    storageCount: input.freeEndStorageCount,
    remainderMm: input.freeEndRemainderMm,
    hobBuildId: input.hobWithItsOwnOvenBuildId,
  };
  if (!isABlockAffordable(input)) return withoutABlock;

  const columnCount = Math.min(
    MAX_TALL_BLOCK_COLUMNS,
    input.freeEndStorageCount,
  );
  const outermost = outermostColumnOf(columnCount, input);
  if (!outermost) return withoutABlock;

  return {
    columns: blockOf(columnCount, outermost.widthMm, input.declared),
    storageCount: input.freeEndStorageCount - columnCount,
    remainderMm: outermost.remainderMm,
    hobBuildId: HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID,
  };
}

/** E3's four clauses. The block's size is read from clause 3's own count, so the threshold follows
 *  the size rather than standing beside it. */
function isABlockAffordable(input: TallEndRuleInput): boolean {
  return (
    input.coreSurvivedWhole &&
    input.hobStandsOnTheFreeEndWall &&
    input.freeEndStorageCount >= 1 &&
    input.roomHeightMm >= input.declared.columnHeightMm
  );
}

/**
 * The block's outermost column and the bare wall left beyond it, or nothing where the block cannot
 * stand flush to the run (E6.2).
 *
 * Two adjacent columns sum past the empty-column ceiling and never merge, so a block is exposed at its
 * free-end face alone. Where that wall's remainder is small enough to merge with that face, the
 * outermost column is planned at the merged width, so the opening is exactly what the column is built
 * to and nothing is centred with a bare sliver on each side.
 *
 * A block of two or three ends in a `'fit'` door column, which takes that width. A block of one ends in
 * the fixed-width oven tower, which cannot, and has no module inboard to absorb it: that block is not
 * planned at all, the single `1 → 0` step E6.2 names and the one place a block shrinks as the room
 * grows.
 */
function outermostColumnOf(
  columnCount: number,
  input: TallEndRuleInput,
): { readonly widthMm: number; readonly remainderMm: number } | undefined {
  const declaredWidthMm = input.declared.columnWidthMm;
  const mergedWidthMm = declaredWidthMm + input.freeEndRemainderMm;
  const flush = { widthMm: declaredWidthMm, remainderMm: 0 } as const;

  if (input.freeEndRemainderMm === 0) return flush;
  if (input.freeEndRemainderMm > headroomBelowTheCeilingMm(declaredWidthMm)) {
    return { widthMm: declaredWidthMm, remainderMm: input.freeEndRemainderMm };
  }
  const outermostIsADoorColumn = columnCount > 1;
  if (
    !outermostIsADoorColumn ||
    !isWithin(mergedWidthMm, input.declared.doorColumnWidthMm)
  ) {
    return undefined;
  }
  return { widthMm: mergedWidthMm, remainderMm: 0 };
}

/** E12.1 and E12.2: one oven column and no more, the door columns outboard of it, so the oven stands
 *  as near the hob as the block allows and the body at the exposed face is the one that can take a
 *  merged opening. */
function blockOf(
  columnCount: number,
  outermostWidthMm: number,
  declared: DeclaredColumnSizes,
): readonly PlannedTallColumn[] {
  return Array.from({ length: columnCount }, (_, index) => ({
    buildId: index === 0 ? OVEN_TOWER_BUILD_ID : DOOR_COLUMN_BUILD_ID,
    widthMm:
      index === columnCount - 1 ? outermostWidthMm : declared.columnWidthMm,
  }));
}

/** The block swaps whole leftover modules for columns, so a column that is no longer one module wide
 *  would leave the composed run misaligned with the tiles the shell cut. Loud, because the failure
 *  composes a kitchen that looks planned. */
function refuseAColumnThatIsNotOneStorageModule(columnWidthMm: number): void {
  if (columnWidthMm === STORAGE_BODY_WIDTH_MM) return;
  throw new Error(
    `planTallEndBlock: a column declares ${String(columnWidthMm)} mm against the leftover rule's ${String(STORAGE_BODY_WIDTH_MM)} mm module, so a block can no longer take whole leftover modules`,
  );
}

function isWithin(widthMm: number, bound: WidthBoundMm): boolean {
  return widthMm >= bound.minMm && widthMm <= bound.maxMm;
}
