import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  issueShareLink,
  openSeededDesign,
  openSharedDesign,
  type SeededDesign,
} from "./seeded-design";

// The forced-replacement sheet in a real browser, with no price book published: a kitchen is stored that names a tier id the
// seeded book does not hold (the save route accepts any identifier of the right shape), which is what a version that deleted
// a tier leaves behind. The sheet offers the active tiers and no figure shows; choosing one shows the price and writes the
// marker; reopening shows neither the sheet nor the notice; the share view shows nothing and never asks for the notice.
//
// What the seeded world cannot do is switch a tier off, or publish a version that deletes one: a global availability write or a
// publish changes every spec's server state. Those paths are proved by the DOM and route tests.

const ro = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ro.json", import.meta.url),
    "utf8",
  ),
) as {
  readonly replacementSheet: {
    readonly unnamedOptionUnavailable: string;
    readonly priceAfterChoosing: string;
  };
};

/** A tier id of the right shape that no book holds: the id of a created class that a later version deleted. */
const VANISHED_MATERIAL_TIER_ID = "material.created-and-since-deleted";

/** Outlasts the first frame's freeze under software GL, as `seeded-design.ts` does for the write-access probe. */
const SHEET_TIMEOUT_MS = 60_000;

/** The control that presses: `tap` on the mobile line (real touch), `click` on the desktop line. */
export type Press = (control: Locator) => Promise<void>;

async function storeDesignNamingAVanishedTier(
  page: Page,
  design: SeededDesign,
): Promise<void> {
  const status = await page.evaluate(
    async ({ id, tierId }) => {
      const loaded = await fetch(`/api/designs/${id}`);
      const { design: stored, revision } = (await loaded.json()) as {
        design: Record<string, unknown>;
        revision: string;
      };
      const written = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify({
          ...stored,
          settings: { ...(stored.settings as object), materialTierId: tierId },
        }),
      });
      return written.status;
    },
    { id: design.id, tierId: VANISHED_MATERIAL_TIER_ID },
  );
  expect(status).toBe(200);
}

function isNoticeRead(designId: string) {
  return (response: {
    url: () => string;
    request: () => { method: () => string };
  }) =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname ===
      `/api/designs/${designId}/price-notice`;
}

function isAcknowledgement(designId: string) {
  return (response: {
    url: () => string;
    request: () => { method: () => string };
  }) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname ===
      `/api/designs/${designId}/price-notice/acknowledge`;
}

async function expectNoSheetAndAPrice(page: Page): Promise<void> {
  await expect(page.getByTestId("replacement-sheet")).toHaveCount(0);
  await expect(page.getByTestId("price-notice")).toHaveCount(0);
  await expect(page.getByTestId("price-bar-total")).toBeVisible({
    timeout: SHEET_TIMEOUT_MS,
  });
}

/** The share view of a kitchen that still names the vanished tier: no sheet, no pending bar, no notice request. */
async function expectShareViewShowsNothing(
  browser: Browser,
  sharePath: string,
): Promise<void> {
  const stranger = await browser.newContext();
  try {
    const sharePage = await stranger.newPage();
    const noticeRequests: string[] = [];
    sharePage.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/price-notice")) {
        noticeRequests.push(request.url());
      }
    });

    await openSharedDesign(sharePage, sharePath);
    await sharePage.waitForTimeout(2000);

    await expect(sharePage.getByTestId("replacement-sheet")).toHaveCount(0);
    await expect(
      sharePage.getByTestId("price-bar-replacement-pending"),
    ).toHaveCount(0);
    await expect(sharePage.getByTestId("price-notice")).toHaveCount(0);
    expect(noticeRequests).toEqual([]);
  } finally {
    await stranger.close();
  }
}

export async function runReplacementSheetJourney({
  page,
  browser,
  design,
  press,
}: {
  readonly page: Page;
  readonly browser: Browser;
  readonly design: SeededDesign;
  readonly press: Press;
}): Promise<void> {
  await storeDesignNamingAVanishedTier(page, design);
  const sharePath = await issueShareLink(page, design);

  // The owner opens it: the sheet is up, offers the active tiers, names nothing, and no figure shows anywhere.
  const firstRead = page.waitForResponse(isNoticeRead(design.id));
  await openSeededDesign(page, design);
  await firstRead;
  const sheet = page.getByTestId("replacement-sheet");
  await expect(sheet).toBeVisible({ timeout: SHEET_TIMEOUT_MS });
  await expect(sheet).toContainText(
    ro.replacementSheet.unnamedOptionUnavailable,
  );
  await expect(sheet).not.toContainText(VANISHED_MATERIAL_TIER_ID);
  await expect(page.getByTestId("price-bar-total")).toHaveCount(0);
  await expect(page.getByTestId("price-bar-replacement-pending")).toHaveText(
    ro.replacementSheet.priceAfterChoosing,
  );
  await expect(page.getByTestId("design-load-error")).toHaveCount(0);

  await press(page.getByTestId("replacement-choose"));
  const options = page.locator("[data-option]");
  await expect(options).toHaveCount(3);
  await expect(page.locator("[data-option][disabled]")).toHaveCount(0);
  await expect(page.locator('[data-option][aria-pressed="true"]')).toHaveCount(
    0,
  );
  await expect(page.getByTestId("replacement-apply")).toBeDisabled();

  // The share view of the same kitchen, while it still names the vanished tier, shows no sheet and asks for no notice.
  await expectShareViewShowsNothing(browser, sharePath);

  // Choosing a tier saves, asks again once the save has landed, shows the price, and writes the marker.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${design.id}`,
  );
  const acknowledged = page.waitForResponse(isAcknowledgement(design.id));
  await press(options.first());
  await press(page.getByTestId("replacement-apply"));
  expect((await saved).status()).toBe(200);
  expect((await acknowledged).status()).toBe(200);
  await expectNoSheetAndAPrice(page);
  await expect(page.getByTestId("replacement-confirmation")).toBeVisible();

  // Reopened, the kitchen shows neither the sheet nor the notice, and its price.
  const secondRead = page.waitForResponse(isNoticeRead(design.id));
  await openSeededDesign(page, design);
  await secondRead;
  await expectNoSheetAndAPrice(page);
}
