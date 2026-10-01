import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  mintSeededDesign,
  openUnavailableDesign,
} from "./support/seeded-design";

/**
 * M7 wave 7E3b, S4 — criterion 7, the desktop half of `design-owner-gate.e2e.spec.ts`. The plan asks
 * for both projects (`playwright.config.ts`'s `testMatch` ties a project to a file name, following
 * `top-bar.e2e.spec.ts` / `top-bar.desktop.e2e.spec.ts`'s pattern, and `visitor-identity.e2e.spec.ts`
 * / `visitor-identity.desktop.e2e.spec.ts`'s own twin for the same reason). The assertions are
 * identical on purpose: the gate's refusal does not vary with viewport. The copy assertion itself
 * lives in `openUnavailableDesign` now (review round 2, L1.5/C1.1), so every caller gets it for free.
 */

test("a foreign visitor's /d/{id} answers the unavailable refusal, with no probe and an untouched jar", async ({
  page,
  context,
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const foreign = await mintSeededDesign(ownerPage);
  const own = await mintSeededDesign(page);
  try {
    const before = await context.cookies();

    await openUnavailableDesign(page, `/ro/d/${foreign.id}`, foreign.id);
    await expect(page.locator("canvas")).toHaveCount(0);

    expect(await context.cookies()).toEqual(before);
  } finally {
    await ownerContext.close();
    await deleteMintedDesigns([foreign.id, own.id]);
  }
});

test("a cookie-less context's /d/{id} answers the unavailable refusal, with no probe and no cookie ever set", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const design = await mintSeededDesign(ownerPage);
  const strangerContext = await browser.newContext();
  try {
    const strangerPage = await strangerContext.newPage();
    const before = await strangerContext.cookies();
    expect(before).toEqual([]);

    await openUnavailableDesign(strangerPage, `/ro/d/${design.id}`, design.id);
    await expect(strangerPage.locator("canvas")).toHaveCount(0);

    expect(await strangerContext.cookies()).toEqual([]);
  } finally {
    await ownerContext.close();
    await strangerContext.close();
    await deleteMintedDesigns([design.id]);
  }
});
