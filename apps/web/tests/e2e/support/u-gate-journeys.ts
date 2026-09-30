// The U's gate, run by both lines: `u-gate.e2e.spec.ts` at 390 x 844 by touch (M7B U7 S1) and
// `u-gate.desktop.e2e.spec.ts` at 1440 x 900 by click (S2). One journey registered twice — the
// pattern of `describeUCutaway` (`qa-u5-cutaway.ts`) — so the two viewports are one behavioural
// contract and no assertion is kept in two copies (D4).
//
// The gate is a manifest (D3): `u-flow` and `qa-u5-cutaway` are inherited unchanged and **click**, and
// ADR 0023 is this product's own precedent that a tap and a click can differ — so this journey covers
// what they leave: Step 1 by finger, the four-chip row, wall C edited from `Perete C`, the large U's
// hood-and-no-upper back wall (RQ7), both reloads with the reload flash **gated at zero wrong-chip
// frames** (ADR 0133), and the share view.
//
// **Every gesture goes through `press`** (`u-gate.ts`), so a phone run is taps and a desktop run is
// clicks, never a mixture. What a line adds or omits is a member of `UGateLine`, named, and nothing else
// differs between them.
//
// **Every test types its own U through Step 1** (the design is the subject, so it is never seeded), so
// no test leans on another. Each mints its rows; `step-one-by-touch`'s `designWrites` fixture deletes
// them in teardown, failing tests included, and `afterAll` proves the run left none (AC5).
//
// **Must not run concurrently with any other persistence live run** (ADR 0006).
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import {
  collectHydrationComplaints,
  installFrameSampler,
  readPaintedFrames,
} from "./first-frame";
import { findMintedDesignIds } from "./minted-designs";
import { waitForSettleAfter } from "./mirror-flow";
import { issueShareLink, openSharedDesign } from "./seeded-design";
import {
  cameraChipCount,
  fingerprintOf,
  htmlOf,
  SHARE_VIEW_SESSION_ID,
} from "./ssr-html";
import {
  editorPath,
  isEditorUrl,
  idInEditorUrl,
  continueButton,
  readTheHandOff,
  roomPath,
  roomScreen,
  stepSentence,
  test as stepOneTest,
  watchTheHandOff,
} from "./step-one-by-touch";
import { eyeOf } from "./u-cutaway-scene";
import {
  bodiesInScene,
  buildsSentInHtml,
  buildsStoredIn,
  chooseCabinetDepth,
  chooseU,
  composeUThroughStepOne,
  contextOptionsLikeProject,
  cornerRuleFarEdgeM,
  drawnBodies,
  editAndAwaitSave,
  expectBacksOnWallC,
  expectEditorReady,
  expectInputDevice,
  expectNoWrongChipFrames,
  expectRoomFields,
  expectSameBodies,
  expectSelection,
  expectStepPill,
  findBaseBodyInView,
  firstVoidInView,
  followBackLink,
  footprintOfBodies,
  LARGE_U,
  lookDirectionOf,
  measureCameraChips,
  measureClientTransitionToEditor,
  measureSidewaysOverflow,
  MIDDLE_U,
  NARROWEST_WALKWAY_MM,
  NARROWEST_WALKWAY_U,
  offerRow,
  placementOf,
  pointOfVoidInView,
  PRESET,
  press,
  readWallCRunStart,
  recordIdsOnWall,
  recordsOf,
  replaceWallCBase,
  republishScene,
  retype,
  ROOM_TOO_SMALL_SENTENCE,
  roomQueryOf,
  standAtChip,
  storedDesignOf,
  storedRoomOf,
  tapBody,
  tapVoid,
  TOO_SMALL_U,
  typeRoom,
  voidsOfDesign,
  wallCPlaneM,
  closeSheet,
} from "./u-gate";
import { cameraPresetButtons, U_CAMERA_PRESETS } from "./u-steps";

