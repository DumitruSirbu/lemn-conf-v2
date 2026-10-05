// `DEVELOPMENT-SPEC.md` §9's width chips, answered by the engine: a chip is free if and only if
// `setWidth` at that width would succeed. Whether a width is reachable depends on the whole column,
// which side has empty space, what an opening would lie over and what the builders measure (ADR 0031),
// so no projection over `meta` can know it.
//
// So this query asks the command once per candidate width and discards the design. One code path
// decides what a resize may do, so "offered" and "accepted" cannot drift apart.
import type { BodyProbe } from "../body-probe.js";
import type { RejectionDetail } from "../commands/rejection.js";
import {
  columnWidthChoices,
  setWidth,
  type ColumnWidthChoicesInput,
} from "../commands/set-width.js";
import type { Column } from "../void-engine.js";

/** What the engine answered about one candidate width, a discriminated union because the states carry
 *  disjoint facts (ADR 0032): only a refusal has a reason.
 *
 *  `current` is a fact about the body, not an answer from the command: `setWidth` refuses its own
 *  current width (`WIDTH_UNCHANGED`) only on a column it could otherwise resize, and §9 needs exactly
 *  one `active` chip on every body (see `judgeWidth`).
 *
 *  `reason` is the `RejectionDetail` the command produced, carried whole, as `CatalogOffer.verdict`
 *  does, so a surface renders both through one localized resolver. */
export type WidthVerdict =
  | { readonly status: "current" }
  | { readonly status: "available" }
  /** ADR 0049: the one width a cabinet that cannot be resized is made at. `current` and `refused` at
   *  once, a status of its own so a surface must decide what to do with it; the chip is `active` and
   *  carries the engine's `NOT_RESIZABLE` descriptor. */
  | { readonly status: "fixed"; readonly reason: RejectionDetail }
  | { readonly status: "refused"; readonly reason: RejectionDetail };

export interface WidthOption {
  readonly widthMm: number;
  readonly verdict: WidthVerdict;
}

export interface WidthOptionsInput extends ColumnWidthChoicesInput {
  /** ADR 0011 Gap D's frozen extents, as `setWidth` takes them: which side has empty space is most of
   *  what decides a width, and the map is the only place an emptied column's geometry survives. */
  readonly columns: ReadonlyMap<string, Column>;
  /** Required. A resize rebuilds every member through the real builders and re-checks the measurement
   *  (`BUILT_SIZE_MISMATCH`), so an answer that skipped the probe would offer a chip the tap then
   *  refuses, which §9 forbids. A caller with no probe attached should publish no chips as free (see
   *  `use-panel-view.ts`). */
  readonly probe: BodyProbe;
}

/** The one timestamp this query produces, never stored. `setWidth` validates `occurredAt`, and without
 *  a valid one every width would refuse `INVALID_OCCURRED_AT` and the whole section would read
 *  blocked. A constant, not a clock: the panel memoises on its inputs. */
export const DISCARDED_OCCURRED_AT = "1970-01-01T00:00:00.000Z";

/** Every width §9 may render a chip for on this selection, each carrying the engine's verdict.
 *
 *  Empty when the selection is a void, no longer resolves, or resolves no set: the "no chips, no
 *  section" answer `describeWidthSection` makes, which keeps missing catalogue data failing loudly.
 *
 *  One chip on a cabinet that cannot be resized (ADR 0049), at the width it is made at, carrying the
 *  reason. The command is not run for it: `setWidth` refuses this body at every width, so asking would
 *  spend a rebuild to be told what the refusal already published. */
export function widthOptionsFor(input: WidthOptionsInput): WidthOption[] {
  const choices = columnWidthChoices(input);
  if (!choices) return [];
  if (choices.notResizable) {
    return [
      {
        widthMm: choices.currentWidthMm,
        verdict: { status: "fixed", reason: choices.notResizable },
      },
    ];
  }
  return choices.sizesMm.map((widthMm) => ({
    widthMm,
    verdict:
      widthMm === choices.currentWidthMm
        ? { status: "current" }
        : judgeWidth(input, widthMm),
  }));
}

/** One candidate width, by running the command; only the verdict survives. The current width never
 *  reaches here: a column holding an immovable member refuses every width before looking at which was
 *  asked for, so reading `active` out of a refusal code would leave those bodies with no active chip.
 *  Which width the body stands at is read from the body. */
function judgeWidth(input: WidthOptionsInput, widthMm: number): WidthVerdict {
  const result = setWidth({
    ...input,
    widthMm,
    occurredAt: DISCARDED_OCCURRED_AT,
  });
  if (result.ok) return { status: "available" };
  return { status: "refused", reason: result.reason };
}
