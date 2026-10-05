// M7B U5 S2 (5) — the e2e the implementer could not run, written by adversarial QA (ADR 0132 A2, A8.2,
// A8.3). Registered by the mobile and the desktop spec alike, so the two viewports are one contract.
//
// The U is seeded through the write path (`support/u-design.ts`): none reached the editor through Step 1
// before U6, and seeding stays the way to a *particular* U (`u-flow.ts` walks Step 1 for one). Every tap point is projected from the published camera onto a body the domain says stands on
// the wall under test, and every tap on a side preset first proves its sight line really crosses the
// run the cutaway removes — without that, a green tap would prove nothing about the cutaway.
import type {
  PlacementRecord,
  VoidRecord,
} from "@lemnaria/configurator-domain";
import { expect, test as base, type Page } from "@playwright/test";

import { crossesOnScreen } from "../../../src/i18n/content";
import { ro } from "../../support/romanian-content.e2e";
import { deleteMintedDesigns } from "./minted-designs";
import {
  byPlacementId,
  centreOf,
  projectToCanvasX,
  readScene,
  standAt,
  waitForSettleAfter,
  type SceneBodyBounds,
} from "./mirror-flow";
import { capturePatch, countChangedPixels, type PixelRect } from "./pixels";
import { openSeededDesign, type SeededDesign } from "./seeded-design";
import {
  chooseCabinetDepth,
  closePanel,
  eyeOf,
  frontPointOf,
  pagePointOf,
  segmentCrossesBody,
  selectedId,
  tapScene,
  TOP_ROW_BOTTOM_M,
  TOP_ROW_MIDDLE_M,
  type ScenePoint,
  type Vec3,
} from "./u-cutaway-scene";
import {
  composeU,
  idsOnWall,
  recordsByPlacementId,
  seedDesign,
  U_3000,
  voidsOf,
} from "./u-design";

const PRESET = ro.configure.cameraPresets;
const SEEDED_DEPTH_MM = 600;

/** A per-pixel RGB distance under which two captures of one camera at one frame are the same pixel,
 *  and the share of a patch allowed over it (antialiasing and the shadow sampler's dither). **Chosen,
 *  not measured**: a cut wall-C body leaves the floor and the far wall behind it, which differs from
 *  a white front by far more than either figure, so the check does not rest on their exact values. */
const PIXEL_NOISE_FLOOR = 24;
const MAX_CHANGED_SHARE = 0.02;
const PATCH_HALF_PX = 12;

/** Half a metre either side of a wall's middle is well over this on screen at either viewport; less
 *  would mean the pair sat on the view axis and the sign below read noise. */
const MIN_ALONG_TRAVEL_PX = 20;
/** How far off its wall's plane the along pair stands, and at what height: in front of the fronts. */
const ALONG_OFFSET_M = 0.3;
const ALONG_HEIGHT_M = 1.2;
const HALF_METRE = 0.5;

const U_DESIGN = composeU(U_3000);
const RECORDS = recordsByPlacementId(U_DESIGN, SEEDED_DEPTH_MM);
const VOIDS = voidsOf(U_DESIGN, SEEDED_DEPTH_MM);
// Wave C3 (`02b1c7b`, ADR 0110 O9) generates a 400 mm top-row body over every wall cabinet, so wall
// B's top row of this U holds bodies and no opening: the one void left on B is the fridge column's,
// which starts at 1.85 m. These tests are about that row staying tappable through the cutaway, so
// they aim at the bodies that now fill it (backlog 114).
const TOP_ROW_BODIES_ON_B = [...RECORDS.values()].filter(
  (record) =>
    record.wall === "B" && Math.abs(record.frame.y0 - TOP_ROW_BOTTOM_M) < 1e-6,
);
const TOP_ROW_BODY_IDS_ON_B = TOP_ROW_BODIES_ON_B.map((record) => record.id);

const test = base.extend<{ seededU: SeededDesign }>({
  seededU: async ({ page }, use) => {
    const seeded = await seedDesign(page, U_DESIGN);
    try {
      await use(seeded);
    } finally {
      await deleteMintedDesigns([seeded.id]);
    }
  },
});

