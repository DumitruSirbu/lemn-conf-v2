// `DEVELOPMENT-SPEC.md` §9's replace list: what a customer may actually put in this opening.
//
// "Never offer what cannot be satisfied. Disabled-with-reason beats warn-after-click. Every
// remaining refusal is a bug in a list, not a feature." That is why every offer is produced by the
// *same* pre-probe evaluation `insertBody` runs — the hood is neither offered for nor accepted into
// a 400 mm top slot (§11 row 6), and both halves come from one function rather than two agreements.
import { normaliseBand } from "../bands.js";
import {
  buildableSizes,
  isKnownKind,
  listInsertableBodies,
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
} from "../void-engine.js";

export interface CatalogOffer {
  readonly buildId: string;
  readonly label: string;
  readonly kind: string;
  readonly band: Band;
  readonly sizesMm: readonly number[];
  /** What this body would build to in this opening — the numbers §9's count line reads. */
  readonly widthMm: number;
  readonly heightMm: number;
  /** §9: the current row is badged ACTUAL rather than hidden. */
  readonly isCurrent: boolean;
}

export interface OffersInput {
  readonly records: readonly PlacementRecord[];
  readonly voids: readonly VoidRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
}

/** The offer list for a selection. Empty is a real answer: §9's "zero results" case, and §11 row
 *  24's unknown kind, which renders no replace section at all rather than a fallback set. */
export function offersFor(input: OffersInput): CatalogOffer[] {
  const resolved = resolveInsertOpening(input);
  if (!resolved.ok) return [];
  if (!isOfferable(resolved.value)) return [];

  const currentBuildId = resolveCurrentCatalogId(input.catalog, resolved.value);
  return listInsertableBodies(input.catalog)
    .filter((body) => isInOfferedBand(body.band, resolved.value))
    .flatMap((body) => {
      const fit = evaluateInsertFit({
        body,
        opening: resolved.value.opening,
        column: resolved.value.column,
      });
      if (!fit.ok) return [];
      return [
        {
          buildId: body.buildId,
          label: body.label,
          kind: body.kind,
          band: body.band,
          // ADR 0017: the chips are the widths this body can be *built* at, not the widths its
          // catalogue row lists. Rendering a chip the guard would refuse is the same
          // "offered then refused" failure ADR 0017 closes, arriving one layer up.
          sizesMm: buildableSizes(body.minWidthMm, body.sizesMm),
          widthMm: toMillimetres(fit.plan.widthM),
          heightMm: toMillimetres(fit.plan.heightM),
          isCurrent: currentBuildId === body.buildId,
        },
      ];
    });
}

/** Which insertable entry the opening's current occupant *is*, so §9 can badge that row **ACTUAL**.
 *
 *  ADR 0011 Gap A gives every seeded placement a non-insertable `buildId`, and the offer list is
 *  built from insertable entries only, so comparing the two ids directly never matched on the
 *  shipped kitchen — the badge appeared only on a body that had already been swapped once. The
 *  relationship is therefore **declared** on the seeded entry (`catalogEquivalentId`) rather than
 *  inferred from kind, band and width: §6.3 records what inferring a body's identity cost.
 *
 *  `undefined` — an entry with no declared equivalent, or a void — means no row is badged, which is
 *  the correct answer for the hob and the corner returns rather than a missing one. */
function resolveCurrentCatalogId(
  catalog: BodyCatalog,
  resolved: ResolvedOpening,
): string | undefined {
  const replaced = resolved.replaced;
  if (!replaced) return undefined;
  const definition = catalog.get(replaced.buildId);
  if (!definition) return undefined;
  // An inserted placement already carries an insertable id; only a seeded one needs the pointer.
  return definition.insertable === true
    ? replaced.buildId
    : definition.catalogEquivalentId;
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
