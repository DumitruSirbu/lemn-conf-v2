// What the editor does with `?select=` and `?settings=open`, at 390 x 844 by touch: once, on arrival, for a body the
// design holds; nothing for anything else; and nothing a second time.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import {
  cabinetDepthMmOf,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { expect, type Locator, type Page } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";

import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  expectEditorReady,
  expectReviewDrawn,
  historyLength,
  openReview,
  refuseWebGL,
  settingsSheet,
} from "./support/qa-8d-review";
import { FIRST_FRAME_FREEZE_TIMEOUT_MS, test } from "./support/seeded-design";
import { U_MIDDLE, seedKitchen } from "./support/ssr-html";
import {
  composeU,
  idsOnWall,
  recordsByPlacementId,
  seedDesign,
} from "./support/u-design";

/** Long enough for an arrival effect to have acted, were it going to. */
const ARRIVAL_SETTLE_MS = 1200;

function addressOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

function collectPageErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("?select= naming a body of the design selects it and is then taken off the address in place; a reload and a language switch select nothing again", async ({
  page,
  seededDesign,
}) => {
  await page.goto("/ro/configurator/room");
  const lengthBefore = await historyLength(page);

  await page.goto(`/ro/d/${seededDesign.id}?select=p8`);
  await expectEditorReady(page);

  expect((await readSelection(page)).selectionId).toBe("p8");
  await expect(page.getByTestId("editor-panel")).toBeVisible();
  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}`);
  expect(await historyLength(page)).toBe(lengthBefore + 1);
  // The strip rewrites the entry in place and must hand back the router's own state with it.
  expect(
    await page.evaluate(() =>
      Object.keys((window.history.state ?? {}) as object).some((key) =>
        key.includes("NEXTJS_INTERNALS_TREE"),
      ),
    ),
  ).toBe(true);

  await page.reload();
  await expectEditorReady(page);
  await page.waitForTimeout(ARRIVAL_SETTLE_MS);
  expect((await readSelection(page)).selectionId).toBe("");

  await page.goto(`/ro/d/${seededDesign.id}?select=p8`);
  await expectEditorReady(page);
  expect((await readSelection(page)).selectionId).toBe("p8");
  await page.getByTestId("panel-close").tap();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);

  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ru").tap();
  await page.waitForURL(`/ru/d/${seededDesign.id}`);
  await expectEditorReady(page);
  await page.waitForTimeout(ARRIVAL_SETTLE_MS);

  expect((await readSelection(page)).selectionId).toBe("");
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
});

const SELECTIONS_THE_DESIGN_DOES_NOT_HOLD: readonly string[] = [
  "?select=p9999",
  "?select=n14",
  "?select=",
  "?select=P8",
  "?select=p8%20",
  "?select=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
  "?select=__proto__",
  "?select=A%7C2.45",
  "?settings=OPEN",
  "?settings=",
  "?settings=closed",
  "?select",
];

/** One load, the editor ready and the arrival's settle, on a runner whose software WebGL took 10 to 12 s for it
 *  (run 38574379483), with room for the slowest. */
const ONE_LOAD_ON_A_SLOW_RUNNER_MS = 20_000;

test("an address naming no body of this design, or asking for the settings in any other word, selects nothing, opens nothing, raises no error and is still cleaned", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(
    SELECTIONS_THE_DESIGN_DOES_NOT_HOLD.length * ONE_LOAD_ON_A_SLOW_RUNNER_MS,
  );
  const errors = collectPageErrors(page);

  for (const query of SELECTIONS_THE_DESIGN_DOES_NOT_HOLD) {
    await page.goto(`/ro/d/${seededDesign.id}${query}`);
    await expectEditorReady(page);
    await page.waitForTimeout(ARRIVAL_SETTLE_MS);

    expect((await readSelection(page)).selectionId, query).toBe("");
    await expect(page.getByTestId("editor-panel"), query).toHaveCount(0);
    await expect(settingsSheet(page), query).toHaveCount(0);
    await expect(page.getByTestId("design-load-error"), query).toHaveCount(0);
    expect(addressOf(page), query).toBe(`/ro/d/${seededDesign.id}`);
  }
  expect(errors).toEqual([]);
});

test("a parameter the editor does not own, and the fragment, stay on the address when ?select= is taken off", async ({
  page,
  seededDesign,
}) => {
  await page.goto(`/ro/d/${seededDesign.id}?utm=mail&select=p8&x=1#top`);
  await expectEditorReady(page);

  expect((await readSelection(page)).selectionId).toBe("p8");
  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}?utm=mail&x=1#top`);
});

