import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  expectWriteAccessApplied,
  issueShareLink,
  mintSeededDesign,
  openSeededDesign,
} from "./support/seeded-design";

/**
 * D10's share control, end to end: create → copy → open in a fresh context → revoke → not
 * available. Mobile project only — the control's own touch targets are what §10.1 requires, and the
 * 390 × 844 viewport is where the settings sheet is at its tightest.
 *
 * The design minted here is deleted afterwards (ADR 0006).
 */

test("create, copy, open in a fresh context, revoke, then not available", async ({
  page,
  browser,
  context,
}) => {
  const design = await mintSeededDesign(page);
  try {
    await openSeededDesign(page, design);

    await page.getByTestId("global-settings-trigger").tap();
    const shareSection = page.getByTestId("share-design");
    await expect(shareSection).toBeVisible();

    await page.getByTestId("share-design-create").tap();
    const linkField = page.getByTestId("share-design-link");
    await expect(linkField).toBeVisible();
    const fullUrl = await linkField.inputValue();
    const sharePath = new URL(fullUrl).pathname;
    expect(sharePath).toMatch(/^\/s\/[0-9A-Za-z]{12}$/);

    // The copy button, proven against the real clipboard rather than assumed from the label change.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("share-design-copy").tap();
    await expect(page.getByTestId("share-design-copy")).toHaveText("Copiat");
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(fullUrl);

    // A fresh context: no owner write-token cookie, no visitor cookie — a stranger holding only the
    // link (criterion 9's own scan, driven here rather than asserted against raw HTML).
    const visitorContext = await browser.newContext();
    try {
      const visitorPage = await visitorContext.newPage();
      await visitorPage.goto(sharePath);
      await visitorPage.waitForSelector("canvas", { state: "attached" });
      await expect(visitorPage.getByTestId("top-bar-back")).toHaveCount(0);
      await expect(visitorPage.getByTestId("bottom-bar-back")).toHaveCount(0);
      await expect(visitorPage.getByTestId("review-cta")).toHaveCount(0);
      // The settings trigger itself still renders on every `/d`-shaped screen (G9) — it is
      // `canWrite`'s read-only gating that keeps it locked, the same as an owner's own `/d/{id}`
      // opened without a credential. It is *this* control, `ShareDesign`, that must never appear
      // inside it: a visitor has no write credential to authorise `POST .../share` with.
      await expect(
        visitorPage.getByTestId("global-settings-trigger"),
      ).toBeDisabled();
    } finally {
      await visitorContext.close();
    }

    // "Just issued" offers no revoke button of its own (D10 lists it only under "active"); closing
    // and reopening the sheet re-reads the status (D10: read on the sheet's own open) and lands on
    // "active", which does.
    await page.getByTestId("global-settings-cancel").tap();
    await page.getByTestId("global-settings-trigger").tap();
    await expect(page.getByTestId("share-design-status")).toBeVisible();

    // The owner revokes it — the control returns to its "no link" state.
    await page.getByTestId("share-design-revoke").tap();
    await expect(page.getByTestId("share-design-create")).toBeVisible();

    // The link the visitor held a moment ago answers the unavailable view now.
    const revokedContext = await browser.newContext();
    try {
      const revokedPage = await revokedContext.newPage();
      await revokedPage.goto(sharePath);
      await expect(revokedPage.getByTestId("design-load-error")).toBeVisible();
    } finally {
      await revokedContext.close();
    }
  } finally {
    await deleteMintedDesigns([design.id]);
  }
});

// Review round 1, L1.3: the owner's own browser holds both the share link and the write credential
// at once, so the two views have to keep their own state straight in one session — not merely in
// two separate contexts, which the test above already covers.
test("the owner's own share link is read-only; /d/{id} restores write access; back/forward keeps each", async ({
  page,
}) => {
  const design = await mintSeededDesign(page);
  try {
    await openSeededDesign(page, design);
    const sharePath = await issueShareLink(page, design);

    // The owner opens their own share link — read-only even with both credential cookies in the
    // jar (G5: the view reads no cookie at all, so it cannot tell its own author from a stranger).
    await page.goto(sharePath);
    await page.waitForSelector("canvas", { state: "attached" });
    // The disabled trigger is the whole of this guard (QA round 2, finding R2.4): `ShareDesign`
    // only ever mounts inside the settings sheet, which a disabled trigger can never open, so
    // asserting its own absence here would hold vacuously whether or not G5 still reads no cookie —
    // it is the trigger staying disabled, with the write token sitting unused in the jar, that
    // stands for "holding it changes nothing here."
    await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
    await expect(page.getByTestId("top-bar-back")).toHaveCount(0);

    // Navigating to their own /d/{id} restores full write access.
    await page.goto(`/d/${design.id}`);
    await page.waitForSelector("canvas", { state: "attached" });
    await expectWriteAccessApplied(page);
    await expect(page.getByTestId("top-bar-back")).toBeVisible();

    // Back: the share view again, still read-only — not left writable by whatever `/d/{id}` just
    // set the store to.
    await page.goBack();
    await page.waitForSelector("canvas", { state: "attached" });
    await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
    await expect(page.getByTestId("top-bar-back")).toHaveCount(0);

    // Forward: /d/{id} again, writable.
    await page.goForward();
    await page.waitForSelector("canvas", { state: "attached" });
    await expectWriteAccessApplied(page);
    await expect(page.getByTestId("top-bar-back")).toBeVisible();
  } finally {
    await deleteMintedDesigns([design.id]);
  }
});
