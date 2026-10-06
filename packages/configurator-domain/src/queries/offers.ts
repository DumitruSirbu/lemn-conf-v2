// DEVELOPMENT-SPEC §9's replace list: what a customer may actually put in this opening, and nothing else.
// Every entry is measured by the same pre-probe evaluation `insertBody` runs (the hood is neither offered
// for nor accepted into a 400 mm top slot, §11 row 6), so both halves come from one function.
//
// A refused entry is absent from the list and from the type: `CatalogOffer` carries the width and height
// its body would build to, and no offer has no plan. No greyed-out refused rows are shown (ADR 0107
// decision 3, reversing ADR 0032). `insertBody`'s guards are untouched; `buildableWidthSpanMm` is what
// §9's empty sentence names instead.
import { normaliseBand } from "../bands.js";
import {
  buildableSizes,
  describeBodyLabelAt,
  isKnownKind,
  type BodyLabel,
  listInsertableBodies,
  resolveCatalogEquivalent,
  resolveWidthRangesMm,
  type InsertableBody,
} from "../catalog.js";
import type { CommandTarget } from "../commands/command-result.js";
import { toMillimetres } from "../millimetres.js";
import {
  evaluateInsertFit,
  resolveInsertOpening,
  type ResolvedOpening,
} from "../commands/insert-fit.js";
import type {
  Band,
  BodyCatalog,
  Column,
  PlacementRecord,
  VoidRecord,
  WidthRangeMm,
} from "../void-engine.js";

/** What the engine planned for one entry in one opening. Module-private: a refusal only decides that an
 *  entry is left out of the list and does not outlive `offersFor`. */
