// `DEVELOPMENT-SPEC.md` §9's width chips, answered by the engine: **a chip is free if and only if
// `setWidth` at that width would succeed.**
//
// That is the promise M4 deliberately refused to make. It shipped every non-current chip `blocked`
// because no resize command existed, and it recorded — in `panel-model.ts` and in the milestone —
// that "it is in the set and is not the current width" is *not* the rule. ADR 0031 is why: whether a
// width is reachable depends on the whole column, on which side has empty space, on what an opening
// would come to lie over, and on what the builders actually measure. No projection over `meta` can
// know any of that.
//
// So this query does not model the answer. **It asks the command**, once per candidate width, and
// throws the resulting design away. One code path decides what a resize may do, which is what makes
// "offered" and "accepted" incapable of drifting apart — the defect class ADRs 0016, 0017, 0021,
// 0029 and 0032 each caught, arriving in the one section §9 had left unwired.
import type { BodyProbe } from "../body-probe.js";
import type { RejectionDetail } from "../commands/rejection.js";
import {
  columnWidthChoices,
  setWidth,
  type ColumnWidthChoicesInput,
} from "../commands/set-width.js";
import type { Column } from "../void-engine.js";

/** What the engine answered about one candidate width, as a discriminated union for the same reason
 *  `OfferVerdict` is one (ADR 0032): the three states carry disjoint facts. Only a refusal has a
 *  reason, and a `reason` beside an available width would be a field nobody filled.
 *
 *  `current` is a fact about the body, not an answer from the command. `setWidth` does refuse its own
 *  current width — `WIDTH_UNCHANGED`, deliberately, so that "free iff the command succeeds" needs no
 *  exception — but it reaches that check only on a column it could otherwise resize, and §9 needs
 *  exactly one `active` chip on every body. See `judgeWidth`.
 *
 *  `reason` is the `RejectionDetail` the command produced, carried whole and not re-derived — the
 *  same contract `CatalogOffer.verdict` publishes, so a surface renders both through the one
 *  `renderRejection`. */
export type WidthVerdict =
  | { readonly status: "current" }
  | { readonly status: "available" }
  | { readonly status: "refused"; readonly reason: RejectionDetail };

export interface WidthOption {
  readonly widthMm: number;
  readonly verdict: WidthVerdict;
}

export interface WidthOptionsInput extends ColumnWidthChoicesInput {
  /** ADR 0011 Gap D's frozen extents, exactly as `setWidth` takes them: which side has empty space
   *  is most of what decides a width, and the map is the only place an emptied column's geometry
   *  survives. */
  readonly columns: ReadonlyMap<string, Column>;
  /** Required, and it is what makes this query honest. A resize rebuilds every member through the
   *  real builders and re-checks the measurement (`BUILT_SIZE_MISMATCH`), so a freedom answer that
   *  skipped the probe would be a second opinion — offering a chip the tap then refuses, which is
   *  precisely what §9 forbids. A caller with no probe attached has no answer to give and should
   *  publish no chips as free; see `use-panel-view.ts`. */
  readonly probe: BodyProbe;
}

/** The one timestamp this query ever produces, and it is never stored.
 *
 *  `setWidth` validates `occurredAt` and stamps it onto the design it returns. This query discards
 *  every design it builds, so the value reaches no document — but the command still has to be given
 *  a valid one or it would refuse `INVALID_OCCURRED_AT` for every width and report the whole section
 *  blocked for a reason that has nothing to do with widths.
 *
 *  A constant rather than a clock, on purpose: a query that read the time would return a different
 *  value on every call, and the panel memoises on its inputs. */
export const DISCARDED_OCCURRED_AT = "1970-01-01T00:00:00.000Z";

/** Every width §9 may render a chip for on this selection, each carrying the engine's verdict.
 *
 *  Empty when the selection is a void, no longer resolves, or resolves no set at all — which is the
 *  same "no chips, therefore no section" answer `describeWidthSection` already makes, and the
 *  arrangement that keeps missing catalogue data failing loudly (M5 wave 5B, FINDING R2.7). */
export function widthOptionsFor(input: WidthOptionsInput): WidthOption[] {
  const choices = columnWidthChoices(input);
  if (!choices) return [];
  return choices.sizesMm.map((widthMm) => ({
    widthMm,
    verdict:
      widthMm === choices.currentWidthMm
        ? { status: "current" }
        : judgeWidth(input, widthMm),
  }));
}

/** One candidate width, by **running the command**. The design it returns is dropped; only the
 *  verdict survives.
 *
 *  The current width never reaches here. `setWidth` refuses it — `WIDTH_UNCHANGED`, deliberately, so
 *  that "free iff the command succeeds" needs no exception — but it only gets that far on a column
 *  it could otherwise resize. A column holding an immovable member refuses **every** width before it
 *  looks at which one was asked for, and reading `active` out of a refusal code would leave §9's
 *  section with no active chip on exactly those bodies. Which width the body is standing at is a
 *  fact about the body, so it is read from the body. */
function judgeWidth(input: WidthOptionsInput, widthMm: number): WidthVerdict {
  const result = setWidth({
    ...input,
    widthMm,
    occurredAt: DISCARDED_OCCURRED_AT,
  });
  if (result.ok) return { status: "available" };
  return { status: "refused", reason: result.reason };
}