/** What differs between the phone and the desktop line. Everything else in this file is shared. */
export interface UGateLine {
  readonly title: string;
  readonly device: "touch" | "pointer";
  /** 1C's suggestion group is in the page on both lines; its *Sugestii* card is drawn on the desktop
   *  only (`room.module.css`'s desktop block), so the line says which. */
  readonly expectSuggestionCard: (page: Page) => Promise<void>;
  /** Slows the network so 1F stays on screen long enough to be looked at; returns the undo. The phone
   *  hides 1F's plan aside, so it looks at nothing and slows nothing. */
  readonly holdHandOff: (page: Page) => Promise<() => Promise<void>>;
  /** 1F's static plan aside, looked at while 1F is drawn: the desktop draws it, three walls. */
  readonly expectPlanAside: (page: Page) => Promise<void>;
}

/** A camera chip is at or above this side on both lines (ADR 0104 decision 5's 44 px; the desktop chip
 *  takes the same `--touch-target` floor, so the target is asserted there too and nothing is excluded). */
const TOUCH_TARGET_PX = 44;

/** The panel's own width step: its buttons read −50 mm and +50 mm. Written here as a literal so the
 *  assertion cannot move with the constant it checks. */
const PANEL_WIDTH_STEP_MM = 50;

const CABINET_DEPTH_BEFORE_MM = 600;
const CABINET_DEPTH_AFTER_MM = 700;
const MM_PER_M = 1000;

/** A wall row void sits at the wall row's floor (1.5 m) — `bands.ts`'s wall band. */
const WALL_ROW_FLOOR_M = 1.5;
const HOOD_BUILD_ID = "hood";
const WALL_CABINET_BUILD_ID = "wall-cabinet";

/** Each reload is a full document load of a three.js editor on `next dev`, and a test makes several. */
const TEST_TIMEOUT_MS = 180_000;

/** How many client transitions the A5 measurement takes. */
const TRANSITION_RUNS = 5;

const mintedInThisRun: string[] = [];

/**
 * `step-one-by-touch`'s `test` deletes the rows a page minted through its `designWrites` fixture — but
 * a fixture that no test names is never set up, and one first set up in a hook records only what
 * happens after it. So this **auto** fixture makes every test here record its page's mints from
 * before its first navigation, and copies the ids into the run's ledger just before `designWrites`
 * tears down and deletes them.
 */
const test = stepOneTest.extend<{ recordMintedRows: undefined }>({
  recordMintedRows: [
    async ({ designWrites }, use) => {
      await use(undefined);
      const minted = await designWrites.mintedIds();
      // Every test here composes a U through Step 1, so a test that saw no mint means the recorder is
      // not watching, and an empty ledger would then prove nothing at `afterAll`.
      expect(minted.length, "no mint was observed").toBeGreaterThan(0);
      mintedInThisRun.push(...minted);
    },
    { auto: true },
  ],
});