interface InsertionPlan {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface CatalogOffer {
  readonly buildId: string;
  readonly label: BodyLabel;
  readonly kind: string;
  readonly band: Band;
  /** The modular widths a customer picks from: this entry's chips, narrowed by the floor that governs it
   *  (ADR 0017), rendered by §9 as a row of buttons. They are a list, not a range: what the body can be
   *  built at is `widthRangesMm`. */
  readonly sizesMm: readonly number[];
  /** The widths this body may actually be built to, as ranges (ADR 0033's amendment): the entry's buildable
   *  ranges, deliberately not narrowed to this opening. Distinct from `sizesMm` (what you may pick). */
  readonly widthRangesMm: readonly WidthRangeMm[];
  /** §9: the current row is badged ACTUAL rather than hidden. */
  readonly isCurrent: boolean;
  /** What this body would be built to in this opening: the numbers §9's row line reads, and the width the
   *  label and thumbnail are picked at. Required: every entry in this list is one the engine planned. */
  readonly buildsToWidthMm: number;
  readonly buildsToHeightMm: number;
}

export interface OffersInput {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
  /** The cabinet depth of the design these records came from: `cabinetDepthMmOf(design)`, never a number
   *  written here. No verdict on this list reads it, yet it is required: `evaluateInsertFit` needs it, and
   *  the offer list must run the same evaluation as the command, which it cannot do on a different kitchen. */
  readonly cabinetDepthMm: number;
}

/** The offer list for a selection, in catalogue order, every entry insertable. Empty is an answer with
 *  three meanings: §11 row 24's unknown kind (no replace section, not a fallback set), a target that does
 *  not resolve, and an opening nothing fits (§9's empty sentence, made informative by
 *  `buildableWidthSpanMm`).
 *
 *  Band is a filter, and fit is a second. §5.2's "a column body goes anywhere" holds for a void:
 *  `isInOfferedBand` admits every band there and the same `evaluateInsertFit` the command runs decides. A
 *  swap compares against the band of the body being replaced, so a `column` row is not offered in place of
 *  an occupied `base` cabinet. */
export function offersFor(input: OffersInput): CatalogOffer[] {
  const resolved = resolveInsertOpening(input);
  if (!resolved.ok) return [];
  if (!isOfferable(resolved.value)) return [];

  const currentBuildId = resolveCurrentCatalogId(input.catalog, resolved.value);
  return listInsertableBodies(input.catalog)
    .filter((body) => isInOfferedBand(body.band, resolved.value))
    .flatMap((body) => {
      const plan = planFor(body, resolved.value, input.cabinetDepthMm);
      if (plan === undefined) return [];
      return [
        {
          buildId: body.buildId,
          // ADR 0033: the door count derives from the width this body would be built at here, so one
          // `wall-cabinet` entry reads *Corp suspendat 1 ușă* in a 400 mm opening and *2 uși* in a 600 mm one.
          label: describeBodyLabelAt(
            { buildId: body.buildId, definition: body.definition },
            plan.widthMm,
          ),
          kind: body.kind,
          band: body.band,
          // ADR 0017: the chips are the widths this body can be built at, not the widths its row lists; a
          // chip the guard would refuse is an "offered then refused" row.
          sizesMm: buildableSizes(body.minWidthMm, body.sizesMm),
          widthRangesMm: resolveWidthRangesMm(body),
          isCurrent: currentBuildId === body.buildId,
          buildsToWidthMm: plan.widthMm,
          buildsToHeightMm: plan.heightMm,
        },
      ];
    });
}

/**
 * The narrowest and widest widths anything in the catalogue can be built at, for §9's empty sentence
 * ("the widest cabinet in the catalogue is 800 mm"), which cannot be read off an offer list that is empty
 * when nothing fits. Read from the catalogue's `widthRangesMm`, never written down (ADR 0028).
 * `undefined` when no entry declares a range, which leaves §9's original sentence in place.
 */
export function buildableWidthSpanMm(
  catalog: BodyCatalog,
): WidthRangeMm | undefined {
  const ranges = listInsertableBodies(catalog).flatMap((body) =>
    resolveWidthRangesMm(body),
  );
  if (ranges.length === 0) return undefined;
  return {
    minMm: Math.min(...ranges.map((range) => range.minMm)),
    maxMm: Math.max(...ranges.map((range) => range.maxMm)),
  };
}

/** One entry against one opening, by the same evaluation `insertBody` runs, so an absent row is one the
 *  command would have refused. `undefined` is the refusal; its `RejectionDetail` is dropped because no
 *  surface renders one from this list, and the reason a customer sees after a tap is still the command's. */
function planFor(
  body: InsertableBody,
  resolved: ResolvedOpening,
  cabinetDepthMm: number,
): InsertionPlan | undefined {
  const fit = evaluateInsertFit({
    body,
    opening: resolved.opening,
    column: resolved.column,
    cabinetDepthMm,
  });
  if (!fit.ok) return undefined;
  return {
    widthMm: toMillimetres(fit.plan.widthM),
    heightMm: toMillimetres(fit.plan.heightM),
  };
}

/** Which insertable entry the opening's current occupant is, so §9 can badge that row ACTUAL. Seeded
 *  placements have non-insertable `buildId`s (ADR 0011 Gap A), so comparing ids directly never matches;
 *  the relationship is declared on the seeded entry (`catalogEquivalentId`), not inferred from kind, band
 *  and width (§6.3). The resolution lives in `catalog.ts`, shared with §9's width chips, and is not
 *  restated here. `undefined` (no declared equivalent, or a void) badges no row, which is correct for the
 *  hob and the corner returns. */
function resolveCurrentCatalogId(
  catalog: BodyCatalog,
  resolved: ResolvedOpening,
): string | undefined {
  const replaced = resolved.replaced;
  if (!replaced) return undefined;
  return resolveCatalogEquivalent(catalog, replaced.buildId)?.buildId;
}

/** §11 row 24: a kind the catalogue does not know renders no replace section at all; a fallback set
 *  would be guaranteed-refused rows. */
function isOfferable(resolved: ResolvedOpening): boolean {
  const replaced = resolved.replaced;
  return !replaced || isKnownKind(replaced.kind);
}

/** §9: swap sets are band-scoped (a wall body never appears in a base list). A void takes the whole
 *  catalogue and lets the fit filter narrow it, which is where §5.2's "a column body goes anywhere" rule
 *  earns the full-height rows the base slot offers. */
function isInOfferedBand(band: Band, resolved: ResolvedOpening): boolean {
  const replaced = resolved.replaced;
  if (!replaced) return true;
  return normaliseBand(band) === normaliseBand(replaced.band);
}
