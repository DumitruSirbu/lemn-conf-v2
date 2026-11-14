// M12 W1 adversarial QA (ADR 0182): the panel's handle section on each corner body, swept over the kitchen's handle and
// the top row's, so the follow chip is held to name the handle the body is actually drawn with (the slot's on the top
// row, the kitchen's below it) rather than to the one case the DOM test presses. A handle stored on the bar-less return
// leg by hand must not bring the section back.
import {
  CORNER_WALL_UNIT_TEMPLATES,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describePanel,
  type HandleSection,
  type PanelSection,
} from "@/panel/panel-model";

import { PAL_KITCHEN } from "../support/panel-material";
import { ro } from "../support/romanian-content";

const TOP_ROW_FLOOR_MM = 2_200;
const BAR_LESS_RETURN_ID = "p26";
const KITCHEN_SETTINGS: readonly {
  readonly handle?: Handle;
  readonly topRowHandle?: Handle;
}[] = [
  {},
  { handle: "black" },
  { handle: "push" },
  { handle: "black", topRowHandle: "steel" },
  { handle: "steel", topRowHandle: "black" },
];

const DESIGN_WITH_THE_CORNER_WALL_UNIT: Design = {
  ...KITCHEN_L_DESIGN,
  placements: [...KITCHEN_L_DESIGN.placements, ...CORNER_WALL_UNIT_TEMPLATES],
};

function sectionsOf(
  design: Design,
  placementId: string,
  kitchenSettings: (typeof KITCHEN_SETTINGS)[number],
): readonly PanelSection[] {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(records, {}, design.room);
  const world = {
    design,
    records,
    columns,
    voids: recomputeVoids(records, columns),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
  const meta = describeSelection({
    ...world,
    kitchenSettings,
    target: { kind: "placement", id: placementId },
  });
  const panel = describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta,
    offers: [],
    rejection: null,
    widthOptions: [],
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") throw new Error(`${placementId} did not open`);
  return panel.sections;
}

function handleSectionOf(
  sections: readonly PanelSection[],
): HandleSection | undefined {
  return sections.find(
    (section): section is HandleSection => section.kind === "handle",
  );
}

const BAR_CARRYING_CORNERS = DESIGN_WITH_THE_CORNER_WALL_UNIT.placements
  .filter((placement) => placement.body.buildId.includes("corner"))
  .filter((placement) => placement.id !== BAR_LESS_RETURN_ID);

describe("the handle section of a corner body that carries a bar", () => {
  it("is drawn on the five bodies, and they are the five the sweep below runs over", () => {
    expect(
      BAR_CARRYING_CORNERS.map((placement) => placement.body.buildId).sort(),
    ).toEqual([
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
      "wall-corner-x-900",
      "wall-corner-x-900-top",
    ]);
  });

  it("follows the kitchen on every corner: the follow chip is pressed and names the handle the body is drawn with", () => {
    const wrong: string[] = [];

    for (const placement of BAR_CARRYING_CORNERS) {
      for (const settings of KITCHEN_SETTINGS) {
        const section = handleSectionOf(
          sectionsOf(DESIGN_WITH_THE_CORNER_WALL_UNIT, placement.id, settings),
        );
        const drawnWith =
          placement.y0Mm >= TOP_ROW_FLOOR_MM
            ? (settings.topRowHandle ?? "push")
            : (settings.handle ?? "steel");
        const isRight =
          section !== undefined &&
          section.follow.isActive &&
          section.follow.detail === ro.panel.handleLabels[drawnWith] &&
          section.chips.length === 3 &&
          section.chips.every((chip) => !chip.isActive);
        if (!isRight) {
          wrong.push(
            `${placement.id} ${placement.body.buildId} ${JSON.stringify(settings)} wants ${drawnWith}`,
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("marks the corner's own handle, not the kitchen's, and no longer follows", () => {
    for (const placement of BAR_CARRYING_CORNERS) {
      const design: Design = {
        ...DESIGN_WITH_THE_CORNER_WALL_UNIT,
        placements: DESIGN_WITH_THE_CORNER_WALL_UNIT.placements.map(
          (candidate) =>
            candidate.id === placement.id
              ? { ...candidate, body: { ...candidate.body, handle: "black" } }
              : candidate,
        ),
      };
      const section = handleSectionOf(
        sectionsOf(design, placement.id, { handle: "push" }),
      );

      expect(section?.follow.isActive, placement.id).toBe(false);
      expect(
        section?.chips
          .filter((chip) => chip.isActive)
          .map((chip) => chip.value),
        placement.id,
      ).toEqual(["black"]);
    }
  });
});

describe("the bar-less return leg", () => {
  it.each(KITCHEN_SETTINGS)(
    "offers no handle section, though a handle is stored on it by hand (kitchen %j)",
    (settings) => {
      const design: Design = {
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.map((placement) =>
          placement.id === BAR_LESS_RETURN_ID
            ? { ...placement, body: { ...placement.body, handle: "black" } }
            : placement,
        ),
      };

      expect(
        sectionsOf(design, BAR_LESS_RETURN_ID, settings).map(
          (section) => section.kind,
        ),
      ).toEqual(["structural", "finish"]);
    },
  );
});