export function describeUCutaway(): void {
  test.describe("U5 S2 (5): the cutaway in the scene, 3000/3000/3000", () => {
    test.setTimeout(120_000);

    test.beforeEach(async ({ page, seededU }) => {
      await openSeededDesign(page, seededU, { locale: "ro" });
      await waitForSettleAfter(page, 0);
    });

    test("on Perete B, a tap on wall B's top row selects it", async ({
      page,
    }) => {
      await standAt(page, PRESET.wallB);

      const target = await topRowTargetOnB(page);

      await tapScene(page, target.point);
      await expectSelectedPlacement(page, target.id);
    });

    // "Orbiting back" is the overview chip's ease here, which drives the same controls `change` event
    // and per-frame follow a drag does; a free drag is not replayed, since the scene publishes no
    // camera after one and no tap point could be projected.
    test("after going back to the overview, wall C draws and picks again", async ({
      page,
    }) => {
      const cBody = await wallCBaseInView(page);
      const drawnBefore = await capturePatch(page, patchAround(cBody.point));

      await standAt(page, PRESET.wallB);
      const pickedWhileCut = await idsPickedAt(
        page,
        await wallCPointsFromHere(page),
      );
      await standAt(page, PRESET.overview);
      const drawnAfter = await capturePatch(page, patchAround(cBody.point));
      await tapScene(page, cBody.point);

      const pickedOnC = pickedWhileCut.filter((id) =>
        idsOnWall(RECORDS, "C").includes(id),
      );
      expect(pickedOnC, "a wall-C body was picked while C is cut").toEqual([]);
      expect(
        await countChangedPixels(
          page,
          drawnBefore,
          drawnAfter,
          PIXEL_NOISE_FLOOR,
        ),
      ).toBeLessThanOrEqual(maxChangedPixels(drawnBefore.clip));
      expect(await selectedId(page)).toBe(cBody.id);
    });

    test("on Perete B, after deleting a wall-B body, a tap on B's top row selects it", async ({
      page,
    }) => {
      await standAt(page, PRESET.wallB);
      const doomed = await wallBBaseInView(page);
      await tapScene(page, doomed.point);
      expect(await selectedId(page)).toBe(doomed.id);
      await page.getByTestId("panel-remove").click();
      await expect(page.getByTestId("selection-debug")).not.toHaveAttribute(
        "data-selection-id",
        doomed.id,
      );
      // The delete saved: a U document round-trips the write path like any other.
      await expect(page.getByTestId("selection-debug")).toHaveAttribute(
        "data-save-status",
        "idle",
      );
      await closePanel(page);

      const target = await topRowTargetOnB(page);
      await tapScene(page, target.point);

      await expectSelectedPlacement(page, target.id);
    });

    test("a wall-C body selected from the overview is deselected by Perete B, and the panel closes", async ({
      page,
    }) => {
      const cBody = await wallCBaseInView(page);
      await tapScene(page, cBody.point);
      expect(await selectedId(page)).toBe(cBody.id);
      await expect(page.getByTestId("editor-panel")).toBeVisible();

      await standAt(page, PRESET.wallB);

      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
      expect(await selectedId(page)).toBe("");
    });

    test("a wall-C opening selected from the overview is deselected by Perete B, and the panel closes", async ({
      page,
    }) => {
      // A delete selects the opening it frees, so the selection is now a wall-C void.
      const cBody = await wallCBaseInView(page);
      await tapScene(page, cBody.point);
      await page.getByTestId("panel-remove").click();
      await expect(page.getByTestId("selection-debug")).toHaveAttribute(
        "data-selection-kind",
        "void",
      );
      expect(await selectedId(page)).toMatch(/^C\|/);

      await standAt(page, PRESET.wallB);

      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
      expect(await selectedId(page)).toBe("");
    });

    test("a wall-C body selected from the overview stays selected on Perete C, which does not cut C", async ({
      page,
    }) => {
      const cBody = await wallCBaseInView(page);
      await tapScene(page, cBody.point);
      expect(await selectedId(page)).toBe(cBody.id);

      await standAt(page, PRESET.wallC);

      await expect(page.getByTestId("editor-panel")).toBeVisible();
      expect(await selectedId(page)).toBe(cBody.id);
    });

    for (const wall of ["A", "B", "C"] as const) {
      test(`on Perete ${wall}, +along reads the screen side crossesOnScreen names (criterion 5)`, async ({
        page,
      }) => {
        await standAt(page, PRESET[`wall${wall}`]);
        const scene = await readScene(page);
        const [base, along] = alongPointsAtMiddleOf(wall);

        const movedByPx =
          projectToCanvasX(along, scene.camera, scene.canvasWidthPx) -
          projectToCanvasX(base, scene.camera, scene.canvasWidthPx);

        expect(Math.abs(movedByPx)).toBeGreaterThan(MIN_ALONG_TRAVEL_PX);
        expect(movedByPx < 0).toBe(crossesOnScreen(wall, "left"));
      });
    }

    test("on Perete B, after switching the cabinet depth, a tap on B's top row selects it", async ({
      page,
    }) => {
      await standAt(page, PRESET.wallB);
      const target = await topRowTargetOnB(page);
      const eyeBefore = await eyeOf(page);

      await chooseCabinetDepth(page, "700");
      await tapScene(page, target.point);

      // A depth change widens the corner, so every column of wall B moves along it (B|1.20 becomes
      // B|1.30 at 700): the tap is held to wall B's top row, not to the body it was aimed at at 600.
      expect(await eyeOf(page)).toEqual(eyeBefore);
      await expectTopRowOfWallBSelected(page);
    });
  });
}

