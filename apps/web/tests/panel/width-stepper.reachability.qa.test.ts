// **SKIPPED PENDING AN OWNER DECISION — not repaired, and not a passing test pretending otherwise.**
//
// Wave 5D2c's QA found that the stepper cannot express every width `setWidth` accepts. Measured:
// shrink `p0` from 800 in four presses of −50 and `+50` dies at the second press and never returns,
// while `setWidth` still accepts **800** at every one of those states. Growing consumes the empty
// column a shrink vacated, and ADR 0031 refuses a grow that would leave a residue under §2's
// `MIN_W` — so 700 → 800 is legal (residue 0) and 700 → 750 is not (residue 50). The chip row 5D
// shipped could offer that jump; two buttons cannot.
//
// A customer therefore loses the width they loaded with, permanently, in four ordinary taps. That
// is a regression against 5D, not an inherited limit.
//
// Three answers, with the owner: let a grow leave a sub-`MIN_W` residue — which ADR 0037's "empty
// space may be left" already permits and which the next press absorbs; let `+50` consume the whole
// remaining column when a step would leave a sliver, at the cost of a button that moves further
// than it says; or accept a one-way ratchet and say so in §9's note.
//
// Un-skip the day it is decided. Whichever way it goes, one of these assertions changes
// deliberately rather than silently.
// **FINDING 5D2c-B1 — the stepper strands widths the engine accepts, and the shrink is one-way.**
//
// Wave 5D2c's own property holds: each button is enabled if and only if the step it offers succeeds.
// This file asserts the property that property does not imply — **every width `setWidth` accepts is
// reachable through the control the customer is given.** The chip row it replaced satisfied it by
// construction, because every candidate had a chip; a two-button stepper only reaches ±50.
//
// The gap is not theoretical. `setWidth` funds a grow from the empty column a previous shrink
// vacated, and refuses to leave a residue narrower than §2's `MIN_W` — so after the *second* `−50`
// the empty column is 100 mm, `+50` would leave 50 mm, and the button dies. The original width stays
// legal the whole time (the empty column is consumed in full), and it stays one chip away under wave
// 5D and unreachable under this one.
//
// Four presses on `p0` reach the terminal case: a stepper with **both buttons permanently disabled**
// while `setWidth` still accepts 800. Nothing in the shipped kitchen can then restore it — a single
// delete never empties a whole column, so the width the customer loaded with is gone for good.
import {
  cabinetDepthMmOf,
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  setWidth,
  widthOptionsFor,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type WidthStepperSection } from "@/panel/panel-model";
import { widthStepsFor } from "@lemnaria/configurator-domain";

import { createFakeBodyProbe } from "../support/fake-body-probe";

const PROBE = createFakeBodyProbe();
const OCCURRED_AT = "2026-08-30T12:00:00.000Z";
const CATALOG = KITCHEN_L_BODY_CATALOG;
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG),

  {},
  KITCHEN_L_DESIGN.room,
);

interface Kitchen {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
}

const SEEDED_KITCHEN: Kitchen = {
  design: KITCHEN_L_DESIGN,
  columns: SEEDED_COLUMNS,
};

function engineInput(kitchen: Kitchen, id: string) {
  return {
    design: kitchen.design,
    catalog: CATALOG,
    columns: kitchen.columns,
    target: { kind: "placement", id } as const,
    probe: PROBE,
  };
}

function press(
  kitchen: Kitchen,
  id: string,
  widthMm: number,
): Kitchen | undefined {
  const result = setWidth({
    ...engineInput(kitchen, id),
    widthMm,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) return undefined;
  return { design: result.design, columns: result.effect.columns };
}

function stepperAt(kitchen: Kitchen, id: string): WidthStepperSection {
  const records = derivePlacementRecords(kitchen.design, CATALOG);
  const target = { kind: "placement", id } as const;
  const world = {
    design: kitchen.design,
    records,
    columns: kitchen.columns,
    voids: recomputeVoids(records, kitchen.columns),
    catalog: CATALOG,
  };
  const panel = describePanel({
    meta: describeSelection({ ...world, target }),
    offers: offersFor({
      ...world,
      target,
      cabinetDepthMm: cabinetDepthMmOf(kitchen.design),
    }),
    rejection: null,
    widthOptions: widthOptionsFor(engineInput(kitchen, id)),
    widthSteps: widthStepsFor(engineInput(kitchen, id)),
    widthRanges:
      columnWidthChoices({ design: kitchen.design, catalog: CATALOG, target })
        ?.widthRangesMm ?? [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") throw new Error(`no panel on ${id}`);
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  if (section?.kind !== "width" || section.control !== "stepper")
    throw new Error(`no stepper on ${id}`);
  return section;
}

/** Every width the engine accepts on this selection right now — the chips wave 5D rendered. */
function acceptedWidthsMm(kitchen: Kitchen, id: string): number[] {
  return widthOptionsFor(engineInput(kitchen, id))
    .filter((option) => option.verdict.status === "available")
    .map((option) => option.widthMm);
}

/** Presses `−50` `count` times, through the real command, carrying the changed column map forward. */
function shrink(id: string, count: number): Kitchen {
  let kitchen = SEEDED_KITCHEN;
  for (let step = 0; step < count; step += 1) {
    const next = press(kitchen, id, stepperAt(kitchen, id).steps[0].widthMm);
    if (!next)
      throw new Error(`${id} would not shrink at step ${String(step)}`);
    kitchen = next;
  }
  return kitchen;
}

describe("FINDING 5D2c-B1: the stepper reaches every width the engine accepts", () => {
  // The terminal state, and the one that makes this a blocker rather than a nuisance: both buttons
  // dead, 800 still legal, and no delete in the shipped kitchen frees an adjacent column.
  it.skip("does not freeze `p0` at 600 while `setWidth` still accepts 800", () => {
    const kitchen = shrink("p0", 4);
    const section = stepperAt(kitchen, "p0");

    expect(section.valueLabel).toBe("600 mm");
    expect(acceptedWidthsMm(kitchen, "p0")).toEqual([800]);
    expect(section.steps.map((step) => step.isDisabled)).not.toEqual([
      true,
      true,
    ]);
  });

  // The same defect stated as the customer's move rather than as a set: **a shrink is not
  // reversible past the first press.** ADR 0035 decision 7 funds a grow from the space a shrink
  // vacated, which is what makes the stepper usable at all; the residue rule means only the very
  // last press can be given back.
  it.skip.each(["p0", "p4", "p11"])(
    "lets %s walk back up to the width it was loaded at",
    (id) => {
      const startMm = Number(
        stepperAt(SEEDED_KITCHEN, id).valueLabel.replace(" mm", ""),
      );
      let kitchen = shrink(id, 3);
      for (let step = 0; step < 3; step += 1) {
        const wider = stepperAt(kitchen, id).steps[1];
        const next = wider.isDisabled
          ? undefined
          : press(kitchen, id, wider.widthMm);
        if (!next) break;
        kitchen = next;
      }
      expect([id, stepperAt(kitchen, id).valueLabel]).toEqual([
        id,
        `${String(startMm)} mm`,
      ]);
    },
  );
});
