// Adversarial QA over ADR 0027, at the layer the customer actually chooses from.
//
// `base-hob-2drawer` and `base-hob-oven` are the same body to the domain: identical band, kind,
// width set, height and depth, differing only in their label. Everything that keeps the customer
// from picking the wrong one lives in this package — the Romanian label and the front-elevation
// drawing — and both are lookups by `buildId` that a copy-paste would silently collapse. §13.4 is
// explicit that a thumbnail that resolves to nothing, or to the wrong drawing, has **no visible
// symptom at all**: it is a CSS `background-image`, so there is no broken-image glyph and no failed
// request to notice.
import {
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  INSERTABLE_BODY_DEFINITIONS,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { listCabinetDrawingFilenames } from "@/panel/cabinet-thumbnails";
import { describePanel, type ReplaceSection } from "@/panel/panel-model";

import { noWidthIsFree } from "../support/width-options";

const HOB_BUILD_IDS = ["base-hob-2drawer", "base-hob-oven"] as const;

/** The seeded hob-bearing cabinet, and the column it stands in. */
const HOB_PLACEMENT_ID = "p2";
const HOB_COLUMN = "A|2.60";

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

/** ADR 0011 Gap D: frozen at load, exactly as the store freezes them. */
const SEEDED_COLUMNS = deriveColumns(
  derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
);

function worldFrom(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    records,
    columns: SEEDED_COLUMNS,
    voids: recomputeVoids(records, SEEDED_COLUMNS),
    catalog: KITCHEN_L_BODY_CATALOG,
  };
}

function replaceSectionAt(
  world: ReturnType<typeof worldFrom>,
  target: CommandTarget,
): ReplaceSection {
  const meta = describeSelection({ ...world, target });
  const panel = describePanel({
    meta,
    offers: offersFor({ ...world, target }),
    rejection: null,
    widthOptions: meta ? noWidthIsFree(meta.widthMm, meta.sizesMm) : [],
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") throw new Error("the panel did not open");
  const section = panel.sections.find(
    (candidate): candidate is ReplaceSection => candidate.kind === "replace",
  );
  if (!section) throw new Error("the panel rendered no replace section");
  return section;
}

/** The design with the hob-bearing cabinet deleted — the state ADR 0027 exists to make recoverable. */
function clearedHobColumn() {
  const result = removePlacement({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: HOB_PLACEMENT_ID },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
  const world = worldFrom(result.design);
  const opening = world.voids.find(
    (record) => record.col === HOB_COLUMN && Math.abs(record.y0) < 0.01,
  );
  if (!opening) throw new Error("the deleted hob cabinet left no opening");
  return { world, opening };
}

/** The design with the hob cabinet standing on a §7 catalogue entry rather than on its seeded one —
 *  the shape a swap leaves behind, written directly so this file needs no probe. */
function withHobCabinetBuiltAs(buildId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === HOB_PLACEMENT_ID
        ? { ...placement, body: { ...placement.body, buildId } }
        : placement,
    ),
  };
}

describe("the two hob rows are distinguishable in the picker", () => {
  it("gives every insertable body a drawing no other body uses", () => {
    const byFilename = new Map<string, string[]>();
    for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
      // ADR 0033: a merged cabinet owns two drawings, one per door count, and each must still be
      // unique to it — `wall-1-door.svg` belongs to `wall-cabinet` alone now that `wall-1door` is
      // gone, and two entries sharing a drawing is still one product that does not exist.
      for (const filename of listCabinetDrawingFilenames(buildId)) {
        byFilename.set(filename, [
          ...(byFilename.get(filename) ?? []),
          buildId,
        ]);
      }
    }
    const shared = [...byFilename.entries()]
      .filter(([, buildIds]) => buildIds.length > 1)
      .map(([filename, buildIds]) => `${filename}: ${buildIds.join(", ")}`);

    expect(byFilename.size).toBeGreaterThan(0);
    expect(shared).toEqual([]);
  });

  // The two facts a customer reads off a row. Neither is derivable from the other, and the domain
  // supplies neither, so both are asserted here on the same rows at the same time.
  it("renders both hob rows with different labels and different drawings", () => {
    const { world, opening } = clearedHobColumn();
    const rows = replaceSectionAt(world, {
      kind: "void",
      id: opening.id,
    }).rows.filter((row) => HOB_BUILD_IDS.some((id) => id === row.buildId));

    expect(rows.map((row) => row.buildId)).toEqual([...HOB_BUILD_IDS]);
    expect(new Set(rows.map((row) => row.label)).size).toBe(2);
    expect(new Set(rows.map((row) => row.thumbnailUrl)).size).toBe(2);
    for (const row of rows) {
      expect([row.buildId, row.thumbnailUrl]).not.toEqual([
        row.buildId,
        undefined,
      ]);
      expect([row.buildId, row.isDisabled]).toEqual([row.buildId, false]);
    }
  });

  it("names them in Romanian, saying which appliance is under the hob", () => {
    const { world, opening } = clearedHobColumn();
    const labels = new Map(
      replaceSectionAt(world, { kind: "void", id: opening.id }).rows.map(
        (row) => [row.buildId, row.label],
      ),
    );

    expect(labels.get("base-hob-2drawer")).toBe("Corp plită și 2 sertare");
    expect(labels.get("base-hob-oven")).toBe("Corp plită și cuptor");
  });
});

