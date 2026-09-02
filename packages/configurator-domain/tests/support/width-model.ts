/** ADR 0035's width model, as the chips it produces — the numbers a dozen tests used to pin as
 *  literals when the catalogue hand-maintained a list per entry.
 *
 *  Written down once because the step is a **presentation** constant (ADR 0035 decision 8): the
 *  owner has already named 25 mm as a plausible successor to 50, and a test suite that spells the
 *  ladder out in twenty places is the rework that decision exists to avoid. A test that is really
 *  about a *bound* asserts against `acceptsWidthMm` instead and does not appear here.
 */

/** ADR 0035 decision 1 with the owner's 2026-08-28 ruling: 200–800 at 50 mm, unbroken. It carried
 *  ADR 0030's (400, 500) hole until the owner retired the 400 mm one-door cap — "let's add this 450
 *  for one door… two doors start from 500" — so 450 is an ordinary one-door width. The two hinged
 *  rows are `CABINETRY_CHIPS_MM` with the floor at their own declared 200 rather than §2's default,
 *  and nothing else. */
export const HINGED_CHIPS_MM = [
  200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
] as const;

/** A cabinetry row that declares no floor of its own: §2's default up to §7's ceiling. */
export const CABINETRY_CHIPS_MM = [
  300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
] as const;

/** ADR 0017's 560 mm aperture rounded up to the first step, then §7's ceiling. The sink base and
 *  the hood (ADR 0035 decision 5, floored at 600) produce the same five widths for two reasons. */
export const SINK_CHIPS_MM = [600, 650, 700, 750, 800] as const;
export const HOOD_CHIPS_MM = [600, 650, 700, 750, 800] as const;

/** ADR 0048: the pantry column's own bound — its declared 400 mm floor up to §7's ceiling. The one
 *  full-height row with a stepper, because it is the one with no appliance inside it. */
export const PANTRY_CHIPS_MM = [
  400, 450, 500, 550, 600, 650, 700, 750, 800,
] as const;
