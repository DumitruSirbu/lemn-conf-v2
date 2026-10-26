// M7B U5 S2, item 2: the width-step note follows `crossesOnScreen`, and so follows it onto wall C.
//
// `panel-model.ts` already picks the reflected `widthStepNoteRight` whenever `crossesOnScreen(wall,
// direction)` is true, so wall C needed no branch of its own — its rule moved in `content.ts`. This
// file holds the consequence: a stepper on a wall-C body of a U reads the plain note, where a stepper on
// a wall-B body of the same U (whose camera wall C's is the reflection of) reads the reflected one.
// Nothing here names a shape: the U is the domain's own shell, and the two notes are told apart by the
// wall the selection stands on.
import {
  buildKitchenLBodyCatalog,
  buildableWidthSpanMm,
  cabinetDepthMmOf,
  columnWidthChoices,
  deriveRecordedColumns,
  derivePlacementRecords,
  describeSelection,
  generateKitchen,
  offersFor,
  recomputeVoids,
  toMetres,
  widthOptionsFor,
  widthStepsFor,
  type CommandTarget,
  type Design,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type WidthStepperSection } from "@/panel/panel-model";

import {
  createFakeBodyProbe,
  createFakeProbeFactory,
} from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";
import { ro } from "../support/romanian-content";

const PROBE = createFakeBodyProbe();
const CABINET_DEPTH_MM = 600;

/** The domain's own generated U, so every wall carries the bodies a customer would step. */
function generatedU(): Design {
  const result = generateKitchen({
    room: {
      shape: "U",
      widthMm: 4500,
      depthMm: 3000,
      wallCMm: 3600,
      heightMm: 2600,
    },
    occurredAt: "2026-09-30T12:00:00.000Z",
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) throw new Error("the U did not compose");
  return result.design;
}

const DESIGN: Design = generatedU();
const CATALOG = buildKitchenLBodyCatalog(CABINET_DEPTH_MM);
const RECORDS = derivePlacementRecords(DESIGN, CATALOG);
const COLUMNS = deriveRecordedColumns(
  RECORDS,
  DESIGN,
  toMetres(DESIGN.room.widthMm),
);
const WORLD = {
  design: DESIGN,
  records: RECORDS,
  columns: COLUMNS,
  voids: recomputeVoids(RECORDS, COLUMNS),
  catalog: CATALOG,
};

function stepperOf(id: string): WidthStepperSection | undefined {
  const target: CommandTarget = { kind: "placement", id };
  const engineInput = {
    design: WORLD.design,
    catalog: WORLD.catalog,
    columns: WORLD.columns,
    target,
    probe: PROBE,
  };
  const panel = describePanel({
    content: ro,
    direction: "left",
    material: PAL_KITCHEN,
    meta: describeSelection({ kitchenSettings: {}, ...WORLD, target }),
    offers: offersFor({
      ...WORLD,
      target,
      cabinetDepthMm: cabinetDepthMmOf(WORLD.design),
    }),
    buildableWidthSpanMm: buildableWidthSpanMm(WORLD.catalog),
    rejection: null,
    widthOptions: widthOptionsFor(engineInput),
    widthSteps: widthStepsFor(engineInput),
    widthRanges:
      columnWidthChoices({
        design: WORLD.design,
        catalog: WORLD.catalog,
        target,
      })?.widthRangesMm ?? [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") return undefined;
  const section = panel.sections.find(
    (candidate) => candidate.kind === "width",
  );
  return section?.kind === "width" && section.control === "stepper"
    ? section
    : undefined;
}

function steppersOn(wall: DesignWall): readonly WidthStepperSection[] {
  return RECORDS.filter((record) => record.wall === wall).flatMap((record) => {
    const stepper = stepperOf(record.id);
    return stepper === undefined ? [] : [stepper];
  });
}

describe("the width-step note on a U's walls (item 2)", () => {
  it("has a stepper on wall B and on wall C to read, so the two claims below are not vacuous", () => {
    expect(steppersOn("B").length).toBeGreaterThan(0);
    expect(steppersOn("C").length).toBeGreaterThan(0);
  });

  it("reads the plain note on every wall-C stepper: wall C never crosses in a U", () => {
    for (const stepper of steppersOn("C")) {
      expect(stepper.note).toBe(ro.panel.widthStepNote);
    }
  });

  it("reads the reflected note on every wall-B stepper of the same U, the opposite of wall C", () => {
    for (const stepper of steppersOn("B")) {
      expect(stepper.note).toBe(ro.panel.widthStepNoteRight);
    }
  });
});
