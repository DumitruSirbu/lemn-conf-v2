// What the editor does with `?select=` and `?settings=open`, at 390 x 844 by touch: once, on arrival, for a body the
// design holds; nothing for anything else; and nothing a second time.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import { expect, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  expectEditorReady,
  expectReviewDrawn,
  historyLength,
  openReview,
  settingsSheet,
} from "./support/qa-8d-review";
import { test } from "./support/seeded-design";
import { U_MIDDLE, seedKitchen } from "./support/ssr-html";

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

test("in a U, the edit link of every group, wall C's among them, opens the editor with that group's first body selected and its panel open", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
      const wanted = new URL(group.href, page.url()).searchParams.get("select");
      await page.locator(`a[href="${group.href}"]`).tap();
      await page.waitForURL(`/ro/d/${kitchen.id}`);
      await expectEditorReady(page);
      await page.waitForTimeout(ARRIVAL_SETTLE_MS);

      const selected = (await readSelection(page)).selectionId;
      const isPanelOpen = (await page.getByTestId("editor-panel").count()) > 0;
      if (selected !== wanted || !isPanelOpen) {
        arrivedWithoutItsBody.push(
          `${group.heading}: wanted ${String(wanted)}, selected ${JSON.stringify(selected)}, panel ${isPanelOpen ? "open" : "closed"}`,
        );
      }

      if (isPanelOpen) await page.getByTestId("panel-close").tap();
      await page.goBack();
      await expectReviewDrawn(page);
    }

    expect(arrivedWithoutItsBody).toEqual([]);
  } finally {
    await deleteMintedDesigns(minted);
  }
});
