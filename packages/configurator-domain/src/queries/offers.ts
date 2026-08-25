// `DEVELOPMENT-SPEC.md` §9's replace list: what a customer may actually put in this opening.
//
// "Never offer what cannot be satisfied. Disabled-with-reason beats warn-after-click. Every
// remaining refusal is a bug in a list, not a feature." That is why every offer is produced by the
// *same* pre-probe evaluation `insertBody` runs — the hood is neither offered for nor accepted into
// a 400 mm top slot (§11 row 6), and both halves come from one function rather than two agreements.
import { normaliseBand } from "../bands.js";
import { isKnownKind, listInsertableBodies } from "../catalog.js";
import type { CommandTarget } from "../commands/command-result.js";
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
          sizesMm: body.sizesMm,
          widthMm: Math.round(fit.plan.widthM * 1000),
          heightMm: Math.round(fit.plan.heightM * 1000),
          isCurrent: resolved.value.replaced?.buildId === body.buildId,
        },
      ];
    });
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
