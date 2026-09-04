// `DEVELOPMENT-SPEC.md` §9's replace list: what a customer may actually put in this opening, and —
// ADR 0032 — what they cannot, with the engine's own reason attached.
//
// "Never offer what cannot be satisfied. Disabled-with-reason beats warn-after-click. Every
// remaining refusal is a bug in a list, not a feature." That is why every entry is measured by the
// *same* pre-probe evaluation `insertBody` runs — the hood is neither offered for nor accepted into
// a 400 mm top slot (§11 row 6), and both halves come from one function rather than two agreements.
//
// ADR 0032 reads the second sentence of that rule as the one the first was always serving:
// **disabled-with-reason**, not removed. This list used to run `evaluateInsertFit` and drop what
// failed, discarding a `RejectionDetail` that already said why — silent, and the reason nobody could
// discover that a bottle cargo exists or that a two-door needs 600 mm. Every band-appropriate entry
// now appears, carrying a verdict. Nothing became insertable: `insertBody`'s guards are untouched
// and a refused verdict is the refusal the command would give, published before the tap instead of
// after it.
import { normaliseBand } from "../bands.js";
import {
  buildableSizes,
  describeBodyLabelAt,
  isKnownKind,
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
import type { RejectionDetail } from "../commands/rejection.js";
import type {
  Band,
  BodyCatalog,
  Column,
  PlacementRecord,
  VoidRecord,
  WidthRangeMm,
} from "../void-engine.js";

/** ADR 0032: what the engine answered about one entry in one opening.
 *
 *  A **discriminated union rather than a flag plus optional numbers**, because the two verdicts
 *  carry disjoint facts and neither is meaningful under the other: an offered entry has a width and
 *  a height it would build to, and a refused one has no plan at all — `evaluateInsertFit` stopped
 *  before there was one. A `widthMm` on a refused row would be a number nobody computed, and the
 *  panel would have to guess whether to believe it.
 *
 *  `reason` is the `RejectionDetail` the engine already produced, carried whole and not re-derived:
 *  its code, its params and the sentence `rejection.ts` renders from them are one fact with one
 *  author (ADR 0032 rule 2). A renderer therefore needs nothing from this list but the list —
 *  no second evaluation, no re-reading of the catalogue, no vocabulary of its own.
 *
 *  "refused" rather than "disabled": the engine refuses, and a surface renders a refusal however it
 *  renders one. ADR 0032's disabled row is that rendering, not this word. */
export type OfferVerdict =
  | {
      readonly status: "offered";
      /** What this body would build to in this opening — the numbers §9's count line reads. */
      readonly widthMm: number;
      readonly heightMm: number;
    }
  | { readonly status: "refused"; readonly reason: RejectionDetail };

export interface CatalogOffer {
  readonly buildId: string;
  readonly label: string;
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
  readonly verdict: OfferVerdict;
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

/** The offer list for a selection, in catalogue order, every band-appropriate entry present.
 *
 *  Empty is still a real answer, and it now means only the two things it should: §11 row 24's
 *  unknown kind, which renders no replace section at all rather than a fallback set, and a target
 *  that does not resolve. It no longer means "nothing fitted" — that answer is now a list of refused
 *  verdicts, which is the whole of ADR 0032.
 *
 *  **Band stays a filter** (ADR 0032 rule 5). A wall cabinet is not disabled for a floor opening, it
 *  is not a candidate; showing every entry everywhere is noise, not information. Disablement is for
 *  an entry that would fit given more space. */
export function offersFor(input: OffersInput): CatalogOffer[] {
  const resolved = resolveInsertOpening(input);
  if (!resolved.ok) return [];
  if (!isOfferable(resolved.value)) return [];

  const currentBuildId = resolveCurrentCatalogId(input.catalog, resolved.value);
  return listInsertableBodies(input.catalog)
    .filter((body) => isInOfferedBand(body.band, resolved.value))
    .map((body) => {
      const verdict = judge(body, resolved.value, input.cabinetDepthMm);
      return {
        buildId: body.buildId,
        label: describeOfferLabel(body, verdict),
        kind: body.kind,
        band: body.band,
        // ADR 0017: the chips are the widths this body can be *built* at, not the widths its
        // catalogue row lists. Rendering a chip the guard would refuse is the same
        // "offered then refused" failure ADR 0017 closes, arriving one layer up.
        sizesMm: buildableSizes(body.minWidthMm, body.sizesMm),
        widthRangesMm: resolveWidthRangesMm(body),
        isCurrent: currentBuildId === body.buildId,
        verdict,
      };
    });
}

/** ADR 0033: the row's name, with the door count where there is a width to derive it from.
 *
 *  An **offered** row has one — the width this body would actually be built at in this opening — so
 *  a single `wall-cabinet` entry reads *Corp suspendat 1 ușă* in a 400 mm opening and
 *  *Corp suspendat 2 uși* in a 600 mm one, which is the merge doing its job in the place the
 *  customer sees it.
 *
 *  A **refused** row has none. `evaluateInsertFit` stopped before it chose a width, and stating a
 *  door count for a cabinet that cannot be built here would be the naming defect ADR 0033 exists to
 *  remove, reintroduced one row down. It shows the entry's generic name — which, with the count
 *  gone, is exactly what the customer is being told they cannot have yet. */
function describeOfferLabel(
  body: InsertableBody,
  verdict: OfferVerdict,
): string {
  if (verdict.status !== "offered") return body.label;
  return describeBodyLabelAt(body.definition, verdict.widthMm);
}

/** One entry against one opening, by the **same** evaluation `insertBody` runs — which is what makes
 *  a refused verdict the refusal the command would actually give, rather than a second opinion that
 *  can drift from it. */
function judge(
  body: InsertableBody,
  resolved: ResolvedOpening,
  cabinetDepthMm: number,
): OfferVerdict {
  const fit = evaluateInsertFit({
    body,
    opening: resolved.opening,
    column: resolved.column,
    cabinetDepthMm,
  });
  if (!fit.ok) return { status: "refused", reason: fit.detail };
  return {
    status: "offered",
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
