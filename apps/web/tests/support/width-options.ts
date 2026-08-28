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
