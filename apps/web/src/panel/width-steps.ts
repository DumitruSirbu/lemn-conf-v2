// ADR 0035 decision 1's stepper, judged the way wave 5D judged its chips: **by running the command
// and discarding the design.** Two candidates instead of thirteen, and the same guarantee — a button
// is enabled if and only if the step it offers would be accepted, because one code path answers
// both.
//
// **Why this lives in the web package and not beside `widthOptionsFor`.** The milestone assigns
// "`widthOptionsFor` becomes a step query" to this wave, and wave 5D2c's dispatch forbids touching
// `packages/configurator-domain/src`. Those cannot both be satisfied, because the three reasons
// ADR 0032 requires the disabled buttons to carry are **unreachable** through the published
// candidate set:
//
// - §7's 800 ceiling — `columnWidthChoices` stops at 800, so the `+50` asks about 850, which is not
//   in `sizesMm` and therefore has no published verdict.
// - the entry's own floor and §2's default floor — same shape, one step below the first candidate.
// - the hood's floor (`COLUMN_HOOD_FLOOR`, new in 5D2b) — `intersectColumnWidths` filters the
//   floored widths out of the set before `columnWidthChoices` ever sees them, so the one width that
//   produces that sentence is exactly the one the set omits.
//
// So the question has to be asked of widths the set does not contain, which is what this module
// does. It is a **caller** of `setWidth`, not a second opinion about it: the intended home is the
// domain query, and moving it there is a one-file follow-up that changes no behaviour.
import {
  WIDTH_STEP_MM,
  columnWidthChoices,
  setWidth,
  type BodyCatalog,
  type BodyProbe,
  type Column,
  type CommandTarget,
  type Design,
  type WidthOption,
} from "@lemnaria/configurator-domain";

/** ADR 0035 decision 8: the step is a **presentation constant**. The owner has already named 25 mm
 *  as a plausible successor, and nothing downstream of this panel may depend on the value — which is
 *  why the price is a formula over width in M6 rather than a table keyed on the widths it produces. */
/** Re-exported from the catalogue, never re-declared. It was `= 50` in both places, and the drift
 *  would have been **silent**: ADR 0035 decision 8 names 25 mm as the successor, and at 25 the
 *  catalogue would generate 25 mm chips while the panel kept stepping 50 — every other legal width
 *  unreachable, and no test failing, because 50 is a multiple of 25 so every step still lands on a
 *  chip (5D2c QA S2). */
export { WIDTH_STEP_MM };

export interface WidthStepsInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D's frozen extents, exactly as `setWidth` takes them. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
  /** Required for the reason `widthOptionsFor` requires one: a resize rebuilds every member through
   *  the real builders and re-checks the measurement, so a verdict reached without the probe would
   *  be a promise the tap then breaks. */
  readonly probe: BodyProbe;
}

/** The two candidates §9 renders, each carrying the engine's own answer.
 *
 *  Neither can be `current`: a step is ±50 mm from where the body stands, so it never asks about the
 *  width it is already at. `WidthOption` is reused rather than restated so the panel renders a step's
 *  refusal through the very `renderRejection` a chip's goes through. */
export interface WidthSteps {
  /** The selected **body's** width, not the column extent's. ADR 0035 decision 6 squares a mixed
   *  column up, so a 450 under a 600 has an extent of 600 while the stepper on the 450 offers 400
   *  and 500 — the numbers the customer is looking at. `setWidth`'s own `WIDTH_UNCHANGED` comment
   *  states the same rule from the command's end. */
  readonly currentWidthMm: number;
  readonly narrower: WidthOption;
  readonly wider: WidthOption;
}

/** The one timestamp this module produces, and it reaches no document: every design built here is
 *  thrown away. A constant rather than a clock, because the panel memoises on its inputs and a query
 *  that read the time would answer differently on every render. Mirrors `widthOptionsFor`. */
const DISCARDED_OCCURRED_AT = "1970-01-01T00:00:00.000Z";

/** `undefined` on exactly the selections that render no width section at all — a void, a body that
 *  no longer resolves, a `fixedWidth` entry, or one with no §7 equivalent. That is the same question
 *  `columnWidthChoices` answers for the chips, asked once so the two controls cannot disagree about
 *  whether there is a section. */
export function widthStepsFor(input: WidthStepsInput): WidthSteps | undefined {
  const choices = columnWidthChoices(input);
  if (!choices) return undefined;
  const { currentWidthMm } = choices;
  return {
    currentWidthMm,
    narrower: judgeStep(input, currentWidthMm - WIDTH_STEP_MM),
    wider: judgeStep(input, currentWidthMm + WIDTH_STEP_MM),
  };
}

/** One candidate, by **running the command**. The design it returns is dropped; only the verdict
 *  survives, and a refusal keeps the `RejectionDetail` whole so the sentence has one author
 *  (ADR 0032 rule 2). */
function judgeStep(input: WidthStepsInput, widthMm: number): WidthOption {
  const result = setWidth({
    ...input,
    widthMm,
    occurredAt: DISCARDED_OCCURRED_AT,
  });
  if (result.ok) return { widthMm, verdict: { status: "available" } };
  return { widthMm, verdict: { status: "refused", reason: result.reason } };
}
