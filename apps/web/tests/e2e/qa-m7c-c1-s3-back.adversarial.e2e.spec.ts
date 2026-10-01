// M7C wave C1 slice S3 adversarial QA (docs/WORKFLOW.md step 3), at 390 x 844 by touch: criteria 3a,
// 3b, 3c and 4 of `docs/milestones/M7C-m7-feedback-fixes.md`, *C1*. The desktop half is
// `top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts`; `support/qa-m7c-c1-s3-back.ts` holds what the
// two share.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row and the
// `seededDesign` fixture deletes it (ADR 0006).
import { expect } from "@playwright/test";

import {
  ACTIONS_GAP_PX,
  APPROVED_COPY,
  MATERIAL_CONFIRMATION,
  actionsCentreOffset,
  reachTheMaterialConfirmation,
  captureEvidence,
  CONFIRM,
  DIALOG,
  SCRIM,
  STAY,
  isRoomUrl,
  liveBandsBehindTheDialog,
  openTheQuestion,
  press,
  readDialogFit,
  recordRequests,
  type BackLinkTestId,
} from "./support/qa-m7c-c1-s3-back";
import {
  issueShareLink,
  openSeededDesign,
  openSharedDesign,
  test,
  type Locale,
} from "./support/seeded-design";

const PHONE_BACK_LINKS: readonly BackLinkTestId[] = [
  "top-bar-back",
  "bottom-bar-back",
];
const LOCALES: readonly Locale[] = ["ro", "ru"];
const PHONE = { width: 390, height: 844 };

for (const linkTestId of PHONE_BACK_LINKS) {
  test(`${linkTestId}, tapped: asks without navigating; Stay, Escape and the backdrop each close it with focus back on the link`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign);
    const designUrl = page.url();
    const requests = recordRequests(page);
    const dismissals = [
      () => press(page, page.getByTestId(STAY)),
      () => page.keyboard.press("Escape"),
      () => page.getByTestId(SCRIM).tap({ position: { x: 6, y: 6 } }),
    ];

    for (const dismiss of dismissals) {
      await openTheQuestion(page, linkTestId);
      expect(page.url()).toBe(designUrl);
      expect(await liveBandsBehindTheDialog(page)).toEqual([]);

      await dismiss();

      await expect(page.getByTestId(DIALOG)).toHaveCount(0);
      await expect(page.getByTestId(linkTestId)).toBeFocused();
      expect(page.url()).toBe(designUrl);
      await expect(page.locator("main > [inert]")).toHaveCount(0);
    }
    expect(
      requests.filter((request) => request.method !== "GET"),
      JSON.stringify(requests),
    ).toEqual([]);
  });

  test(`${linkTestId}, confirmed: Step 1 opens at 1D on the link's own href with every field filled, nothing is written, the design stays at its link and /ro resumes it`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign);
    const designUrl = page.url();
    const href = await page.getByTestId(linkTestId).getAttribute("href");
    await openTheQuestion(page, linkTestId);
    const requests = recordRequests(page);

    await press(page, page.getByTestId(CONFIRM));

    await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
      "data-room-substate",
      "1D",
    );
    const landed = new URL(page.url());
    expect(landed.pathname + landed.search).toBe(href);
    for (const field of ["wallA", "wallB", "height"]) {
      await expect(page.getByTestId(`room-length-${field}`)).not.toHaveValue(
        "",
      );
    }
    const detail = JSON.stringify(requests);
    expect(
      requests.filter((request) => request.method !== "GET"),
      detail,
    ).toEqual([]);
    expect(
      requests.filter((request) => request.pathname.startsWith("/api/")),
      detail,
    ).toEqual([]);

    await page.goto("/ro");
    await expect(page).toHaveURL(designUrl);
    await expect(page.getByTestId("top-bar-title")).toBeVisible();
  });
}

for (const locale of LOCALES) {
  test(`in ${locale} the dialog holds exactly the approved heading, sentence and two centred buttons, and fits 390 x 844 with nothing cut and no sideways scroll`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign, { locale });
    await openTheQuestion(page, "bottom-bar-back");

    const fit = await readDialogFit(page);
    const detail = JSON.stringify(fit);
    const approved = APPROVED_COPY[locale];

    const parts = [fit.title, fit.body, fit.stay, fit.confirm];
    console.log(`DIALOG_FIT back ${locale} ${detail}`);

    expect(parts.map((part) => part.text)).toEqual([
      approved.title,
      approved.body,
      approved.stay,
      approved.confirm,
    ]);
    await expect(page.getByTestId(DIALOG).locator("button")).toHaveCount(2);
    const named = page.getByRole("dialog", {
      name: approved.title,
      exact: true,
    });
    await expect(named).toBeVisible();
    await expect(named).toHaveAccessibleDescription(approved.body);
    expect(fit.title.bottom, detail).toBeLessThanOrEqual(fit.body.top);
    expect(fit.title.fontSizePx, detail).toBeGreaterThan(fit.body.fontSizePx);
    expect(fit.title.fontWeight, detail).toBeGreaterThan(fit.body.fontWeight);
    expect(actionsCentreOffset(fit), detail).toBeLessThanOrEqual(1);
    expect(fit.confirm.left - fit.stay.right, detail).toBe(ACTIONS_GAP_PX);
    expect(fit.viewport, detail).toEqual(PHONE);
    expect(fit.pageScrollWidth, detail).toBeLessThanOrEqual(PHONE.width);
    for (const box of [fit.dialog, ...parts]) {
      expect(box.left, detail).toBeGreaterThanOrEqual(0);
      expect(box.right, detail).toBeLessThanOrEqual(PHONE.width);
      expect(box.top, detail).toBeGreaterThanOrEqual(0);
      expect(box.bottom, detail).toBeLessThanOrEqual(PHONE.height);
    }
    for (const part of parts) {
      expect(part.overflowX, detail).toBeLessThanOrEqual(1);
      expect(part.overflowY, detail).toBeLessThanOrEqual(1);
    }
    await captureEvidence(page, `dialog-final-${locale}-390.png`);
  });
}

