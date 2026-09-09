import { expect, test, type Locator, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";

/**
 * **Frame 2E's sheet at 390 × 844, and the half of it no value assertion can see.**
 *
 * `tests/settings/global-settings-model.test.ts` asserts everything this surface *says*; what it
 * cannot assert is what the surface *is*, because `renderToStaticMarkup` cannot press a key. The
 * ruling this wave carries out is that the settings sheet is **modal on both viewports** — unlike
 * the breakdown next to it, which is deliberately not — so the four properties below are the ruling,
 * measured: a scrim, focus that cannot leave, a background that cannot be operated, and an Escape
 * that cancels wherever focus has got to.
 *
 * **Why this surface and not the breakdown.** The breakdown is a static list a customer asked to
 * read. This one holds uncommitted state and an explicit apply, so a live background means the
 * design can change underneath a pending material choice — and the deltas on screen were measured
 * against the design that has just moved.
 */

const SCENE_SETTLE_MS = 2000;
const SEEDED_BODY_COUNT = 26;

/** Larger than the number of stops inside the sheet, so a re-ordered tab ring changes nothing about
 *  what is asserted. */
const MORE_TAB_STOPS_THAN_THE_SHEET_HAS = 14;

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

/** Wave 6E's container and the timestamp a successful command moves, read off the one observability
 *  hook this application renders (`selection-debug.tsx`). Nothing on the page shows either, so
 *  "wrote nothing" and "wrote only the group that changed" are unreadable without it. */
async function storedSettings(page: Page): Promise<{
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly updatedAt: string;
}> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    materialTierId: element.getAttribute("data-material-tier") ?? "",
    hardwareTierId: element.getAttribute("data-hardware-tier") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/**
 * **What the closed surface shows of the settings it holds.** Until the chrome-parity wave that was
 * a separate `global-settings-chips` row beside the trigger; ADR 0104 decision 2 removed the row and
 * folded its labels into the pill, which is now both the summary and the control
 * (`tests/settings/global-settings-shell.test.ts` pins the row's absence). The claim these cases
 * make — a cancel leaves the visible summary exactly as it was, an apply moves it — is unchanged;
 * only the element carrying it is.
 *
 * The trigger is read rather than its `global-settings-pill-label` parts, so a re-arranged pill
 * changes nothing here: what is compared is everything the customer can read on it.
 */
function pillSummary(page: Page): Locator {
  return page.getByTestId("global-settings-trigger");
}

/** The dearest tier a group offers, and never the one a fresh design carries — so choosing it is
 *  always a change, whatever the book's order. */
function dearestTierIn(page: Page, group: "material" | "hardware"): Locator {
  return page
    .getByTestId("global-settings-group")
    .nth(group === "material" ? 0 : 1)
    .getByRole("radio")
    .last();
}

async function isFocusInsideSheet(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const surface = document.querySelector(
      '[data-testid="global-settings-surface"]',
    );
    const focused = document.activeElement;
    return surface !== null && focused !== null && surface.contains(focused);
  });
}

test("opens from the pill that summarises what it sets", async ({ page }) => {
  const trigger = page.getByTestId("global-settings-trigger");

  // **The opener is named, not labelled** (ADR 0104 decision 2). No frame draws a separate *Setări
  // globale* control: the pill draws the summary of the applied settings — measured
  // `PAL melaminat+3` — and carries `ro.globalSettings.open` as its accessible name. So the claim
  // worth holding is that the control is still *announced* as the global-settings opener, which is
  // the one thing a visible summary cannot satisfy on its own.
  await expect(trigger).toHaveAccessibleName(
    new RegExp(ro.globalSettings.open),
  );
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);

  await trigger.tap();

  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("global-settings-scrim")).toBeVisible();
});

test("says how many bodies it applies to, and that it is not set per cabinet", async ({
  page,
}) => {
  await page.getByTestId("global-settings-trigger").tap();

  await expect(page.getByTestId("global-settings-applies-to")).toHaveText(
    ro.globalSettings.appliesTo(SEEDED_BODY_COUNT),
  );
});

