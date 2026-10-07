// Which plane a body's wall-normal position is fixed against, declared per catalogue entry and never
// inferred from a band, a kind or a list of ids kept elsewhere (ADR 0077). A recorded `seatDepthMm`
// carries two qualifiers the number does not: which quantity it measures and which setting it was
// taken at; this module owns the first.
//
// It is a field because persisting the probe's `2 × measurement.seatOffsetM` over the joint seat
// `base-corner-x-900` declares made the X-leg flush and drove its carcass into
// `base-corner-return-320` (ADR 0025). `cornerBaseX()` reads the kit's own depth, so the `depthM` given
// to the probe reached nothing: declared 550, measured 590 at a 600 mm kitchen (ADR 0135).
//
// Three arms, not a boolean, because a boolean puts the hood and the corner leg in one bucket when they
// need opposite handling. The stance is `cabinet-depth-rule.ts`'s and `cabinet-handles.ts`'s: the
// failure is invisible in a scene.

/** Which plane fixes this body's position along the wall normal.
 *
 *  - `wall-plane`: the back face sits on the wall. Its seat is measurable and must stay measured
 *    (ADR 0011 Gap B §6.2 records two failed attempts at predicting a seat). Most of the catalogue.
 *  - `cabinet-front-line`: fixed against a plane the body owns that is not the wall plane, so still
 *    measurable, but to that plane. The front-hung hood (ADR 0039).
 *  - `joint`: fixed by another body, so there is no plane of its own to measure and the declaration is
 *    the only authority. `base-corner-x-900`, driven 20 mm into the return leg (ADR 0025 decision 2).
 *
 *  No payload on `joint`: a `meetsBuildId` would be a design fact, not a catalogue one (ADR 0073
 *  decision 1). */
export type SeatedOn = "wall-plane" | "cabinet-front-line" | "joint";

export interface SeatRule {
  readonly seatedOn: SeatedOn;
}

/** The two arms a probe can answer. `joint` cannot be widened into this, so asking the probe to measure
 *  a joint-seated body fails to compile. */
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

/** Total, and it throws rather than defaulting: a `?? "wall-plane"` reads "nobody said" as "the
 *  ordinary case", which is what the corner leg is not. */
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

/** The arm a `BodyProbeRequest` may carry, or a throw: the runtime half of decision 3's compile-time
 *  guard, for paths that read the rule from the catalogue. `insertBody` and `rebuild` only see
 *  insertable bodies and a joint-seated entry is structural, so reaching the throw means the catalogue
 *  changed underneath the caller. */
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