test("the settings sheet's material-change confirmation is not centred: its actions start at the footer's own padding, under its heading, and Escape steps back to the choices", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await reachTheMaterialConfirmation(page);

  const fit = await readDialogFit(page, MATERIAL_CONFIRMATION);
  const detail = JSON.stringify(fit);
  console.log(`DIALOG_FIT material ro ${detail}`);

  expect(fit.footer.justifyContent, detail).toBe("space-between");
  expect(fit.stay.left, detail).toBe(fit.footer.left + fit.footer.paddingLeft);
  expect(fit.confirm.left - fit.stay.right, detail).toBe(ACTIONS_GAP_PX);
  expect(fit.title.bottom, detail).toBeLessThanOrEqual(fit.body.top);
  expect(fit.title.text, detail).not.toBe("");
  expect(fit.body.text, detail).not.toBe("");
  const surface = page.getByTestId(MATERIAL_CONFIRMATION.dialogTestId);
  await expect(surface).toHaveAccessibleName(fit.title.text);

  await page.keyboard.press("Escape");
  await expect(surface).toHaveAttribute("data-step", "choosing");
});

test("the shared variant draws neither back link and no dialog", async ({
  page,
  seededDesign,
  browser,
}) => {
  await openSeededDesign(page, seededDesign);
  const sharePath = await issueShareLink(page, seededDesign);
  const stranger = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
  });
  try {
    const visitor = await stranger.newPage();
    await openSharedDesign(visitor, sharePath);

    await expect(visitor.getByTestId("top-bar-title")).toBeVisible();
    await expect(visitor.getByTestId("top-bar-back")).toHaveCount(0);
    await expect(visitor.getByTestId("bottom-bar-back")).toHaveCount(0);
    await expect(visitor.getByTestId("review-cta")).toHaveCount(0);
    await expect(visitor.getByTestId(DIALOG)).toHaveCount(0);
  } finally {
    await stranger.close();
  }
});

test("the review CTA is still text: a span with no role, no tab stop, no pointer cursor and no handler, and a tap on it does nothing", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();
  const requests = recordRequests(page);
  const reviewCta = page.getByTestId("review-cta");

  const read = await reviewCta.evaluate((element) => {
    const reactProps = Object.entries(element).find(([key]) =>
      key.startsWith("__reactProps$"),
    )?.[1] as Record<string, unknown> | undefined;
    return {
      tagName: element.tagName,
      role: element.getAttribute("role"),
      tabIndex: element.getAttribute("tabindex"),
      cursor: getComputedStyle(element).cursor,
      hasReactProps: reactProps !== undefined,
      handlers: Object.keys(reactProps ?? {}).filter((name) =>
        name.startsWith("on"),
      ),
    };
  });
  await reviewCta.tap();

  expect(read).toEqual({
    tagName: "SPAN",
    role: null,
    tabIndex: null,
    cursor: "auto",
    hasReactProps: true,
    handlers: [],
  });
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  expect(
    requests.filter((request) => request.method !== "GET"),
    JSON.stringify(requests),
  ).toEqual([]);
});

test("the browser's own Back leaves the editor for Step 1 without the question (recorded, not ruled)", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);

  await page.goBack();

  // The owner's ask (Q1) names the back *link*; nothing rules on the browser's button. This records
  // what it does today so a change to it is seen.
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(isRoomUrl(page.url())).toBe(true);
});

test("two activations of the link in one tick open one dialog, and two of Confirm leave one history entry", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();

  await page.getByTestId("bottom-bar-back").evaluate((link) => {
    (link as HTMLElement).click();
    (link as HTMLElement).click();
  });
  await expect(page.getByTestId(DIALOG)).toHaveCount(1);
  expect(page.url()).toBe(designUrl);

  await page.getByTestId(CONFIRM).evaluate((confirm) => {
    (confirm as HTMLElement).click();
    (confirm as HTMLElement).click();
  });
  await expect(page.locator("main[data-room-substate]")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(designUrl);
});