test("moves focus into the sheet, and does not let Tab leave it", async ({
  page,
}) => {
  await page.getByTestId("global-settings-trigger").tap();
  expect(await focusedTestId(page)).toBe("global-settings-surface");

  for (let step = 0; step < MORE_TAB_STOPS_THAN_THE_SHEET_HAS; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await isFocusInsideSheet(page),
      `after ${String(step + 1)} tabs`,
    ).toBe(true);
  }
});

test("marks the rest of the screen inert while it is open, and releases it after", async ({
  page,
}) => {
  const presets = page.getByRole("group", {
    name: ro.configure.cameraGroupLabel,
  });

  await page.getByTestId("global-settings-trigger").tap();
  // `inert` is what a scrim cannot do: a keyboard can activate controls a pointer cannot reach.
  expect(
    await presets.evaluate((node) => node.closest("[inert]") !== null),
  ).toBe(true);

  await page.keyboard.press("Escape");
  expect(
    await presets.evaluate((node) => node.closest("[inert]") !== null),
  ).toBe(false);
});

test("a background control cannot be reached by the keyboard while the sheet is open", async ({
  page,
}) => {
  // The attribute is the mechanism; this is the property. Asserted by *asking* for focus rather than
  // by tabbing, because the trap already stops the ring reaching here — so without this, removing
  // `useBackgroundInert` and keeping the trap would leave every focus assertion green while
  // `element.focus()`, a screen reader's own navigation, and a browser's find-and-focus still landed
  // on the scene behind the sheet.
  const camera = page
    .getByRole("group", { name: ro.configure.cameraGroupLabel })
    .getByRole("button")
    .first();
  const pressedBefore = await camera.getAttribute("aria-pressed");

  await page.getByTestId("global-settings-trigger").tap();
  const focusedAfterAsking = await camera.evaluate((node) => {
    node.focus();
    return document.activeElement === node;
  });

  expect(focusedAfterAsking).toBe(false);
  expect(await isFocusInsideSheet(page)).toBe(true);
  expect(await camera.getAttribute("aria-pressed")).toBe(pressedBefore);
});

test("a tap where a background control stands lands on the scrim, and cancels", async ({
  page,
}) => {
  // The pointer half of the same ruling. A scrim that merely dims would let the tap through to a
  // camera preset and change the scene under a pending choice; `elementFromPoint` is what says which
  // of the two the customer's finger actually reaches.
  const camera = page
    .getByRole("group", { name: ro.configure.cameraGroupLabel })
    .getByRole("button")
    .first();
  const pressedBefore = await camera.getAttribute("aria-pressed");
  const box = await camera.boundingBox();
  if (!box) throw new Error("the camera presets are not laid out");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.getByTestId("global-settings-trigger").tap();
  const hitTestId = await page.evaluate(
    (at) =>
      document.elementFromPoint(at.x, at.y)?.getAttribute("data-testid") ??
      null,
    point,
  );

  expect(hitTestId).toBe("global-settings-scrim");

  // **Aimed at the preset, not at the scrim's centre**, and that distinction is the test. The scrim
  // spans the whole viewport, so its centre is 194 px down — inside the sheet, which covers the
  // lower 77 dvh — and a bare `.tap()` waits forever for a point the sheet is standing on. Tapping
  // at the preset's own coordinates is also the literal claim: the finger goes where the customer
  // aims it, and the scrim is what receives it.
  await page.getByTestId("global-settings-scrim").tap({ position: point });

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await camera.getAttribute("aria-pressed")).toBe(pressedBefore);
});

test("cancels on Escape after focus has left the controls, and returns focus to the trigger", async ({
  page,
}) => {
  await page.getByTestId("global-settings-trigger").tap();
  await page.keyboard.press("Tab");

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("global-settings-trigger");
});

test("writes nothing when it is cancelled, and returns focus to the trigger", async ({
  page,
}) => {
  const summary = pillSummary(page);
  const before = await summary.innerText();
  const stored = await storedSettings(page);

  await page.getByTestId("global-settings-trigger").tap();
  await dearestTierIn(page, "material").check();
  await page.getByTestId("global-settings-cancel").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await summary.innerText()).toBe(before);
  // Not merely "the chips did not move": the document itself is untouched, timestamp included.
  expect(await storedSettings(page)).toEqual(stored);
  expect(await focusedTestId(page)).toBe("global-settings-trigger");
});

