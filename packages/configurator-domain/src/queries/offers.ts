// `DEVELOPMENT-SPEC.md` §9's replace list: **what a customer may actually put in this opening, and
// nothing else.**
//
// "Never offer what cannot be satisfied." Every entry is measured by the *same* pre-probe evaluation
// `insertBody` runs — the hood is neither offered for nor accepted into a 400 mm top slot (§11
// row 6), and both halves come from one function rather than two agreements.
//
// **This reverses ADR 0032, on the owner's ruling of 2026-09-10.** That decision read the rule's
// second sentence — *"disabled-with-reason beats warn-after-click"* — as the one the first was
// serving, and published every band-appropriate entry with a verdict so that nothing failed
// silently: *"nobody could discover that a bottle cargo exists or that a two-door needs 600 mm."*
// What that produced in a **void** is the case the owner judged, because `isInOfferedBand` admits
// the whole catalogue there: a floor opening offered wall cabinets, a lift, an open shelf and a
// hood, each greyed with the same generic sentence about having no plinth. *"Don't need to show any
// greyed out cabinets … on base cabinet I see hood as user is like WTF is this. Show only what is
// possible to insert."*
//
// So a refused entry is now **absent**, and it is absent from the type as well as from the list:
// `CatalogOffer` carries the width and height its body would build to, and there is no shape in
// which an offer has no plan. Nothing became insertable — `insertBody`'s guards are untouched and
// the same evaluation still decides — and what a customer can discover instead is the width span
// §9's empty sentence names (`buildableWidthSpanMm`).
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

/** What the engine planned for one entry in one opening, or nothing where it refused.
 *
 *  **Module-private, and that is the reversal of ADR 0032 expressed in the type.** A refusal is a
 *  reason to leave an entry out of the list, and it is no longer a thing the list can carry: it
 *  exists between `evaluateInsertFit` and the filter below, and it does not outlive `offersFor`. */
