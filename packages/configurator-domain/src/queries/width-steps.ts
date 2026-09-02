// ADR 0035 decision 1's two candidates, each judged by running `setWidth` and discarding the design.
//
// **Why this is a separate query from `widthOptionsFor` rather than a projection of it.** That one
// answers per *candidate the column publishes*, and three of the four bounds a step can hit are
// unreachable through the published set by construction: `columnWidthChoices.sizesMm` stops at §7's
// 800 ceiling, so the `+50` there asks about a width with no verdict; the same one step below an
// entry's floor; and `COLUMN_HOOD_FLOOR` fires only for widths `intersectColumnWidths` has already
// filtered out. A stepper asks about two widths that may lie outside the set, so it must ask the
// command directly.
//
// It lived in the web package for one wave, on the reasoning that its wave could not change the
// domain — which that wave's own commit contradicted. Moved here on 5D2c's clean-code review (S3,
// S4): it is a sibling of `width-options.ts`, it shares that file's timestamp and judge rather than
// re-implementing them, and `width-options.ts`'s stated guarantee — *one code path decides what a
// resize may do* — stops being true the moment there are two.
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

/** `undefined` on every selection this control has nothing to say about: a void, a body that no
 *  longer resolves, one with no §7 equivalent — and a `fixedWidth` entry, which under ADR 0049 does
 *  render a section but renders it as the one chip it is made at. A stepper there would be two
 *  buttons that can never move, where the discrete control already says the one true thing.
 *
 *  Read from `columnWidthChoices` rather than from `fixedWidth`, so the two controls cannot disagree
 *  about whether there is a section or about which one it is. */
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
