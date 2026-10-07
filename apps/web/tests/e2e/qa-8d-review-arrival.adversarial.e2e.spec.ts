// What the editor does with `?select=` and `?settings=open`, at 390 x 844 by touch: once, on arrival, for a body the
// design holds; nothing for anything else; and nothing a second time.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import { cabinetDepthMmOf, type Design } from "@lemnaria/configurator-domain";
import { expect, type Locator, type Page } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";

import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  expectEditorReady,
  expectReviewDrawn,
  historyLength,
  openReview,
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

test("an address naming no body of this design, or asking for the settings in any other word, selects nothing, opens nothing, raises no error and is still cleaned", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(120_000);
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

test("in a U, the edit link of every group, wall C's among them, opens the editor with that group's first body selected and its panel open", async ({
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
      await page.locator(`a[href="${group.href}"]`).tap();
      await page.waitForURL(`/ro/d/${kitchen.id}`);

      if (!(await arrivesSelecting(page, wanted))) {
        arrivedWithoutItsBody.push(
          `${group.heading}: wanted ${wanted}, selected ${JSON.stringify((await readSelection(page)).selectionId)}`,
        );
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

test("in a U, a refusal's link to a body on wall C, followed while the remembered view is one that cuts wall C, opens the editor standing at wall C's own view with that body selected; changing to the cutting view afterwards deselects it", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
    await reviewChips.nth(VIEW_THAT_CUTS_WALL_C).tap();
    await expect(reviewChips.nth(VIEW_THAT_CUTS_WALL_C)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await named.tap();
    await page.waitForURL(`/ro/d/${kitchen.id}`);

    expect(await arrivesSelecting(page, bodyOnWallC)).toBe(true);
    await expect(editorChips(page).nth(VIEW_OF_WALL_C)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await editorChips(page).nth(VIEW_THAT_CUTS_WALL_C).tap();
    await expect
      .poll(async () => (await readSelection(page)).selectionId, {
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      })
      .toBe("");
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);

    await page.goBack();
    await expectReviewDrawn(page);
    await expect(reviewChips.nth(VIEW_THAT_CUTS_WALL_C)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await deleteMintedDesigns(minted);
  }
});

/** Holds the write-access answer (`GET /api/designs/{id}`) until the returned function is called. */
async function holdTheWriteAccessAnswer(
  page: Page,
  designId: string,
): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/designs/${designId}`, async (route) => {
    if (route.request().method() === "GET") await held;
    await route.continue();
  });
  return release;
}

const SETTINGS_TRIGGER = "global-settings-trigger";

test("?settings=open waits for the write-access answer: until it comes the parameter stays and nothing opens; then the sheet opens and the parameter leaves; a reload and a language switch open nothing again", async ({
  page,
  seededDesign,
}) => {
  const release = await holdTheWriteAccessAnswer(page, seededDesign.id);

  await page.goto(`/ro/d/${seededDesign.id}?settings=open`);
  await expect(page.getByTestId(SETTINGS_TRIGGER)).toBeDisabled({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  await page.waitForTimeout(ARRIVAL_SETTLE_MS);

  expect(addressOf(page)).toBe(`/ro/d/${seededDesign.id}?settings=open`);
  await expect(settingsSheet(page)).toHaveCount(0);

  release();

  await expect(settingsSheet(page)).toBeVisible();
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