interface InsertionPlan {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface CatalogOffer {
  readonly buildId: string;
  readonly label: BodyLabel;
  readonly kind: string;
  readonly band: Band;
  /** **The modular widths a customer picks from** — this entry's chips, narrowed by the floor that
   *  governs it (ADR 0017, ADR 0026). Nothing more: it is what §9 renders as a row of buttons.
   *
   *  It used to carry "what this needs" as well, and that was wrong for the reason ADR 0033's
   *  amendment was written (logic review R1.6): the chips are a *list* and the rule is a *range*, so
   *  a hinged cabinet refused in a 500 mm opening advertised 200/300/400/600/800 while 700 was
   *  equally buildable and absent — understating the options at the moment the row exists to explain
   *  them. `widthRangesMm` carries that fact now. */
  readonly sizesMm: readonly number[];
  /** **The widths this body may actually be built to**, as ranges — ADR 0033's amendment, and the
   *  half of a disabled row a customer can act on.
   *
   *  This is what "requires more space" means in millimetres, and it is the field to render it from:
   *  a hinged cabinet refused in a 500 mm opening publishes 200–400 and 600–800, so the answer is
   *  "make it 600" rather than a list that happens to stop at 800. True of a refused row exactly as
   *  it is of an offered one, and deliberately *not* narrowed to what fits here — a row whose ranges
   *  shrank to nothing would explain nothing.
   *
   *  **Distinct from `sizesMm`, and from `verdict.reason`, on purpose.** Three facts with three
   *  jobs: the chips are what you may pick, the ranges are what the body can be made at, and the
   *  reason is why *this* opening was refused, authored once by the engine (ADR 0032 rule 2). A
   *  renderer that wants "what to do about it" reads the ranges; one that wants "why" reads the
   *  reason. Neither restates the other. */
  readonly widthRangesMm: readonly WidthRangeMm[];
  /** §9: the current row is badged ACTUAL rather than hidden. */
  readonly isCurrent: boolean;
  /** **What this body would be built to in this opening** — the numbers §9's row line reads, and
   *  the width ADR 0033's label and the thumbnail are both picked at.
   *
   *  Required, because every entry in this list is one the engine planned. Where these were a
   *  `verdict` union (ADR 0032) a renderer had to ask which arm it held before it could read a
   *  number; the question has one answer now, so it is not asked. */
  readonly buildsToWidthMm: number;
  readonly buildsToHeightMm: number;
}

export interface OffersInput {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
  /** The cabinet depth of the design these records came from — `cabinetDepthMmOf(design)`, never a
   *  number written here.
   *
   *  **No verdict on this list reads it**, and it is required anyway. `evaluateInsertFit` needs it
   *  for the depth it plans, and `judge` below discards that plan's `depthM`; an optional field
   *  defaulting to 600 would therefore be harmless *today* and would be the same "no reader looks"
   *  reasoning that put a constant in `resolveDepthM` in the first place. The offer list runs the
   *  **same** evaluation the command runs (see `judge`), and it cannot be the same one if it is
   *  handed a different kitchen. */
  readonly cabinetDepthMm: number;
}

/** The offer list for a selection, in catalogue order, **every entry insertable**.
 *
 *  Empty is a real answer and now means three things rather than two: §11 row 24's unknown kind,
 *  which renders no replace section at all rather than a fallback set; a target that does not
 *  resolve; and — since the owner's ruling of 2026-09-10 — an opening nothing fits. §9's empty
 *  sentence is what the panel renders for the third, and `buildableWidthSpanMm` is what makes it
 *  the informative one rather than a bare *"nothing fits"*.
 *
 *  **Band stays a filter, and it is no longer the only one.** A wall cabinet was never a candidate
 *  for a floor opening; now neither is one that would not fit.
 *
 *  §5.2's *"a column body goes anywhere"* is untouched **for a void**, which is the case that
 *  sentence is about: `isInOfferedBand` admits every band into an empty opening, and what decides
 *  whether a full-height row appears in a base slot is the same `evaluateInsertFit` the command
 *  runs. A **swap** is the other case and always was — there the filter compares against the band of
 *  the body being replaced, so a `column` row is not offered in place of an occupied `base`
 *  cabinet. */
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
          // ADR 0033: the row's name, with the door count derived from the width this body would
          // actually be built at here — so one `wall-cabinet` entry reads *Corp suspendat 1 ușă* in
          // a 400 mm opening and *2 uși* in a 600 mm one. There is no longer a second arm for a row
          // with no width, because there is no longer a row with no width.
          label: describeBodyLabelAt(
            { buildId: body.buildId, definition: body.definition },
            plan.widthMm,
          ),
          kind: body.kind,
          band: body.band,
          // ADR 0017: the chips are the widths this body can be *built* at, not the widths its
          // catalogue row lists. Rendering a chip the guard would refuse is the same
          // "offered then refused" failure ADR 0017 closes, arriving one layer up.
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
 * **The narrowest and widest widths anything in the catalogue can be built at.**
 *
 * §9's empty sentence used to read these off the offer list itself, which held every
 * band-appropriate entry whether or not it fitted (ADR 0032). With refused entries gone, an opening
 * nothing fits produces an empty list — and *"the widest cabinet in the catalogue is 800 mm"* is
 * exactly the fact a customer needs at that moment, so it is published here instead of vanishing
 * with the rows that used to carry it.
 *
 * Read from the catalogue's own `widthRangesMm` and never written down: a constant beside these two
 * numbers is the two-values-agreeing-by-luck defect ADR 0028 is about. `undefined` when no entry
 * declares a range at all, which leaves §9's original sentence in place rather than inventing a
 * bound from nothing.
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

/** One entry against one opening, by the **same** evaluation `insertBody` runs — which is what makes
 *  an absent row a row the command would have refused, rather than a second opinion that can drift
 *  from it.
 *
 *  `undefined` is the refusal, and the `RejectionDetail` behind it is deliberately dropped: since
 *  the owner's ruling of 2026-09-10 no surface renders one from this list, and carrying a reason
 *  nobody reads is how a list grows a field that outlives its purpose. The reason a customer sees
 *  after a tap is still the command's own. */
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

/** Which insertable entry the opening's current occupant *is*, so §9 can badge that row **ACTUAL**.
 *
 *  ADR 0011 Gap A gives every seeded placement a non-insertable `buildId`, and the offer list is
 *  built from insertable entries only, so comparing the two ids directly never matched on the
 *  shipped kitchen — the badge appeared only on a body that had already been swapped once. The
 *  relationship is therefore **declared** on the seeded entry (`catalogEquivalentId`) rather than
 *  inferred from kind, band and width: §6.3 records what inferring a body's identity cost.
 *
 *  FINDING R1.5/R2.2: the resolution itself lives in `catalog.ts` and is shared with §9's width
 *  chips, which read the same pointer for the widths that entry can be built at. This function is
 *  the adapter — it answers the void case and hands back an id — and nothing about the rule is
 *  restated here, so the day the badge and the width set are meant to disagree, someone has to
 *  write the divergence down.
 *
 *  `undefined` — an entry with no declared equivalent, or a void — means no row is badged, which is
 *  the correct answer for the hob and the corner returns rather than a missing one. */
function resolveCurrentCatalogId(
  catalog: BodyCatalog,
  resolved: ResolvedOpening,
): string | undefined {
  const replaced = resolved.replaced;
  if (!replaced) return undefined;
  return resolveCatalogEquivalent(catalog, replaced.buildId)?.buildId;
}

/** §11 row 24: a kind the catalogue does not know renders no replace section at all. A fallback
 *  set once produced six guaranteed-refused rows for the hob. */
function isOfferable(resolved: ResolvedOpening): boolean {
  const replaced = resolved.replaced;
  return !replaced || isKnownKind(replaced.kind);
}

/** §9: swap sets are **band-scoped** — a wall body must never appear in a base list. A void
 *  instead takes the whole catalogue and lets the fit filter narrow it, which is where §5.2's
 *  "a column body goes anywhere" rule earns the full-height rows the base slot offers. */
function isInOfferedBand(band: Band, resolved: ResolvedOpening): boolean {
  const replaced = resolved.replaced;
  if (!replaced) return true;
  return normaliseBand(band) === normaliseBand(replaced.band);
}
