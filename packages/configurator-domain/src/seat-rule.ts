// **Which plane a body's wall-normal position is fixed against** — declared per catalogue entry,
// never inferred from a band, a kind, or a list of ids kept somewhere else.
//
// ADR 0077. A recorded `seatDepthMm` carries two qualifiers the number itself does not: which
// quantity it measures, and which setting it was taken at. This module owns the first.
//
// **The defect that made it a field.** `reseat` persisted `2 × measurement.seatOffsetM` — the body's
// rear overhang as built — over the joint seat `base-corner-x-900` declares. `cornerBaseX()` takes
// the recorded width but no depth argument and reads the kit's own cabinet depth, so the `depthM`
// handed to the probe reached nothing: declared 560, measured 600 at a 600 mm kitchen (the figures as of that fix; ADR 0135 later
// made them 550 and 590). Persisting
// the measurement made the X-leg flush and drove 0.00835 m³ of its carcass into
// `base-corner-return-320` — the two-solid-volumes case ADR 0025 names by name.
//
// **Three arms rather than a boolean**, because a boolean puts the hood and the corner leg in one
// bucket when they need opposite handling — which is precisely why the adapter grew its own second
// list (`FRONT_ALIGNED_BUILD_IDS`) instead of asking the catalogue. The property was load-bearing in
// three places and declared in none.
//
// The same stance `cabinet-depth-rule.ts` takes for the depth question and `cabinet-handles.ts` for
// an undeclared handle count, for the same reason: the failure is invisible in a scene.

/** Which plane fixes this body's position along the wall normal.
 *
 *  - **`wall-plane`** — the back face sits on the wall. Its seat is measurable and *must* stay
 *    measured: ADR 0011 Gap B §6.2 records two failed attempts at predicting a seat instead. Most
 *    of the catalogue.
 *  - **`cabinet-front-line`** — fixed against a plane the body owns that is not the wall plane, so
 *    it is still measurable, but to that plane. The front-hung hood (ADR 0039).
 *  - **`joint`** — fixed by *another body*, so there is no plane of its own to measure and the
 *    declaration is the only authority. `base-corner-x-900`, driven 20 mm into the return leg by
 *    ADR 0025 decision 2.
 *
 *  **No payload on `joint`.** A `meetsBuildId` would be a design fact rather than a catalogue one,
 *  and ADR 0073 decision 1's argument against a chain enum applies unchanged. */
export type SeatedOn = "wall-plane" | "cabinet-front-line" | "joint";

export interface SeatRule {
  readonly seatedOn: SeatedOn;
}

/** The two arms a probe can answer. `joint` cannot be widened into this, which is what makes
 *  "ask the probe to measure a joint-seated body" fail to compile rather than at runtime. */
export type MeasurableSeatedOn = Exclude<SeatedOn, "joint">;

export const seatedOnWallPlane: SeatRule = { seatedOn: "wall-plane" };
export const seatedOnCabinetFrontLine: SeatRule = {
  seatedOn: "cabinet-front-line",
};
export const seatedByAJoint: SeatRule = { seatedOn: "joint" };

export class UndeclaredSeatRuleError extends Error {
  constructor(buildId: string) {
    super(
      `Catalogue entry "${buildId}" declares no seat rule. Every entry must state which plane ` +
        `seats it (ADR 0077): a silent default is how a joint-seated body came to be measured.`,
    );
    this.name = "UndeclaredSeatRuleError";
  }
}

/** **Total, and it throws rather than defaulting.** A `?? "wall-plane"` anywhere is the shape of the
 *  original defect: it reads "nobody said" as "the ordinary case", which is exactly what the corner
 *  leg is not. */
export function seatRuleOf(query: {
  readonly buildId: string;
  readonly rule?: SeatRule | undefined;
}): SeatRule {
  if (!query.rule) throw new UndeclaredSeatRuleError(query.buildId);
  return query.rule;
}

/** Whether the probe may be asked for this body's seat at all. */
export function isMeasurableSeat(rule: SeatRule): boolean {
  return rule.seatedOn !== "joint";
}

export class JointSeatIsNotMeasurableError extends Error {
  constructor(buildId: string) {
    super(
      `Catalogue entry "${buildId}" is seated by a joint, so it has no plane of its own to ` +
        `measure. Its declared seat is the authority (ADR 0077 decision 1).`,
    );
    this.name = "JointSeatIsNotMeasurableError";
  }
}

/** The arm a `BodyProbeRequest` may carry, or a throw.
 *
 *  **This is the runtime half of decision 3's compile-time guard**, for the paths that reach the
 *  probe with a rule read from the catalogue rather than a literal. `insertBody` and `rebuild` only
 *  ever see insertable bodies and a joint-seated entry is structural, so reaching this throw means
 *  the catalogue changed underneath the caller — which is worth a loud failure rather than a guess. */
export function measurableSeatOf(query: {
  readonly buildId: string;
  readonly rule?: SeatRule | undefined;
}): MeasurableSeatedOn {
  const rule = seatRuleOf(query);
  if (rule.seatedOn === "joint") {
    throw new JointSeatIsNotMeasurableError(query.buildId);
  }
  return rule.seatedOn;
}