test("a typed address asking for a body and the settings at once gets both", async ({
  page,
  seededDesign,
}) => {
  await page.goto(`/ro/d/${seededDesign.id}?select=p8&settings=open`);
  await expectEditorReady(page);

  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}`);
  expect((await readSelection(page)).selectionId).toBe("p8");
  await expect(settingsSheet(page)).toBeVisible();
});

/** How many times the scene's camera has come to rest in this document, as the editor's own readout counts it. */
async function sceneSettles(page: Page): Promise<number> {
  return Number(
    (await page
      .getByTestId("selection-debug")
      .getAttribute("data-scene-settle-count")) ?? "0",
  );
}

/**
 * Whether the editor holds `wanted` as its selection, with the panel open, once the scene of this arrival has come to
 * rest. Read after the rest and not before: a body selected early and deselected by the scene's first frames would
 * pass a read made in between. Called as soon as the editor's address shows, so the count it starts from is read
 * before this arrival's scene has drawn. The rest comes after the first WebGL frames, so the wait is ADR 0144's bound.
 */
async function arrivesSelecting(page: Page, wanted: string): Promise<boolean> {
  await expect(page.getByTestId("selection-debug")).toBeAttached({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  const settlesBeforeThisScene = await sceneSettles(page);
  await expect
    .poll(() => sceneSettles(page), { timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS })
    .toBeGreaterThan(settlesBeforeThisScene);
  try {
    await expect
      .poll(async () => (await readSelection(page)).selectionId, {
        timeout: SELECTION_AFTER_REST_TIMEOUT_MS,
      })
      .toBe(wanted);
    await expect(page.getByTestId("editor-panel")).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

/** The selection is written in the same task as the rest; this covers React's commit of it, no more. */
const SELECTION_AFTER_REST_TIMEOUT_MS = 2000;

function editorChips(page: Page): Locator {
  return page.locator('[role="group"] button[aria-pressed]');
}

/** The editor of `designId` is the page, whatever is still on its address: in a U `?select=` stays until its outcome. */
async function waitForTheEditorOf(page: Page, designId: string): Promise<void> {
  await page.waitForURL((url) => url.pathname === `/ro/d/${designId}`);
}

interface SceneReadout {
  readonly camera: {
    readonly projection: readonly number[];
    readonly view: readonly number[];
  };
  readonly bodies: readonly {
    readonly placementId: string;
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  }[];
}

interface PlaceInTheFrame {
  /** The body's box in the frame's own units, where -1 to 1 is the canvas from edge to edge. */
  readonly across: readonly [number, number];
  readonly upward: readonly [number, number];
  /** Whether any of the body is inside the canvas. */
  readonly isInTheFrame: boolean;
}

/**
 * Where body `placementId` falls in the scene's frame once the camera has rested. Worked from the camera's two
 * matrices and the corners of the body's world bounds as the scene publishes them, not from pixels (checked against
 * a body selected by a tap at a known point). It says whether any of the body is in the camera's frame; it does not
 * say the editor's own sheet, which covers most of a phone's scene once a body is selected, leaves it uncovered.
 */
async function whereTheBodyFallsInTheFrame(
  page: Page,
  placementId: string,
): Promise<PlaceInTheFrame> {
  const readout = page.getByTestId("selection-debug");
  const scene: SceneReadout = {
    camera: JSON.parse(
      (await readout.getAttribute("data-scene-camera")) ?? "{}",
    ) as SceneReadout["camera"],
    bodies: JSON.parse(
      (await readout.getAttribute("data-scene-bodies")) ?? "[]",
    ) as SceneReadout["bodies"],
  };
  const body = scene.bodies.find(
    (candidate) => candidate.placementId === placementId,
  );
  if (body === undefined)
    throw new Error(`the scene published no bounds for ${placementId}`);
  // Column-major 4 x 4 matrices, as three.js holds them.
  const through = (matrix: readonly number[], point: readonly number[]) =>
    [0, 1, 2, 3].map((row) =>
      [0, 1, 2, 3].reduce(
        (sum, column) =>
          sum + (matrix[column * 4 + row] ?? 0) * (point[column] ?? 0),
        0,
      ),
    );
  const corners = [body.min, body.max].flatMap((x) =>
    [body.min, body.max].flatMap((y) =>
      [body.min, body.max].map((z) => {
        const clip = through(
          scene.camera.projection,
          through(scene.camera.view, [x[0], y[1], z[2], 1]),
        );
        const depth = clip[3] ?? 1;
        return [(clip[0] ?? 0) / depth, (clip[1] ?? 0) / depth] as const;
      }),
    ),
  );
  const span = (axis: 0 | 1): [number, number] => {
    const values = corners.map((corner) => corner[axis]);
    return [Math.min(...values), Math.max(...values)];
  };
  const across = span(0);
  const upward = span(1);
  return {
    across,
    upward,
    isInTheFrame:
      across[1] > -1 && across[0] < 1 && upward[1] > -1 && upward[0] < 1,
  };
}

test("in a U, the edit link of every group, wall C's among them, opens the editor at that wall's own view with the group's first body selected and its panel open", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    await openReview(page, kitchen);
    const groups = await page
      .getByTestId("review-group")
      .evaluateAll((sections) =>
        sections.map((section) => ({
          heading: section.querySelector("h2")?.textContent ?? "",
          href:
            section
              .querySelector('[data-testid="review-group-edit"]')
              ?.getAttribute("href") ?? "",
        })),
      );
    expect(groups.length).toBeGreaterThanOrEqual(8);

    const arrivedWithoutItsBody: string[] = [];
    for (const group of groups) {
      const wanted =
        new URL(group.href, page.url()).searchParams.get("select") ?? "";
      const viewOfItsWall = group.heading.split(" · ")[0] ?? "";
      await page.locator(`a[href="${group.href}"]`).tap();
      await waitForTheEditorOf(page, kitchen.id);

      if (!(await arrivesSelecting(page, wanted))) {
        arrivedWithoutItsBody.push(
          `${group.heading}: wanted ${wanted}, selected ${JSON.stringify((await readSelection(page)).selectionId)}`,
        );
      } else {
        await expect(
          page.getByRole("button", { name: viewOfItsWall, exact: true }),
          group.heading,
        ).toHaveAttribute("aria-pressed", "true");
        expect(addressOf(page), group.heading).toBe(`/ro/d/${kitchen.id}`);
      }

      if ((await page.getByTestId("editor-panel").count()) > 0)
        await page.getByTestId("panel-close").tap();
      await page.goBack();
      await expectReviewDrawn(page);
    }
    expect(arrivedWithoutItsBody).toEqual([]);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("in a U, ?select= stays on the address until its outcome: it is there while the scene is still coming, a reload in the wait starts the same arrival again and it lands, and on a device without WebGL the parameter leaves with nothing selected", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    const { address, body } = await addressSelectingAWallCBody(page, kitchen);
    await noteTheAddressWhenTheSceneFirstAppears(page);

    await page.goto(address, { waitUntil: "commit" });
    expect(addressOf(page)).toBe(address);
    await page.reload({ waitUntil: "commit" });
    expect(addressOf(page)).toBe(address);
    expect(await arrivesSelecting(page, body)).toBe(true);
    // The canvas appears after the arrival has been decided and before the scene rests: the wait itself.
    expect(await addressWhenTheSceneFirstAppeared(page)).toBe(
      new URL(address, page.url()).search,
    );
    await expect.poll(() => addressOf(page)).toBe(`/ro/d/${kitchen.id}`);

    const withoutWebGL = await context.newPage();
    await refuseWebGL(withoutWebGL);
    await withoutWebGL.goto(address);
    await expect(withoutWebGL.getByTestId("webgl-unavailable")).toBeVisible();
    await expect
      .poll(() => addressOf(withoutWebGL))
      .toBe(`/ro/d/${kitchen.id}`);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

/** Makes every document this page loads record its address's query at the moment its first canvas is attached. */
async function noteTheAddressWhenTheSceneFirstAppears(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("canvas") === null) return;
      Reflect.set(window, "__queryWhenTheSceneAppeared", location.search);
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}

async function addressWhenTheSceneFirstAppeared(page: Page): Promise<unknown> {
  return page.evaluate(
    () => Reflect.get(window, "__queryWhenTheSceneAppeared") as unknown,
  );
}

const U_ROOM = { widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 };
/** In this U the view of wall B is the one whose eye cuts wall C away; found by standing at each view in turn. */
const VIEW_THAT_CUTS_WALL_C = 2;
const VIEW_OF_WALL_C = 3;

/** How much shorter wall C is declared than the run standing on it, so the bodies at its far end are past it. The
 *  write path keeps such a design, as it keeps the editor's own narrowed room. */
const WALL_C_SHORTENED_BY_MM = 700;

/** The U with wall C declared shorter than its run, and the ids of the bodies standing on wall C. */
function uWithBodiesPastWallC(): {
  design: Design;
  idsOnWallC: readonly string[];
} {
  const fitting = composeU(U_ROOM);
  const idsOnWallC = idsOnWall(
    recordsByPlacementId(fitting, cabinetDepthMmOf(fitting)),
    "C",
  );
  return {
    design: {
      ...fitting,
      room: {
        ...fitting.room,
        wallCMm: U_ROOM.wallCMm - WALL_C_SHORTENED_BY_MM,
      },
    },
    idsOnWallC,
  };
}

test("in a U, a refusal's link to a body on wall C, followed from each of the review's views in turn, opens the editor standing at wall C's own view with that body selected; changing to the view that cuts wall C afterwards deselects it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const minted: string[] = [];
  try {
    const { design, idsOnWallC } = uWithBodiesPastWallC();
    const kitchen = await seedDesign(page, design);
    minted.push(kitchen.id);
    await openReview(page, kitchen);
    const named = page
      .getByTestId("review-named-bodies")
      .getByRole("link")
      .first();
    const bodyOnWallC =
      new URL(
        (await named.getAttribute("href")) ?? "",
        page.url(),
      ).searchParams.get("select") ?? "";
    expect(idsOnWallC).toContain(bodyOnWallC);
    const reviewChips = page.getByTestId("review-scene").getByRole("button");
    const views = await reviewChips.count();
    expect(views).toBe(4);

    for (let view = 0; view < views; view += 1) {
      const detail = `from the review's view ${String(view)}`;
      await reviewChips.nth(view).tap();
      await expect(reviewChips.nth(view), detail).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await named.tap();
      await waitForTheEditorOf(page, kitchen.id);

      expect(await arrivesSelecting(page, bodyOnWallC), detail).toBe(true);
      await expect(
        editorChips(page).nth(VIEW_OF_WALL_C),
        detail,
      ).toHaveAttribute("aria-pressed", "true");

      if (view < views - 1) {
        await page.getByTestId("panel-close").tap();
        await page.goBack();
        await expectReviewDrawn(page);
        // The remembered view is the one the arrival stood at.
        await expect(reviewChips.nth(VIEW_OF_WALL_C), detail).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    }

    await editorChips(page).nth(VIEW_THAT_CUTS_WALL_C).tap();
    await expect
      .poll(async () => (await readSelection(page)).selectionId, {
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      })
      .toBe("");
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

// Two declared deferrals, owned by backlog 16 (the owner's ruling of 2026-09-05: fit-to-run framing, so a run's end is
// on screen at 390 px). An arrival stands at the body's own wall view, which is what the rule promises and what the
// tests above assert; whether the body is then inside that view's frame is the stage's framing on a tall narrow
// canvas, and at 390 px it is not for a body near a wall's end. Each test below asserts that the body is in the
// frame and is marked as expected to fail, so it goes red the day the framing is fixed: whoever builds backlog 16
// removes the `test.fail` line and keeps the assertion. Measured when written: the U's first wall A base body spans
// -2.30 to -1.14 across a frame that is -1 to 1, and the refusal's wall C body 1.19 to 2.30.
const FRAMING_DEFERRAL =
  "backlog 16: the wall's own view does not frame a body near the wall's end at 390 px";

/** Opens the editor on `address`, waits for its arrival to land on `body`, and says where the body falls. */
async function arriveAndFindTheBody(
  page: Page,
  address: string,
  body: string,
): Promise<PlaceInTheFrame> {
  await page.goto(address, { waitUntil: "commit" });
  expect(await arrivesSelecting(page, body)).toBe(true);
  return whereTheBodyFallsInTheFrame(page, body);
}

test("in a U at 390 px, the first body of wall A's base group is inside the frame of wall A's view on arrival", async ({
  page,
}) => {
  test.fail(true, FRAMING_DEFERRAL);
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    await openReview(page, kitchen);
    const address =
      (await page
        .getByTestId("review-group-edit")
        .first()
        .getAttribute("href")) ?? "";
    const body = new URL(address, page.url()).searchParams.get("select") ?? "";

    const place = await arriveAndFindTheBody(page, address, body);

    expect(place.isInTheFrame, JSON.stringify(place)).toBe(true);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("in a U at 390 px, the wall C body a refusal names is inside the frame of wall C's view on arrival", async ({
  page,
}) => {
  test.fail(true, FRAMING_DEFERRAL);
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedDesign(page, uWithBodiesPastWallC().design);
    minted.push(kitchen.id);
    await openReview(page, kitchen);
    const address =
      (await page
        .getByTestId("review-named-bodies")
        .getByRole("link")
        .first()
        .getAttribute("href")) ?? "";
    const body = new URL(address, page.url()).searchParams.get("select") ?? "";

    const place = await arriveAndFindTheBody(page, address, body);

    expect(place.isInTheFrame, JSON.stringify(place)).toBe(true);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("in an L, a body on another wall than the view the review was left at opens the editor at that body's own wall view, selected at once, still selected when the camera rests, and in the frame", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedDesign(page, NARROWED_ROOM_OVERFLOWING_DESIGN);
    minted.push(kitchen.id);
    await openReview(page, kitchen);
    const reviewChips = page.getByTestId("review-scene").getByRole("button");
    const wallViews = await reviewChips.allTextContents();
    const named = page
      .getByTestId("review-named-bodies")
      .getByRole("link")
      .first();
    const groups = await page
      .getByTestId("review-group")
      .evaluateAll((sections) =>
        sections.map((section) => ({
          wallView: (section.querySelector("h2")?.textContent ?? "").split(
            " · ",
          )[0],
          href:
            section
              .querySelector('[data-testid="review-group-edit"]')
              ?.getAttribute("href") ?? "",
        })),
      );
    const journeys = [
      {
        name: "a refusal's body on wall A, from wall B's view",
        leftAt: 2,
        href: (await named.getAttribute("href")) ?? "",
        arrivesAt: wallViews[1] ?? "",
      },
      {
        name: "a wall B group, from wall A's view",
        leftAt: 1,
        href:
          groups.find((group) => group.wallView === wallViews[2])?.href ?? "",
        arrivesAt: wallViews[2] ?? "",
      },
      {
        name: "a wall A group, from the overview",
        leftAt: 0,
        href:
          groups.find((group) => group.wallView === wallViews[1])?.href ?? "",
        arrivesAt: wallViews[1] ?? "",
      },
    ];

    for (const journey of journeys) {
      expect(journey.href, journey.name).not.toBe("");
      const body =
        new URL(journey.href, page.url()).searchParams.get("select") ?? "";
      await reviewChips.nth(journey.leftAt).tap();
      await expect(reviewChips.nth(journey.leftAt)).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.locator(`a[href="${journey.href}"]`).first().tap();
      await waitForTheEditorOf(page, kitchen.id);
      await expect(page.getByTestId("selection-debug")).toHaveAttribute(
        "data-selection-id",
        body,
      );

      expect(await arrivesSelecting(page, body), journey.name).toBe(true);
      await expect(
        page.getByRole("button", { name: journey.arrivesAt, exact: true }),
        journey.name,
      ).toHaveAttribute("aria-pressed", "true");
      const place = await whereTheBodyFallsInTheFrame(page, body);
      expect(
        place.isInTheFrame,
        `${journey.name}: ${JSON.stringify(place)}`,
      ).toBe(true);
      expect(addressOf(page), journey.name).toBe(`/ro/d/${kitchen.id}`);

      await page.getByTestId("panel-close").tap();
      await page.goBack();
      await expectReviewDrawn(page);
    }
  } finally {
    await deleteMintedDesigns(minted);
  }
});

interface HeldWriteAccessAnswer {
  readonly release: () => void;
  /** How long the answer has been kept so far; zero until the request has been caught. */
  readonly heldForMs: () => number;
}

/** Holds the write-access answer (`GET /api/designs/{id}`) until `release` is called. */
async function holdTheWriteAccessAnswer(
  page: Page,
  designId: string,
): Promise<HeldWriteAccessAnswer> {
  let release: () => void = () => undefined;
  let caughtAt: number | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/designs/${designId}`, async (route) => {
    if (route.request().method() === "GET") {
      caughtAt ??= Date.now();
      await held;
    }
    await route.continue();
  });
  return {
    release,
    heldForMs: () => (caughtAt === undefined ? 0 : Date.now() - caughtAt),
  };
}

/** The client gives up on a read after ten seconds (`LOAD_TIMEOUT_MS`) and the answer is then "unverified" for good,
 *  so a held answer must be let go well inside that, however long the page took to draw on a slow runner. */
const LONGEST_HOLD_BEFORE_THE_CHECKS_MS = 6000;

/** The arrival's own settle, shortened by what the page's slowness has already spent of the hold. */
async function settleWithinTheHold(
  page: Page,
  answer: HeldWriteAccessAnswer,
): Promise<void> {
  const left = LONGEST_HOLD_BEFORE_THE_CHECKS_MS - answer.heldForMs();
  await page.waitForTimeout(Math.max(0, Math.min(ARRIVAL_SETTLE_MS, left)));
}

const SETTINGS_TRIGGER = "global-settings-trigger";

test("?settings=open waits for the write-access answer: until it comes the parameter stays and nothing opens; then the sheet opens and the parameter leaves; a reload and a language switch open nothing again", async ({
  page,
  seededDesign,
}) => {
  const answer = await holdTheWriteAccessAnswer(page, seededDesign.id);

  await page.goto(`/ro/d/${seededDesign.id}?settings=open`);
  await expect(page.getByTestId(SETTINGS_TRIGGER)).toBeDisabled({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  await settleWithinTheHold(page, answer);

  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}?settings=open`);
  await expect(settingsSheet(page)).toHaveCount(0);

  const heldForMs = answer.heldForMs();
  answer.release();

  await expect(
    settingsSheet(page),
    `the answer was held for ${String(heldForMs)} ms before its release; the client gives up on a read after 10000`,
  ).toBeVisible();
  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}`);
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(1);

  await page.reload();
  await expectEditorReady(page);
  await page.waitForTimeout(ARRIVAL_SETTLE_MS);
  await expect(settingsSheet(page)).toHaveCount(0);

  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ru").tap();
  await page.waitForURL(`/ru/d/${seededDesign.id}`);
  await expectEditorReady(page);
  await page.waitForTimeout(ARRIVAL_SETTLE_MS);
  await expect(settingsSheet(page)).toHaveCount(0);
});

const BROWSERS_THAT_MAY_NOT_WRITE: readonly (readonly [
  string,
  (page: Page, designId: string) => Promise<void>,
  string,
])[] = [
  [
    "a browser without the design's write credential",
    async (page, designId) => {
      await page
        .context()
        .clearCookies({ name: `lemnaria_write_token_${designId}` });
    },
    APPROVED_ROMANIAN_MESSAGES.panel.readOnlyReason,
  ],
  [
    "a browser whose write-access check fails",
    async (page, designId) => {
      await page.route(`**/api/designs/${designId}`, (route) =>
        route.request().method() === "GET" ? route.abort() : route.continue(),
      );
    },
    APPROVED_ROMANIAN_MESSAGES.panel.accessUncheckableReason,
  ],
];

for (const [name, arrange, reason] of BROWSERS_THAT_MAY_NOT_WRITE) {
  test(`?select= and ?settings=open in ${name}: the body is selected, the settings are not opened, the parameters leave, and the trigger says why it is off`, async ({
    page,
    seededDesign,
  }) => {
    await arrange(page, seededDesign.id);

    await page.goto(`/ro/d/${seededDesign.id}?select=p8&settings=open`);
    await expect(page.getByTestId("top-bar-title")).toBeVisible({
      timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
    });

    const trigger = page.getByTestId(SETTINGS_TRIGGER);
    await expect(trigger).toHaveAttribute("data-disabled-reason", reason, {
      timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
    });
    await expect.poll(() => addressOf(page)).toBe(`/ro/d/${seededDesign.id}`);
    await page.waitForTimeout(ARRIVAL_SETTLE_MS);
    await expect(trigger).toBeDisabled();
    await expect(settingsSheet(page)).toHaveCount(0);
    expect((await readSelection(page)).selectionId).toBe("p8");
  });
}

/** A point on a body of wall C in this U's view of wall C, where the arrival stands, found by tapping the running
 *  scene (it selected `n13`); and one far above the canvas, from which the ray climbs over everything in the room,
 *  so the press is a tap that clears. A point merely beside the canvas will not do: its ray still meets the bodies
 *  that stand outside the frame (measured: 40 px left of it selected `right-p9`). */
const A_BODY_IN_THE_WALL_VIEW = { x: 195, y: 300 };
const NOTHING_IN_THE_WALL_VIEW = { x: 195, y: -3000 };
/** Long enough for an arrival's selection to have been written after the rest, were it still pending. */
const AFTER_REST_MS = 1500;

/** A U's address asking for the first body of its first wall C group, as the review's own link spells it. */
async function addressSelectingAWallCBody(
  page: Page,
  kitchen: { readonly id: string; readonly revision: string },
): Promise<{ readonly address: string; readonly body: string }> {
  await openReview(page, kitchen);
  const href =
    (await page
      .getByTestId("review-group")
      .filter({ has: page.getByRole("heading", { name: /^Perete C/ }) })
      .first()
      .getByTestId("review-group-edit")
      .getAttribute("href")) ?? "";
  const body = new URL(href, page.url()).searchParams.get("select") ?? "";
  if (body === "") throw new Error("the U draws no wall C group to arrive on");
  return { address: href, body };
}

type GestureBeforeTheRest = "a tap" | "a drag";

interface PressBeforeTheRest {
  readonly gesture: GestureBeforeTheRest;
  readonly x: number;
  readonly y: number;
}

/**
 * Makes every editor this page loads receive `press` on its canvas on each frame from the canvas's first frame until
 * something is selected or the scene has rested, and counts the presses made before the rest.
 *
 * The presses are pointer events dispatched in the page, not a finger. A touch sent through the browser while the
 * scene draws its first frame is delivered only after the scene has rested (measured: the first frame holds the main
 * thread for about two seconds and the rest is the next frame), so nothing a test can send from outside lands in
 * between. What is exercised here is the rule at the events the scene and the arrival both listen to.
 */
async function pressTheSceneOnEveryFrameUntilItRests(
  page: Page,
  press: PressBeforeTheRest,
): Promise<void> {
  await page.addInitScript(({ gesture, x, y }: PressBeforeTheRest) => {
    const made = { beforeTheRest: 0 };
    Reflect.set(window, "__pressesBeforeTheRest", made);
    const frame = (): void => {
      const readout = document.querySelector('[data-testid="selection-debug"]');
      const canvas = document.querySelector("canvas");
      const hasRested =
        (readout?.getAttribute("data-scene-settle-count") ?? "") !== "";
      const isSelected =
        (readout?.getAttribute("data-selection-id") ?? "") !== "";
      if (readout !== null && canvas !== null && !hasRested && !isSelected) {
        const at = (clientX: number) => ({
          clientX,
          clientY: y,
          bubbles: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
        });
        canvas.dispatchEvent(new PointerEvent("pointerdown", at(x)));
        canvas.dispatchEvent(
          new PointerEvent("pointerup", at(gesture === "a tap" ? x : x + 120)),
        );
        made.beforeTheRest += 1;
      }
      if (!hasRested) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, press);
}

async function pressesMadeBeforeTheRest(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        Reflect.get(window, "__pressesBeforeTheRest") as {
          beforeTheRest: number;
        }
      ).beforeTheRest,
  );
}

async function waitForTheSceneToRest(page: Page): Promise<void> {
  await expect
    .poll(() => sceneSettles(page), { timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS })
    .toBeGreaterThan(0);
  await page.waitForTimeout(AFTER_REST_MS);
}

test("in a U, a body the customer presses before the scene rests stays selected: the arrival's own body does not replace it, and the parameter is gone", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    const { address, body } = await addressSelectingAWallCBody(page, kitchen);
    await pressTheSceneOnEveryFrameUntilItRests(page, {
      gesture: "a tap",
      ...A_BODY_IN_THE_WALL_VIEW,
    });

    await page.goto(address);
    await waitForTheSceneToRest(page);

    expect(await pressesMadeBeforeTheRest(page)).toBeGreaterThan(0);
    const selected = (await readSelection(page)).selectionId;
    expect(selected).not.toBe("");
    expect(selected).not.toBe(body);
    expect(addressOf(page)).toBe(`/ro/d/${kitchen.id}`);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("in a U, a press on nothing before the scene rests leaves nothing selected: the arrival's body is not selected after it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    const { address } = await addressSelectingAWallCBody(page, kitchen);
    await pressTheSceneOnEveryFrameUntilItRests(page, {
      gesture: "a tap",
      ...NOTHING_IN_THE_WALL_VIEW,
    });

    await page.goto(address);
    await waitForTheSceneToRest(page);

    expect(await pressesMadeBeforeTheRest(page)).toBeGreaterThan(0);
    expect((await readSelection(page)).selectionId).toBe("");
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);
    expect(addressOf(page)).toBe(`/ro/d/${kitchen.id}`);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("in a U, a drag across the scene before it rests is not the customer choosing a body: the arrival's body is selected at the rest", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    const { address, body } = await addressSelectingAWallCBody(page, kitchen);
    await pressTheSceneOnEveryFrameUntilItRests(page, {
      gesture: "a drag",
      ...A_BODY_IN_THE_WALL_VIEW,
    });

    await page.goto(address);
    await waitForTheSceneToRest(page);

    expect(await pressesMadeBeforeTheRest(page)).toBeGreaterThan(0);
    expect((await readSelection(page)).selectionId).toBe(body);
    await expect(page.getByTestId("editor-panel")).toBeVisible();
  } finally {
    await deleteMintedDesigns(minted);
  }
});
