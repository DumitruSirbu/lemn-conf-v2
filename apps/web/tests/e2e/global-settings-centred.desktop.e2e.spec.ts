import { expect, type Page } from "@playwright/test";

import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **The whole-kitchen settings modal, centred in the viewport** — the owner's ruling of 2026-09-09,
 * *"center this modal"*, with a screenshot at 1440.
 *
 * Frame D2E `:961` hangs this surface from the **pill's right edge** and draws it 900 px wide there,
 * which is exactly what the stylesheet did. The pill stands left of the price, the CTA and the
 * locale, so that box landed left of centre — and further left than that phrase suggests. Measured
 * before the change, the surface's left edge was at **x = −453 at a 900 px viewport, −301 at 1100
 * and −9 at 1440**: at the three narrower widths part of the modal was outside the screen, and only
 * 1920 kept it whole. The frame is superseded on the horizontal and recorded as superseded in
 * `global-settings.module.css`.
 *
 * **The vertical is asserted as *unchanged*, not as correct.** The owner asked about horizontal
 * placement, so moving the surface down or up as a side effect of centring would be a change nobody
 * requested. Centring required leaving the pill's positioning context — nothing in the ancestry is
 * viewport-wide — so the hang is restated as arithmetic in the stylesheet, and this file pins the
 * number it produces against the one measured before the change: **90.5 at every width**.
 */

/** A viewport resize re-projects the scene over several frames; `openSeededDesign` does not wait on
 *  that, and a box read the instant it returns can race it (review round 1, R1.2). */
const SCENE_SETTLE_MS = 2000;

/** Sub-pixel layout rounding: a centre at 719.9999 is centred. The owner's ruling is about where the
 *  box sits, and half a pixel is below what any screen can draw. */
const HALF_A_PIXEL = 0.5;

/** Frame D2E's own width, and the guard that keeps it inside a narrow screen. */
const DRAWN_WIDTH_PX = 900;
const VIEWPORT_MARGIN_PX = 48;

/** The hang measured before the centring change, at every width. The vertical must not move. */
const HANG_TOP_PX = 90.5;

/** 900 is the shell's own switch point, where `max-width` binds; 1920 is what frame D2E is drawn at;
 *  1100 and 1440 are between, and 1440 is the owner's screenshot. */
const WIDTHS = [900, 1100, 1440, 1920] as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function openSettingsAt(
  page: Page,
  seededDesign: SeededDesign,
  width: number,
): Promise<Box> {
  await page.setViewportSize({ width, height: 900 });
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await page.getByTestId("global-settings-trigger").click();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();

  const box = await page.getByTestId("global-settings-surface").boundingBox();
  if (!box) throw new Error("the settings modal is not laid out");
  return box;
}

test.describe("the settings modal is centred in the viewport", () => {
  for (const width of WIDTHS) {
    test(`puts its horizontal centre on the viewport's at ${String(width)} px`, async ({
      page,
      seededDesign,
    }) => {
      const surface = await openSettingsAt(page, seededDesign, width);

      expect(surface.x + surface.width / 2).toBeCloseTo(width / 2, 1);
      // Stated as the two margins as well, because a centred box and a box that happens to have a
      // centred *centre* while overflowing both edges are different things.
      const leftMargin = surface.x;
      const rightMargin = width - (surface.x + surface.width);
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(
        HALF_A_PIXEL,
      );
      expect(leftMargin).toBeGreaterThanOrEqual(0);
    });

    /** **The vertical did not move.** One assertion per width rather than one overall, so a shell
     *  that moved the modal at a single width fails naming it. */
    test(`keeps the hang it already had at ${String(width)} px`, async ({
      page,
      seededDesign,
    }) => {
      const surface = await openSettingsAt(page, seededDesign, width);

      expect(surface.y).toBeCloseTo(HANG_TOP_PX, 1);
    });
  }

  /** **M6-AUD-016's guard still binds, and centring did not cost it.** At the shell's own switch
   *  point the surface is narrower than frame D2E's 900 and keeps `calc(100vw - 48px)` — which,
   *  centred, is exactly 24 px a side. A rule that centred the *declared* width instead would push
   *  the box off both edges here. */
  test("clamps to the viewport at 900 px and stays centred inside the clamp", async ({
    page,
    seededDesign,
  }) => {
    const width = 900;
    const surface = await openSettingsAt(page, seededDesign, width);

    expect(surface.width).toBeCloseTo(width - VIEWPORT_MARGIN_PX, 1);
    expect(surface.width).toBeLessThan(DRAWN_WIDTH_PX);
    expect(surface.x).toBeCloseTo(VIEWPORT_MARGIN_PX / 2, 1);
  });

  /** Frame D2E's width is kept wherever there is room for it, so the clamp above is a clamp and not
   *  the new width. */
  test("keeps frame D2E's own 900 px wherever the screen has room", async ({
    page,
    seededDesign,
  }) => {
    const surface = await openSettingsAt(page, seededDesign, 1440);

    expect(surface.width).toBeCloseTo(DRAWN_WIDTH_PX, 1);
  });

  /** The modal is centred; the **breakdown's popover is not**, and must not follow it
   *  (M6-AUD-013). That surface is deliberately non-modal and hangs from the figure it explains, so
   *  the divergence is asserted on screen rather than left to the stylesheets' comments. */
  test("leaves the breakdown's popover hanging from its own trigger", async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededDesign(page, seededDesign);
    await page.waitForTimeout(SCENE_SETTLE_MS);
    await page.getByTestId("price-breakdown-trigger").click();

    const popover = await page
      .getByTestId("price-breakdown-surface")
      .boundingBox();
    if (!popover) throw new Error("the breakdown popover is not laid out");

    expect(Math.abs(popover.x + popover.width / 2 - 720)).toBeGreaterThan(1);
  });
});