export function describeUGate(line: UGateLine): void {
  test.describe(line.title, () => {
    test.setTimeout(TEST_TIMEOUT_MS);

    // Runs after every fixture has torn down, so what it finds is what the run left behind.
    test.afterAll(async () => {
      const survivors = await findMintedDesignIds(mintedInThisRun);
      const minted = mintedInThisRun.length;
      console.log(
        `u-gate rows: minted=${String(minted)} deleted=${String(minted - survivors.length)}`,
      );
      expect(survivors, "rows this run minted and did not delete").toEqual([]);
    });

    test("Step 1: the U card, 1B with three fields and no toggle, the room reason at 1C with no digit, and 1D to 1F to the editor with no other pathname", async ({
      page,
      designWrites,
      committedPathnames,
      pageErrors,
    }) => {
      await expectInputDevice(page, line.device);
      await chooseU(page);
      await expectStepPill(page, 1);
      for (const field of ["wallA", "wallB", "wallC", "height"] as const) {
        await expect(page.getByTestId(`room-length-${field}`)).toBeVisible();
      }
      await expect(page.getByTestId("room-corner")).toHaveCount(0);

      // 1C: every field is in range on its own; the room as a whole is too small for the kitchen.
      await typeRoom(page, TOO_SMALL_U);
      await expect(page).toHaveURL(roomQueryOf(TOO_SMALL_U));
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1C",
      );
      await expect(page.getByTestId("room-room-reason")).toHaveText(
        ROOM_TOO_SMALL_SENTENCE,
      );
      for (const field of ["wallA", "wallB", "wallC", "height"] as const) {
        await expect(
          page.getByTestId(`room-length-reason-${field}`),
        ).toHaveCount(0);
      }
      await expect(continueButton(page)).toBeDisabled();
      expect(
        await page.getByTestId("room-one-c-status").innerText(),
      ).not.toMatch(/\d/);
      await expect(page.getByTestId("room-suggestion-group")).toHaveCount(1);
      await line.expectSuggestionCard(page);

      // 1D: wall B and wall C corrected to the narrowest walkway, by the keyboard.
      await retype(page, "wallB", {
        from: TOO_SMALL_U.wallB,
        to: NARROWEST_WALKWAY_MM,
      });
      await retype(page, "wallC", {
        from: TOO_SMALL_U.wallC,
        to: NARROWEST_WALKWAY_MM,
      });
      const corrected = NARROWEST_WALKWAY_U;
      await expect(page).toHaveURL(roomQueryOf(corrected));
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1D",
      );
      await expect(page.getByTestId("room-room-reason")).toHaveCount(0);
      await expect(continueButton(page)).toBeEnabled();
      await expectStepPill(page, 1);
      expect(designWrites.postCount()).toBe(0);

      // 1D -> 1F -> the editor: 1F is drawn while the pill still says 1, and no other pathname commits.
      await watchTheHandOff(page, stepSentence("ro", 1));
      const beforeTheTap = committedPathnames.mark();
      const releaseHandOff = await line.holdHandOff(page);
      await press(page, continueButton(page));
      await expect(page.getByTestId("room-compose")).toBeVisible();
      await line.expectPlanAside(page);
      await releaseHandOff();
      await page.waitForURL((url) => isEditorUrl(url, "ro"));
      const designId = idInEditorUrl(page.url());
      await expectEditorReady(page, designId);

      const handOff = await readTheHandOff(page);
      expect(
        handOff,
        "the hand-off replaced the document: it must be a client-side push",
      ).toBeDefined();
      expect(handOff?.sawComposeAtStepOne).toBe(true);
      expect(handOff?.composePhases).toContain("composed");
      const visited = committedPathnames.since(beforeTheTap);
      expect(
        visited.filter(
          (pathname) =>
            pathname !== roomPath("ro") &&
            pathname !== editorPath("ro", designId),
        ),
      ).toEqual([]);
      expect(visited).toContain(editorPath("ro", designId));
      expect(new URL(page.url()).search).toBe("");
      await expectStepPill(page, 2);

      expect((await storedDesignOf(page, designId)).room).toStrictEqual(
        storedRoomOf(corrected),
      );
      expect(designWrites.postCount()).toBe(1);
      expect(pageErrors).toEqual([]);
    });

    test("the chip row: four chips of at least 44 x 44 px, none clipped, no horizontal overflow, and Perete C stands the eye in front of wall C", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);

      const chips = await measureCameraChips(page);
      expect(chips.map((chip) => chip.name)).toEqual([
        PRESET.overview,
        PRESET.wallA,
        PRESET.wallB,
        PRESET.wallC,
      ]);
      const overflow = await measureSidewaysOverflow(page);
      for (const chip of chips) {
        const label = JSON.stringify(chip);
        expect(chip.widthPx, label).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
        expect(chip.heightPx, label).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
        expect(chip.rightPx, label).toBeLessThanOrEqual(overflow.viewportPx);
        expect(chip.isTopmostAtItsCentre, label).toBe(true);
      }
      expect(overflow.documentPx, JSON.stringify(overflow)).toBeLessThanOrEqual(
        0,
      );
      expect(overflow.chipRowPx, JSON.stringify(overflow)).toBeLessThanOrEqual(
        0,
      );

      // Perete C: the eye looks toward wall C's plane (+x) from in front of it, with the run in frame.
      const design = await storedDesignOf(page, designId);
      await standAtChip(page, PRESET.wallC);
      const [lookX, , lookZ] = await lookDirectionOf(page);
      const [eyeX] = await eyeOf(page);
      expect(lookX).toBeGreaterThan(0);
      expect(Math.abs(lookX)).toBeGreaterThan(Math.abs(lookZ));
      expect(eyeX).toBeLessThan(wallCPlaneM(design));
      const footprint = await footprintOfBodies(
        page,
        recordIdsOnWall(design, "C"),
      );
      // The eye is aimed at the run: the canvas's own centre falls on wall C, and the run's middle sits
      // in the canvas's middle 80 %. (At 390 px the run overfills the frame, so it is not asked to fit.)
      const detail = JSON.stringify(footprint);
      const centreXPx = (footprint.leftPx + footprint.rightPx) / 2;
      const centreYPx = (footprint.topPx + footprint.bottomPx) / 2;
      expect(footprint.leftPx, detail).toBeLessThanOrEqual(
        footprint.canvasWidthPx / 2,
      );
      expect(footprint.rightPx, detail).toBeGreaterThanOrEqual(
        footprint.canvasWidthPx / 2,
      );
      expect(centreXPx / footprint.canvasWidthPx, detail).toBeGreaterThan(0.1);
      expect(centreXPx / footprint.canvasWidthPx, detail).toBeLessThan(0.9);
      expect(centreYPx / footprint.canvasHeightPx, detail).toBeGreaterThan(0.1);
      expect(centreYPx / footprint.canvasHeightPx, detail).toBeLessThan(0.9);
      expect(pageErrors).toEqual([]);
    });

    test("wall C: a press selects a base body from Perete C, and replacing it swaps the build in the same slot", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);

      const { before, after, slot, replacementBuildId } =
        await replaceWallCBase(page, designId);

      const original = before.placements[slot];
      const swapped = after.placements[slot];
      expect(original, "the tapped body is not stored").toBeDefined();
      expect(replacementBuildId).not.toBe(original?.body.buildId);
      expect(after.placements).toHaveLength(before.placements.length);
      expect(swapped?.body.buildId).toBe(replacementBuildId);
      // The same opening: wall, place, row and width. The id is a fresh one (the domain's swap gives the
      // new body `nextPlacementId` and keeps the old one's array slot, `insert-body.ts`).
      expect({
        wall: swapped?.wall,
        alongMm: swapped?.alongMm,
        y0Mm: swapped?.y0Mm,
        widthMm: swapped?.body.widthMm,
      }).toEqual({
        wall: original?.wall,
        alongMm: original?.alongMm,
        y0Mm: original?.y0Mm,
        widthMm: original?.body.widthMm,
      });
      await expectSelection(page, {
        id: swapped?.id ?? "",
        kind: "placement",
      });
      await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });

    test("wall C: deleting a base body frees a void, a press on that void selects it, and an insert refills it", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);
      await standAtChip(page, PRESET.wallC);
      const before = await storedDesignOf(page, designId);
      const target = await findBaseBodyInView(page, before, "C");
      const column = recordsOf(before).get(target.id)?.col ?? "";
      const removed = placementOf(before, target.id);
      await tapBody(page, target);

      const afterDelete = await editAndAwaitSave(page, designId, async () => {
        await press(page, page.getByTestId("panel-remove"));
      });

      expect(
        afterDelete.placements.map((placement) => placement.id),
      ).not.toContain(target.id);
      expect(afterDelete.placements).toHaveLength(before.placements.length - 1);
      const freed = voidsOfDesign(afterDelete).find(
        (opening) =>
          opening.wall === "C" &&
          opening.id.startsWith(`${column}:`) &&
          opening.y0 === 0,
      );
      expect(freed, `no base void in ${column} after the delete`).toBeDefined();
      if (freed === undefined) return;
      // A delete selects the opening it frees.
      await expectSelection(page, { id: freed.id, kind: "void" });

      await closeSheet(page);
      const point = await pointOfVoidInView(page, freed);
      expect(point, `${freed.id} projects outside the canvas`).toBeDefined();
      if (point === undefined) return;
      await tapVoid(page, freed, point);

      const afterInsert = await editAndAwaitSave(page, designId, async () => {
        await press(page, offerRow(page, removed.body.buildId));
      });

      const refilled = afterInsert.placements.find(
        (placement) =>
          placement.wall === "C" &&
          placement.alongMm === removed.alongMm &&
          placement.y0Mm === 0,
      );
      expect(refilled?.body.buildId).toBe(removed.body.buildId);
      expect(refilled?.body.widthMm).toBe(removed.body.widthMm);
      expect(afterInsert.placements).toHaveLength(before.placements.length);
      await expectSelection(page, {
        id: refilled?.id ?? "",
        kind: "placement",
      });
      await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });

    test("wall C: one width step narrows the body by 50 mm in the document and in the scene", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);
      await standAtChip(page, PRESET.wallC);
      const before = await storedDesignOf(page, designId);
      const target = await findBaseBodyInView(page, before, "C");
      const widthBeforeMm = placementOf(before, target.id).body.widthMm;
      await tapBody(page, target);

      const after = await editAndAwaitSave(page, designId, async () => {
        await press(page, page.getByTestId("width-step-narrower"));
      });

      const widthAfterMm = widthBeforeMm - PANEL_WIDTH_STEP_MM;
      expect(placementOf(after, target.id).body.widthMm).toBe(widthAfterMm);
      await expect(page.getByTestId("width-value")).toContainText(
        String(widthAfterMm),
      );
      await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
      await closeSheet(page);
      await republishScene(page, PRESET.wallC);
      const drawn = (await bodiesInScene(page)).get(target.id);
      const lengthAlongWallM = (drawn?.max[2] ?? 0) - (drawn?.min[2] ?? 0);
      expect(lengthAlongWallM).toBeCloseTo(widthAfterMm / MM_PER_M, 3);
      expect(pageErrors).toEqual([]);
    });

    test("wall C: the cabinet depth 600 to 700 keeps every back on wall C's plane and slides the run to where the corner rule puts it", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);
      await standAtChip(page, PRESET.wallC);
      const before = await storedDesignOf(page, designId);
      await expectBacksOnWallC(page, before);
      const startBefore = await readWallCRunStart(page, before);
      const cornerRuleBefore = cornerRuleFarEdgeM(before);
      expect(startBefore.cornerFarEdgeM).toBeCloseTo(cornerRuleBefore, 3);
      expect(startBefore.firstFreeBodyStartM).toBeCloseTo(cornerRuleBefore, 3);

      const after = await editAndAwaitSave(page, designId, async () => {
        await chooseCabinetDepth(page, String(CABINET_DEPTH_AFTER_MM));
      });

      expect(after.settings?.cabinetDepthMm).toBe(CABINET_DEPTH_AFTER_MM);
      await republishScene(page, PRESET.wallC);
      await expectBacksOnWallC(page, after);
      const startAfter = await readWallCRunStart(page, after);
      const cornerRuleAfter = cornerRuleFarEdgeM(after);
      expect(startAfter.cornerFarEdgeM).toBeCloseTo(cornerRuleAfter, 3);
      expect(startAfter.firstFreeBodyStartM).toBeCloseTo(cornerRuleAfter, 3);
      // The run slid by exactly the depth's growth, and the two figures come from different places: the
      // domain's corner rule, and the bodies three.js drew.
      const growthM =
        (CABINET_DEPTH_AFTER_MM - CABINET_DEPTH_BEFORE_MM) / MM_PER_M;
      expect(cornerRuleAfter - cornerRuleBefore).toBeCloseTo(growthM, 3);
      expect(
        startAfter.firstFreeBodyStartM - startBefore.firstFreeBodyStartM,
      ).toBeCloseTo(growthM, 3);
      expect(pageErrors).toEqual([]);
    });

    test("the large U (RQ7): wall A carries a hood and no upper, and a wall-cabinet inserted above a base is accepted", async ({
      page,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, LARGE_U);
      const before = await storedDesignOf(page, designId);
      const wallA = [...recordsOf(before).values()].filter(
        (record) => record.wall === "A",
      );
      const upperBuildIds = wallA
        .filter((record) => record.band === "wall" || record.band === "top")
        .map((record) => record.buildId);
      expect(upperBuildIds).toEqual([HOOD_BUILD_ID]);
      const columnsWithABase = new Set(
        wallA.filter((record) => record.band === "base").map((r) => r.col),
      );
      expect(columnsWithABase.size).toBeGreaterThan(0);

      await standAtChip(page, PRESET.wallA);
      const target = await firstVoidInView(
        page,
        voidsOfDesign(before).filter(
          (candidate) =>
            candidate.wall === "A" &&
            Math.abs(candidate.y0 - WALL_ROW_FLOOR_M) < 1e-6 &&
            columnsWithABase.has(candidate.col),
        ),
      );
      await tapVoid(page, target.opening, target.point);

      const after = await editAndAwaitSave(page, designId, async () => {
        await press(page, offerRow(page, WALL_CABINET_BUILD_ID));
      });

      const inserted = after.placements.find(
        (placement) =>
          placement.wall === "A" &&
          placement.body.buildId === WALL_CABINET_BUILD_ID,
      );
      expect(inserted, "no wall-cabinet stored on wall A").toBeDefined();
      expect(inserted?.alongMm).toBe(Math.round(target.opening.x * MM_PER_M));
      expect(inserted?.y0Mm).toBe(Math.round(WALL_ROW_FLOOR_M * MM_PER_M));
      expect(after.placements).toHaveLength(before.placements.length + 1);
      await expect(page.getByTestId("selection-debug")).toHaveAttribute(
        "data-rejection",
        "",
      );
      await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
      await expectSelection(page, {
        id: inserted?.id ?? "",
        kind: "placement",
      });
      expect(pageErrors).toEqual([]);
    });

    test("persistence: the room query and /d/{id} reload to the stored document unchanged, and no reload of /d/{id} paints a frame at the wrong chip count", async ({
      page,
      designWrites,
      pageErrors,
    }) => {
      const hydrationComplaints = collectHydrationComplaints(page);
      const designId = await composeUThroughStepOne(page, MIDDLE_U);
      await installFrameSampler(page);
      const { after: stored, slot } = await replaceWallCBase(page, designId);
      const editedId = stored.placements[slot]?.id ?? "";

      // Reload at the room query: the back link lands on 1D with every field refilled.
      await closeSheet(page);
      await followBackLink(page);
      await expect(page).toHaveURL(roomQueryOf(MIDDLE_U));
      await page.reload();
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1D",
      );
      await expectRoomFields(page, MIDDLE_U);
      expect(await storedDesignOf(page, designId)).toEqual(stored);
      expect(designWrites.postCount()).toBe(1);

      // Two document loads of the editor: a `goto` to its own URL, and a reload of it.
      const visits = [
        async () => page.goto(editorPath("ro", designId)),
        async () => page.reload(),
      ];
      for (const visit of visits) {
        await visit();
        await page.waitForSelector("canvas", { state: "attached" });
        const frames = await readPaintedFrames(page);
        await expectEditorReady(page, designId);
        expectNoWrongChipFrames(frames, U_CAMERA_PRESETS);
        expect(await storedDesignOf(page, designId)).toEqual(stored);
        expect((await bodiesInScene(page)).has(editedId)).toBe(true);
      }

      expect(hydrationComplaints).toEqual([]);
      expect(designWrites.postCount()).toBe(1);
      expect(pageErrors).toEqual([]);
    });

    test("the share view draws the same bodies as the editor, with four chips, and no reload of it paints a frame at the wrong chip count", async ({
      page,
      browser,
      pageErrors,
    }) => {
      const designId = await composeUThroughStepOne(page, MIDDLE_U);
      const { after: stored } = await replaceWallCBase(page, designId);
      await closeSheet(page);
      await republishScene(page, PRESET.overview);
      const editorBodies = await drawnBodies(page);
      // Every stored placement is drawn, so the comparison below is over the whole kitchen and an empty
      // scene cannot satisfy it.
      expect(editorBodies.map((body) => body.id)).toEqual(
        stored.placements.map((placement) => placement.id).sort(),
      );
      const shareLink = await issueShareLink(page, {
        id: designId,
        revision: "",
      });

      // A browser of its own: no visitor cookie, no write token — only the link.
      const stranger = await browser.newContext(
        contextOptionsLikeProject(test.info().project.use),
      );
      try {
        const sharedPage = await stranger.newPage();
        const hydrationComplaints = collectHydrationComplaints(sharedPage);
        await installFrameSampler(sharedPage);
        await openSharedDesign(sharedPage, shareLink, { locale: "ro" });
        await sharedPage.reload();
        await sharedPage.waitForSelector("canvas", { state: "attached" });
        expectNoWrongChipFrames(
          await readPaintedFrames(sharedPage),
          U_CAMERA_PRESETS,
        );
        await expect(cameraPresetButtons(sharedPage)).toHaveCount(
          U_CAMERA_PRESETS,
        );
        await waitForSettleAfter(sharedPage, 0);
        expectSameBodies(await drawnBodies(sharedPage), editorBodies);

        // What the server sent, with no JavaScript: four chips, the shared session, and the very builds
        // the owner's document stores.
        const html = await htmlOf(stranger.request, `/ro${shareLink}`);
        expect(cameraChipCount(html)).toBe(U_CAMERA_PRESETS);
        expect(fingerprintOf(html).sessionId).toBe(SHARE_VIEW_SESSION_ID);
        expect(buildsSentInHtml(html)).toEqual(buildsStoredIn(stored));
        expect(hydrationComplaints).toEqual([]);
      } finally {
        await stranger.close();
      }
      expect(pageErrors).toEqual([]);
    });

    // ADR 0133 A5, reported and not asserted: whether a client transition to `/d/{id}` got slower with
    // the snapshot store is a comparison across builds, which one build cannot make. This records the
    // transition here, and asserts only that each one completed on the target design's own four chips.
    test("A5: a client transition between two designs' editors reaches the target, and its time is reported", async ({
      page,
      pageErrors,
    }) => {
      const first = await composeUThroughStepOne(page, MIDDLE_U);
      const second = await composeUThroughStepOne(page, {
        ...MIDDLE_U,
        wallB: "3200",
      });

      const runs: { toChipsMs: number; wrongChipFrames: number }[] = [];
      for (let run = 0; run < TRANSITION_RUNS; run += 1) {
        const target = run % 2 === 0 ? first : second;
        runs.push(await measureClientTransitionToEditor(page, target));
        await expectEditorReady(page, target);
      }

      const times = runs.map((run) => Math.round(run.toChipsMs));
      const wrongFrames = runs.map((run) => run.wrongChipFrames);
      const report = `transition ms=[${times.join(", ")}] wrongChipFrames=[${wrongFrames.join(", ")}]`;
      console.log(`u-gate A5: ${report}`);
      test.info().annotations.push({ type: "A5", description: report });
      for (const run of runs) {
        expect(Number.isFinite(run.toChipsMs)).toBe(true);
        expect(run.toChipsMs).toBeGreaterThan(0);
      }
      expect(pageErrors).toEqual([]);
    });
  });
}
