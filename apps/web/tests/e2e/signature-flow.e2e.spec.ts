import { expect } from "@playwright/test";

import {
  describeOpenings,
  dismissPanel,
  openFridgeColumnView,
  pressPanelControl,
  readSelection,
  requireInFridgeColumn,
  waitForFirstSave,
  scanFridgeColumn,
  type SelectionReadout,
} from "./support/panel";
import { test } from "./support/seeded-design";

/**
 * M3's own gate (`docs/milestones/M3-mutations.md`, "Surfaces"): `DEVELOPMENT-SPEC.md` §10's
 * signature flow, end to end **by real touch at 390 × 844** — now through §9's real panel, which
 * is what M4 built and what replaced the temporary dev controls this file used to drive. §11 row 1
 * is the last step, proven through real mutations rather than through a fixture.
 *
 * On §10's wording and what the engine does. §10 says the two deleted openings "merge into one
 * 700 × 2600 opening, subdivided into three level slots". The engine returns **three void
 * records** for that column, not one — and they agree: each record reports `spanH` 2600, so the
 * merged 2600 opening is the span, and the records are its level subdivisions. Their heights are
 * 860 / 700 / 400 rather than a third of 2600 each because §11 row 17's backsplash zone
 * (860–1500) is never an opening. The prose is loose, not wrong; nothing here bends to it.
 *
 * Every assertion below reads `describeSelection`'s own `meta`, published by `SelectionDebug`, so
 * the numbers asserted are the numbers §9's panel is given. They are deliberately **not** read off
 * the panel's own copy: §9's header line carries the body's carcass width × height, not the
 * opening and not the span, so re-pointing these at visible text would quietly turn each of them
 * into a different and weaker claim.
 */

/** The flow is ~200 real taps against a live WebGL scene; the default per-test timeout is not in
 *  the right order of magnitude for it. */
const FLOW_TIMEOUT_MS = 900_000;

function isVoid(readout: SelectionReadout): boolean {
  return readout.metaKind === "void";
}