interface TapTarget {
  readonly id: string;
  readonly point: ScenePoint;
}

interface TopRowTarget {
  readonly id: string;
  readonly point: ScenePoint;
}

/**
 * Wall B's top row (§11 row 21, 2.20–2.60 m) near **the wall's middle**, where ADR 0132 A4 says the
 * preset must keep it clickable. A generated U fills that row with top-row bodies (wave C3), so the
 * target is the body of wall B's top row nearest the middle that projects inside the canvas.
 *
 * Proven non-vacuous first: the sight line from the eye to the aim crosses at least one wall-C body or
 * void. On `Perete B` the eye stands behind wall C's plane, so without the cutaway one of them takes
 * the tap — wall C's own top row stands exactly in the way.
 */
async function topRowTargetOnB(page: Page): Promise<TopRowTarget> {
  const eye = await eyeOf(page);
  const bodies = byPlacementId((await readScene(page)).bodies);
  const middleM = U_3000.depthMm / 2000;
  const byDistanceFromMiddle = TOP_ROW_BODY_IDS_ON_B.flatMap(
    (id) => bodies.get(id) ?? [],
  ).sort(
    (left, right) =>
      Math.abs(centreOf(left)[2] - middleM) -
      Math.abs(centreOf(right)[2] - middleM),
  );
  for (const body of byDistanceFromMiddle) {
    const aim = frontPointOf(body, "B", TOP_ROW_MIDDLE_M);
    const point = await pagePointOf(page, aim);
    if (point === undefined) continue;
    expect(
      crossesWallC(eye, aim, bodies),
      `the sight line to ${body.placementId} crosses nothing on wall C, so this tap proves nothing`,
    ).toBe(true);
    return { id: body.placementId, point };
  }
  throw new Error("no top-row body of wall B projects inside the canvas");
}

async function expectSelectedPlacement(page: Page, id: string): Promise<void> {
  const readout = page.getByTestId("selection-debug");
  await expect(readout).toHaveAttribute("data-selection-kind", "placement");
  expect(await selectedId(page)).toBe(id);
}

async function expectTopRowOfWallBSelected(page: Page): Promise<void> {
  const readout = page.getByTestId("selection-debug");
  await expect(readout).toHaveAttribute("data-selection-kind", "placement");
  expect(TOP_ROW_BODY_IDS_ON_B).toContain(await selectedId(page));
}

/** A wall-C base body whose front projects inside the canvas at the current camera. */
async function wallCBaseInView(page: Page): Promise<TapTarget> {
  return baseInView(page, "C");
}

async function wallBBaseInView(page: Page): Promise<TapTarget> {
  return baseInView(page, "B");
}

