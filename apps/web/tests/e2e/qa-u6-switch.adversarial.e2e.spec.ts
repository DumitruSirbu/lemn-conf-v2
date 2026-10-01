// M7B U6 adversarial QA (docs/WORKFLOW.md step 3), at 390 x 844 (mobile). Two claims the switch's own
// specs leave open:
// - the U's real flow through a room too small for its kitchen, to a stranger's share view
//   (`support/qa-u6-journey.ts`; the desktop half is `qa-u6-switch.adversarial.desktop.e2e.spec.ts`);
// - the strict 1B fit for a U, which census rows E7 and E10 left "to be re-measured": with the shape
//   refusal gone and no corner toggle (ADR 0132 decision 8), a U's 1B column holds its fields without
//   scrolling — measured 2026-09-30 at 0 px of overflow and 82 px of slack, ro and ru alike.
//
// **Must not run concurrently with any other persistence live run**: the journey mints a real row,
// and `deleteMintedDesigns` in `afterAll` deletes it (ADR 0006).
import { expect, test, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { runTooSmallUJourney } from "./support/qa-u6-journey";

const LOCALES = ["ro", "ru"] as const;

/** Less than one pixel of an element cut by the column is layout rounding, not an unreachable field. */
const SUB_PIXEL_PX = 1;

test.describe("a too-small U, fixed, composed, reloaded and shared (U6 QA, mobile)", () => {
  test.setTimeout(120_000);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("1A -> U -> 1B -> 1C for its kitchen -> 1D -> the editor -> reload -> a stranger's share view", async ({
    page,
    browser,
  }) => {
    await runTooSmallUJourney(page, browser, mintedIds);
  });
});

interface ColumnFit {
  readonly overflowPx: number;
  readonly lastFieldBottomPx: number;
  readonly contentBottomPx: number;
}

async function oneBColumnFit(page: Page): Promise<ColumnFit> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    if (column === null) throw new Error("no column scrolls the fields");
    const paddingBottom = Number.parseFloat(
      getComputedStyle(column).paddingBottom,
    );
    const fieldBottoms = [...fields.querySelectorAll("input")].map(
      (input) => (input.parentElement ?? input).getBoundingClientRect().bottom,
    );
    return {
      overflowPx: column.scrollHeight - column.clientHeight,
      lastFieldBottomPx: Math.max(...fieldBottoms),
      contentBottomPx: column.getBoundingClientRect().bottom - paddingBottom,
    };
  });
}

for (const locale of LOCALES) {
  test(`a U room's length fields are not clipped by 1B's column, with no shape refusal, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?shape=U`);
    await expect(page.getByTestId("room-length-wallC")).toBeVisible();
    await expect(
      page.getByTestId("room-shape-refusal-status").locator("*"),
    ).toHaveCount(0);

    const fit = await oneBColumnFit(page);

    expect(fit.overflowPx, JSON.stringify(fit)).toBe(0);
    expect(fit.lastFieldBottomPx, JSON.stringify(fit)).toBeLessThanOrEqual(
      fit.contentBottomPx + SUB_PIXEL_PX,
    );
  });
}