test("writes nothing when it is applied with nothing chosen", async ({
  page,
}) => {
  // Opening the sheet and pressing *Aplică* is not a change, so it must not stamp the book's
  // defaults into the document — and must not bump `updatedAt`, which is what a save is keyed on.
  const stored = await storedSettings(page);

  await page.getByTestId("global-settings-trigger").tap();
  await page.getByTestId("global-settings-apply").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await storedSettings(page)).toEqual(stored);
});

test("writes only the group that changed", async ({ page }) => {
  const before = await storedSettings(page);

  await page.getByTestId("global-settings-trigger").tap();
  await dearestTierIn(page, "hardware").check();
  await page.getByTestId("global-settings-apply").tap();
  const after = await storedSettings(page);

  expect(after.hardwareTierId).not.toBe(before.hardwareTierId);
  expect(after.hardwareTierId).not.toBe("");
  // The material key is left exactly as it was — a command per setting, never one write of both.
  expect(after.materialTierId).toBe(before.materialTierId);
});

test("applies the chosen tier, and the pill and the total follow it", async ({
  page,
}) => {
  const summary = pillSummary(page);
  const before = await summary.innerText();

  await page.getByTestId("global-settings-trigger").tap();
  const figureBefore = await page
    .getByTestId("global-settings-figure")
    .innerText();
  await dearestTierIn(page, "material").check();
  await page.getByTestId("global-settings-apply").tap();

  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  expect(await summary.innerText()).not.toBe(before);
  expect(await focusedTestId(page)).toBe("global-settings-trigger");

  await page.getByTestId("global-settings-trigger").tap();
  expect(await page.getByTestId("global-settings-figure").innerText()).not.toBe(
    figureBefore,
  );
});

/**
 * **The direction the forward sweep above cannot see, and the one a real defect was found in.**
 *
 * The shipped `trapTab` wrapped only when `document.activeElement` was exactly one of the ring's
 * ends. On open, focus is on the dialog container itself — `tabIndex={-1}`, focusable but not a tab
 * stop — which is neither end, so the handler declined to act. Forward that was harmless, because
 * the browser's own next stop is already inside the sheet; **backwards it was not**, because the
 * previous tabbable is the trigger, and the trigger's band is deliberately the one band
 * `useBackgroundInert` leaves live. Measured in a browser before the fix: one Shift+Tab reached
 * `global-settings-trigger`, a second reached `<body>`.
 *
 * `whereTabMustLand` now asks whether the keypress *would leave*, which makes "focus is not on any
 * of this dialog's stops" a case of its own. This test states the ruling — focus cannot leave a
 * modal sheet — rather than that implementation, so it stays honest if the rule is rewritten again.
 */
test("does not let Shift+Tab leave the sheet either, including from the element it opens focused on", async ({
  page,
}) => {
  await page.getByTestId("global-settings-trigger").tap();
  expect(await focusedTestId(page)).toBe("global-settings-surface");

  for (let step = 0; step < MORE_TAB_STOPS_THAN_THE_SHEET_HAS; step += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await isFocusInsideSheet(page),
      `after ${String(step + 1)} back-tabs`,
    ).toBe(true);
  }
});

test("cancels on Escape from every stop in the ring, not only from the first", async ({
  page,
}) => {
  // The handler is on the document precisely so that where focus has got to does not matter. Swept
  // rather than sampled, because a later move of the listener onto the dialog would still pass a
  // single-position check.
  for (let stop = 0; stop <= 4; stop += 1) {
    await page.getByTestId("global-settings-trigger").tap();
    for (let step = 0; step < stop; step += 1) await page.keyboard.press("Tab");

    await page.keyboard.press("Escape");

    await expect(
      page.getByTestId("global-settings-surface"),
      `from stop ${String(stop)}`,
    ).toHaveCount(0);
    expect(await focusedTestId(page), `from stop ${String(stop)}`).toBe(
      "global-settings-trigger",
    );
  }
});