test("§10's signature flow runs end to end by touch at 390 x 844", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(FLOW_TIMEOUT_MS);

  await openFridgeColumnView(page, seededDesign);
  expect((await readSelection(page)).probe).toBe("on");

  // 1. Select the fridge, delete it. The vacated opening becomes the selection (§5.1).
  const fridge = await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionId === "p7",
    description: "the seeded fridge, p7",
  });
  expect(fridge.metaKind).toBe("fridge_freestanding");
  expect(fridge.openHMm).toBe("1850");
  await pressPanelControl(page, "panel-remove");
  const afterFridge = await readSelection(page);
  expect(isVoid(afterFridge)).toBe(true);
  expect(afterFridge.spanHMm).toBe("1850");

  // The write path ran from a real touch: the first mutation writes rather than mints (wave 7E4
  // G4), so the stronger claim is that a save landed and moved the revision —
  // `waitForFirstSave` itself throws otherwise, so there is nothing left here to check.
  await waitForFirstSave(page, seededDesign);

  // 2. Delete the unit above it — the two openings merge.
  const above = await requireInFridgeColumn(page, {
    matches: (readout) => readout.selectionId === "p24",
    description: "the unit above the fridge, p24",
  });
  expect(above.openHMm).toBe("750");
  await pressPanelControl(page, "panel-remove");

  // One 700 x 2600 opening, subdivided into three level slots — see the note at the top of the
  // file for why that is three records with one span rather than one record.
  const merged = await scanFridgeColumn(page);
  expect(describeOpenings(merged)).toEqual([
    { id: "B|2.45:v2:2.20", w: "700", h: "400", span: "2600" },
    { id: "B|2.45:v1:1.50", w: "700", h: "700", span: "2600" },
    { id: "B|2.45:v0:0.00", w: "700", h: "860", span: "2600" },
  ]);

  // 3. Base slot: full-height bodies are offered beside the base ones, and the hood is not.
  //    §9's own list, in the real panel — `offersFor` reaches the customer through these rows.
  await requireInFridgeColumn(page, {
    matches: (readout) => readout.openHMm === "860",
    description: "the 860 mm base slot",
  });
  await expect(page.getByTestId("offer-base-cabinet")).toHaveCount(1);
  await expect(page.getByTestId("offer-fridge-free")).toHaveCount(1);
  await pressPanelControl(page, "offer-base-cabinet");
  const base = await readSelection(page);
  expect(base.metaKind).toBe("base_cabinet");
  expect(base.openHMm).toBe("860");

  // 4. Middle slot, snapped to 1500 — the void id carries its column and its `y0`, which is the
  //    only place a slot's floor line is observable from outside the canvas.
  const middle = await requireInFridgeColumn(page, {
    matches: (readout) => isVoid(readout) && readout.openHMm === "700",
    description: "the 700 mm middle slot",
  });
  expect(middle.selectionId).toContain(":1.50");
  await pressPanelControl(page, "offer-wall-cabinet");
  expect((await readSelection(page)).metaKind).toBe("wall_cabinet");

  // 5. Top slot: 400 mm bodies only. §11 row 6's offer half — the hood is fixed at 710 mm and is
  //    never offered here, while it *is* offered for the 700 mm slot filled in step 4.
  const top = await requireInFridgeColumn(page, {
    matches: (readout) => isVoid(readout) && readout.openHMm === "400",
    description: "the 400 mm top slot",
  });
  expect(top.selectionId).toContain(":2.20");
  await expect(page.getByTestId("offer-hood")).toHaveCount(0);
  await pressPanelControl(page, "offer-wall-cabinet");

  const filled = await scanFridgeColumn(page);
  expect(filled.filter(isVoid)).toEqual([]);
  expect(filled.map((readout) => readout.openHMm)).toEqual([
    "400",
    "700",
    "860",
  ]);

  // 6. Clear all three, then insert the freestanding fridge.
  for (const body of filled) {
    await requireInFridgeColumn(page, {
      matches: (readout) => readout.selectionId === body.selectionId,
      description: `the inserted body ${body.selectionId}`,
    });
    await pressPanelControl(page, "panel-remove");
  }
  const recleared = await scanFridgeColumn(page);
  expect(describeOpenings(recleared)).toEqual([
    { id: "B|2.45:v2:2.20", w: "700", h: "400", span: "2600" },
    { id: "B|2.45:v1:1.50", w: "700", h: "700", span: "2600" },
    { id: "B|2.45:v0:0.00", w: "700", h: "860", span: "2600" },
  ]);

  await requireInFridgeColumn(page, {
    matches: (readout) => isVoid(readout) && readout.openHMm === "860",
    description: "the cleared 860 mm base slot",
  });
  await pressPanelControl(page, "offer-fridge-free");
  const inserted = await readSelection(page);
  expect(inserted.openHMm).toBe("1850");

  // M4's "never offer the impossible": a refusal reaching the customer is a defect in a list, not
  // expected behaviour. Nothing in this whole flow was tapped in §9's panel and then refused.
  expect(inserted.rejection).toBe("");
  await expect(page.getByTestId("panel-rejection")).toHaveCount(0);

  // §11 row 1: exactly one 750 mm slot above the fridge, never two stubs. The scan crosses the
  // column every 20 px, so a pair of ~375 mm stubs would show up as two distinct ids.
  const final = await scanFridgeColumn(page);
  expect(describeOpenings(final.filter(isVoid))).toEqual([
    { id: "B|2.45:v0:1.85", w: "700", h: "750", span: "750" },
  ]);
  expect(final.filter((readout) => !isVoid(readout))).toHaveLength(1);

  // §10's viewing model closes the flow: the sheet is dismissed and the scene is on its own again,
  // showing the state every step above put into it.
  await dismissPanel(page);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
});
