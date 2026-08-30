// §9's width chips as the engine publishes them, for the tests that are about the **panel**.
//
// `widthOptionsFor` runs `setWidth` once per candidate width, so producing a real option list needs
// a design, a column map and a probe. `describePanel`'s own contract needs none of that: it is
// handed a judged list and renders it, and every rule it owns — which state each verdict becomes,
// which chips are clickable, which carry a reason, whether the section appears at all — is
// exercised by handing it one.
//
// So these builders state the verdict directly. That is not a second implementation of the freedom
// rule: no rule lives here. The rule that a chip is free **iff** the command succeeds is proved
// where the command actually runs — `packages/configurator-domain/tests/queries/width-options.test.ts`
// for the domain half, and the browser suite for the whole path.
import type { WidthOption } from "@lemnaria/configurator-domain";

import type { WidthChoiceSection, WidthSection } from "@/panel/panel-model";

/** The refusal a blocked chip carries in these fixtures. A real code with a real sentence, chosen
 *  because it takes one parameter: the panel renders whatever `renderRejection` returns and no test
 *  here should depend on which refusal it was. */
function refusedBecauseNotResizable(label: string): WidthOption["verdict"] {
  return {
    status: "refused",
    reason: { code: "NOT_RESIZABLE", params: { label } },
  };
}

export interface WidthOptionRow {
  /** The width the column already sits at — §9's one `active` chip. */
  readonly currentMm: number;
  /** Widths `setWidth` would accept. §9's `free` chips, and the only clickable ones. */
  readonly freeMm?: readonly number[];
  /** Widths the command refused. §9's `blocked` chips, each carrying the engine's sentence. */
  readonly blockedMm?: readonly number[];
  /** The body named in the refusals, where a test reads the sentence back. */
  readonly label?: string;
}

/** One judged chip row, ascending — the order `columnWidthCandidatesMm` publishes and the order the
 *  panel must preserve. */
export function widthOptionRow(row: WidthOptionRow): WidthOption[] {
  const label = row.label ?? "Corp";
  const options: WidthOption[] = [
    { widthMm: row.currentMm, verdict: { status: "current" } },
    ...(row.freeMm ?? []).map(
      (widthMm): WidthOption => ({
        widthMm,
        verdict: { status: "available" },
      }),
    ),
    ...(row.blockedMm ?? []).map(
      (widthMm): WidthOption => ({
        widthMm,
        verdict: refusedBecauseNotResizable(label),
      }),
    ),
  ];
  return options.sort((left, right) => left.widthMm - right.widthMm);
}

/** The M4-shaped row: every width but the current one refused. Many tests are about something else
 *  entirely — section order, a flag gate, read-only, the replace list — and need a width section to
 *  exist without taking a position on what is reachable in it.
 *
 *  **Empty in, empty out**, matching `columnWidthChoices`: a body that resolves no set at all gets no
 *  options, therefore no section (FINDING R2.7). Folding the current width into an empty set here
 *  would hand the panel one chip and quietly undo the arrangement that makes missing catalogue data
 *  fail loudly. */
export function noWidthIsFree(
  currentMm: number,
  widthsMm: readonly number[],
): WidthOption[] {
  if (widthsMm.length === 0) return [];
  return widthOptionRow({
    currentMm,
    blockedMm: widthsMm.filter((widthMm) => widthMm !== currentMm),
  });
}

/** ADR 0035's width model as the chips the engine publishes, for the panel tests that pin a real
 *  row rather than a fabricated one. The catalogue derives these from each entry's bound at a 50 mm
 *  step (`packages/configurator-domain/src/catalog.ts`); they are written out here because a panel
 *  test asserting the row it renders has to state the row, and because the step is a presentation
 *  constant the owner has already named 25 mm as a successor to. */
export const HINGED_CHIPS_MM = [
  200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
];

/** A cabinetry row with no floor of its own: §2's default up to §7's ceiling. */
export const CABINETRY_CHIPS_MM = [
  300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
];

/** ADR 0017's 560 mm sink aperture stepped up to the first multiple, then §7's ceiling. The hood
 *  produces the same five widths from ADR 0035 decision 5's 600 mm floor. */
export const SINK_CHIPS_MM = [600, 650, 700, 750, 800];

/** §9's width section narrowed to ADR 0035 decision 3's **discrete** control, for the fixture tests
 *  that assert a chip row.
 *
 *  It **throws** on the stepper rather than returning `undefined`, and that is the point. Since
 *  `DescribePanelInput.widthRanges` became optional, an absent one renders the choice — so a fixture
 *  is free to describe a chip row for a column the customer sees two buttons on, and every assertion
 *  under a lenient narrowing would quietly go missing instead of failing. A throw makes that a
 *  failure with a message naming the control it actually got. */
export function asWidthChoice(
  section: WidthSection | undefined,
): WidthChoiceSection {
  if (section?.control !== "choice") {
    throw new Error(
      `expected a discrete width choice, got ${section?.control ?? "no width section"}`,
    );
  }
  return section;
}
