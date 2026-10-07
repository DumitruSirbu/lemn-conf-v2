// ADR 0035 decision 1's two candidates, each judged by running `setWidth` and discarding the design.
//
// A separate query from `widthOptionsFor` because three of the four bounds a step can hit are unreachable
// through the published set: `columnWidthChoices.sizesMm` stops at §7's 800 ceiling (so `+50` there has no
// verdict), the same one step below an entry's floor, and `COLUMN_HOOD_FLOOR` fires only for widths
// `intersectColumnWidths` already filtered out. A stepper may ask about widths outside the set, so it asks
// the command directly. It shares `width-options.ts`'s timestamp and judge, so one code path still decides
// what a resize may do.
import { setWidth, columnWidthChoices } from "../commands/set-width.js";
import { WIDTH_STEP_MM } from "../catalog.js";
import { DISCARDED_OCCURRED_AT, type WidthOption } from "./width-options.js";
import type { BodyProbe } from "../body-probe.js";
import type { BodyCatalog, Column } from "../void-engine.js";
import type { CommandTarget } from "../commands/command-result.js";
import type { Design } from "../design.js";

export interface WidthStepsInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** ADR 0011 Gap D's frozen extents, as `setWidth` takes them. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
  /** Required as for `widthOptionsFor`: a resize rebuilds every member through the real builders and
   *  re-checks the measurement, so a verdict reached without the probe would be a promise the tap breaks. */
  readonly probe: BodyProbe;
}

/** The two candidates §9 renders, each carrying the engine's own answer. Neither can be `current`: a step
 *  is ±50 mm from where the body stands. `WidthOption` is reused so the panel renders a step's refusal
 *  through the resolver a chip's goes through. */
export interface WidthSteps {
  /** The selected body's width, not the column extent's: a mixed column is squared up (ADR 0035 decision
   *  6), so a 450 under a 600 has an extent of 600 while the stepper on the 450 offers 400 and 500, the
   *  numbers the customer sees. */
  readonly currentWidthMm: number;
  readonly narrower: WidthOption;
  readonly wider: WidthOption;
}

/** `undefined` on every selection this control has nothing to say about: a void, a body that no longer
 *  resolves, one with no §7 equivalent, and a `fixedWidth` entry (ADR 0049 renders it as the one chip it is
 *  made at, and a stepper would be two buttons that can never move). Read from `columnWidthChoices` rather
 *  than `fixedWidth`, so the two controls cannot disagree about whether there is a section. */
export function widthStepsFor(input: WidthStepsInput): WidthSteps | undefined {
  const choices = columnWidthChoices(input);
  if (!choices || choices.notResizable) return undefined;
  const { currentWidthMm } = choices;
  return {
    currentWidthMm,
    narrower: judgeStep(input, currentWidthMm - WIDTH_STEP_MM),
    wider: judgeStep(input, currentWidthMm + WIDTH_STEP_MM),
  };
}

/** One candidate, by running the command. The design it returns is dropped; only the verdict survives, and
 *  a refusal keeps the `RejectionDetail` whole so the sentence has one author. */
function judgeStep(input: WidthStepsInput, widthMm: number): WidthOption {
  const result = setWidth({
    ...input,
    widthMm,
    occurredAt: DISCARDED_OCCURRED_AT,
  });
  if (result.ok) return { widthMm, verdict: { status: "available" } };
  return { widthMm, verdict: { status: "refused", reason: result.reason } };
}