describe("the panel over the shipped hob cabinet", () => {
  const world = worldFrom(KITCHEN_L_DESIGN);
  const target = { kind: "placement", id: HOB_PLACEMENT_ID } as const;

  // ADR 0027's stated consequence: §9's ACTUAL badge became reachable for the hob cabinet, and it
  // must land on the drawer variant rather than on the oven one — the two are indistinguishable by
  // measurement, so only `catalogEquivalentId` can decide, and a wrong pointer looks like a correct
  // panel.
  it("badges the drawer variant ACTUAL and nothing else", () => {
    const rows = replaceSectionAt(world, target).rows;

    expect(
      rows.filter((row) => row.isCurrent).map((row) => row.buildId),
    ).toEqual(["base-hob-2drawer"]);
  });

  it("offers the oven variant beside it, un-badged and clickable", () => {
    const oven = replaceSectionAt(world, target).rows.find(
      (row) => row.buildId === "base-hob-oven",
    );

    expect(oven?.isCurrent).toBe(false);
    expect(oven?.isDisabled).toBe(false);
  });

  // The oven variant is open-front — the appliance *is* the front — so it owns no `door_front` and
  // no cabinet handle. §13.1's "disable, don't warn" and §9's "never offer what cannot be
  // satisfied" both say the sections must not render at all, and they only do not because the
  // catalogue row declares `canFinish: false, canHandle: false`. Measured before it did: the five
  // finish chips recoloured nothing, and `handle: "push"` hid the **oven's** own bar.
  //
  // The drawer variant beside it keeps both sections, which is what makes this a statement about
  // the body rather than about hob bases in general.
  it("renders no finish and no handle section over the oven variant, and both over the drawer one", () => {
    const sectionKindsOn = (buildId: string) => {
      const panel = describePanel({
        meta: describeSelection({
          ...worldFrom(withHobCabinetBuiltAs(buildId)),
          target,
        }),
        offers: [],
        rejection: null,
        widthOptions: [],
        isBodyProbeAttached: true,
        canWrite: true,
        saveStatus: "idle",
      });
      if (panel.kind !== "open") throw new Error("the panel did not open");
      return panel.sections.map((section) => section.kind);
    };

    expect(sectionKindsOn("base-hob-oven")).not.toContain("finish");
    expect(sectionKindsOn("base-hob-oven")).not.toContain("handle");
    expect(sectionKindsOn("base-hob-2drawer")).toContain("finish");
    expect(sectionKindsOn("base-hob-2drawer")).toContain("handle");
  });

  // §9's swap sets are band-scoped, and both hob entries are base bodies, so neither may reach a
  // wall or top selection. Checked at the hood directly above the hob — the nearest selection where
  // a band leak would be invisible in the mockup.
  it("never offers a hob base in the wall row above it", () => {
    const rows = replaceSectionAt(world, {
      kind: "placement",
      id: "p13",
    }).rows.map((row) => row.buildId);

    for (const buildId of HOB_BUILD_IDS) {
      expect(rows, buildId).not.toContain(buildId);
    }
  });
});