async function baseInView(page: Page, wall: "B" | "C"): Promise<TapTarget> {
  const bodies = byPlacementId((await readScene(page)).bodies);
  for (const id of idsInBand(wall, "base")) {
    const record = RECORDS.get(id);
    const body = bodies.get(id);
    if (!record?.canDelete || !body) continue;
    const aim = frontPointOf(body, wall, midHeightOf(body));
    const point = await pagePointOf(page, aim);
    if (point !== undefined) return { id, point };
  }
  throw new Error(
    `no deletable wall-${wall} base body projects inside the canvas`,
  );
}

/** Where each wall-C body projects from the current camera, for a tap that must not pick one. */
async function wallCPointsFromHere(page: Page): Promise<ScenePoint[]> {
  const bodies = byPlacementId((await readScene(page)).bodies);
  const points: ScenePoint[] = [];
  for (const id of idsOnWall(RECORDS, "C")) {
    const body = bodies.get(id);
    if (!body) continue;
    const point = await pagePointOf(
      page,
      frontPointOf(body, "C", midHeightOf(body)),
    );
    if (point !== undefined) points.push(point);
  }
  expect(
    points.length,
    "no wall-C body projects inside the canvas",
  ).toBeGreaterThan(0);
  return points;
}

/** Taps each point in turn, closing the panel between taps, and returns what each one selected. */
async function idsPickedAt(
  page: Page,
  points: readonly ScenePoint[],
): Promise<string[]> {
  const picked: string[] = [];
  for (const point of points) {
    await tapScene(page, point);
    picked.push(await selectedId(page));
    await closePanel(page);
  }
  return picked;
}

/** Two points a metre apart along `wall`'s +along axis, centred on its middle: wall A's +along is
 *  +x, and B's and C's are +z (ADR 0132 decision 1), C standing beside x = W. */
function alongPointsAtMiddleOf(wall: "A" | "B" | "C"): readonly [Vec3, Vec3] {
  const widthM = U_3000.widthMm / 1000;
  const depthM = U_3000.depthMm / 1000;
  if (wall === "A") {
    const middle = widthM / 2;
    return [
      [middle - HALF_METRE, ALONG_HEIGHT_M, ALONG_OFFSET_M],
      [middle + HALF_METRE, ALONG_HEIGHT_M, ALONG_OFFSET_M],
    ];
  }
  const x = wall === "B" ? ALONG_OFFSET_M : widthM - ALONG_OFFSET_M;
  const middle = depthM / 2;
  return [
    [x, ALONG_HEIGHT_M, middle - HALF_METRE],
    [x, ALONG_HEIGHT_M, middle + HALF_METRE],
  ];
}

function idsInBand(wall: "B" | "C", band: PlacementRecord["band"]): string[] {
  return [...RECORDS.values()]
    .filter((record) => record.wall === wall && record.band === band)
    .map((record) => record.id);
}

function crossesWallC(
  eye: Vec3,
  aim: Vec3,
  bodies: ReadonlyMap<string, SceneBodyBounds>,
): boolean {
  const boxesOnC = [
    ...idsOnWall(RECORDS, "C").flatMap((id) => bodies.get(id) ?? []),
    ...VOIDS.filter((opening) => opening.wall === "C").map(boxOfVoid),
  ];
  return boxesOnC.some((box) => segmentCrossesBody(eye, aim, box));
}

/** A void's world box. Side-wall voids are turned a quarter, so their width runs along z. */
function boxOfVoid(opening: VoidRecord): SceneBodyBounds {
  const isSideWall = opening.wall !== "A";
  const halfX = (isSideWall ? opening.d : opening.w) / 2;
  const halfZ = (isSideWall ? opening.w : opening.d) / 2;
  return {
    placementId: opening.id,
    min: [opening.x - halfX, opening.y0, opening.z - halfZ],
    max: [opening.x + halfX, opening.y0 + opening.h, opening.z + halfZ],
  };
}

function midHeightOf(body: SceneBodyBounds): number {
  return (body.min[1] + body.max[1]) / 2;
}

function patchAround(point: ScenePoint): PixelRect {
  return {
    x: Math.round(point.x - PATCH_HALF_PX),
    y: Math.round(point.y - PATCH_HALF_PX),
    width: PATCH_HALF_PX * 2,
    height: PATCH_HALF_PX * 2,
  };
}

function maxChangedPixels(clip: PixelRect): number {
  return Math.floor(clip.width * clip.height * MAX_CHANGED_SHARE);
}
