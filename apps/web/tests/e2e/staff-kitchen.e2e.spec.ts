// One client's kitchen as staff open it at 390 x 844, signed in by a real session planted on the test database: one column
// and no sideways scroll, the "Meniu" sheet an operator gets, a note added once, and a hidden kitchen made visible again.
//
// The desktop half is `staff-kitchen.desktop.e2e.spec.ts`. The world is removed in `afterAll`, which proves nothing is
// left behind.
import { expect, test } from "@playwright/test";

import {
  countOf,
  NOTHING_LEFT,
  plantOtherKitchen,
  plantSentKitchen,
  plantStaffWorld,
  removeStaffWorld,
  romanian,
  signIn,
  type StaffWorld,
} from "./support/staff-world";
import {
  expectKitchensLinkLabelled,
  noteField,
  openStaffKitchen,
  pageScrollsSideways,
  savedNote,
  saveNoteButton,
  shootForReview,
} from "./support/staff-pages";

let world: StaffWorld;
let openedId = "";
let hiddenId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  openedId = await plantSentKitchen(world, {
    name: `${world.marker} deschisa`,
    status: "contacted",
    notes: ["Prima nota", "A doua nota", "A treia nota"],
  });
  hiddenId = await plantOtherKitchen(
    world,
    "hidden",
    `${world.marker} ascunsa`,
  );
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, world.operator);
});

test("the columns stack in one, the page does not scroll sideways, and the field and the button are reachable", async ({
  page,
}) => {
  await openStaffKitchen(page, openedId);

  // The one reading order of every width (ADR 0185 decision 6): the picture, the cabinet list, the client, the request, the
  // price, the status, the access line, the notes.
  const readingOrder = [
    "staff-kitchen-view",
    "staff-kitchen-cabinets",
    "staff-kitchen-profile",
    "staff-kitchen-request",
    "staff-kitchen-estimates",
    "staff-kitchen-status",
    "staff-kitchen-access-log",
    "staff-notes",
  ];
  const boxes = [];
  for (const testId of readingOrder) {
    boxes.push({
      testId,
      box: await page.getByTestId(testId).boundingBox(),
    });
  }
  const view = boxes[0]?.box;
  for (const { testId, box } of boxes) {
    expect(box, `${testId} is drawn`).toBeTruthy();
    expect(box?.x, `${testId} stands in the one column`).toBe(view?.x);
  }
  for (const [position, { testId, box }] of boxes.entries()) {
    const above = boxes[position - 1];
    if (above?.box === undefined || above.box === null) continue;
    expect(
      box?.y,
      `${testId} stands under ${above.testId}`,
    ).toBeGreaterThanOrEqual(above.box.y + above.box.height - 1);
  }
  expect(await pageScrollsSideways(page), "a horizontal page scroll").toBe(
    false,
  );
  await noteField(page).scrollIntoViewIfNeeded();
  await expect(saveNoteButton(page)).toBeVisible();
  await shootForReview(page, "mobile-kitchen");
});

test("the 'Meniu' sheet holds the operator's one page, the profile and both ways out, and no administrator page", async ({
  page,
}) => {
  await openStaffKitchen(page, openedId);

  await page.getByTestId("staff-menu-button").click();

  const sheet = page.getByTestId("staff-menu-sheet");
  await expect(sheet).toContainText(world.operator.email);
  await expect(sheet).toContainText(romanian("staffShell.roleOperator"));
  const navLinks = sheet.getByRole("navigation").getByRole("link");
  await expect(navLinks).toHaveCount(1);
  await expectKitchensLinkLabelled(navLinks.first());
  await expect(sheet).not.toContainText(romanian("staffShell.navAudit"));
  await shootForReview(page, "mobile-kitchen-menu");
});

test("a note added is saved once and shown first", async ({ page }) => {
  const text = `Am sunat de pe telefon ${world.marker}`;
  await openStaffKitchen(page, openedId);
  const before = (await countOf(world)).designNotes;

  await noteField(page).fill(text);
  await saveNoteButton(page).click();

  await expect(savedNote(page, text)).toHaveCount(1);
  await expect(noteField(page)).toHaveValue("");
  expect((await countOf(world)).designNotes, "one row stored").toBe(before + 1);
});

test("a hidden kitchen is made visible again through the question, and the banner goes", async ({
  page,
}) => {
  await openStaffKitchen(page, hiddenId);
  const banner = page.getByTestId("staff-kitchen-hidden-banner");

  await banner
    .getByRole("button", { name: romanian("staffActions.unhideAction") })
    .click();
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  await expect(
    dialog.getByRole("button", { name: romanian("staffActions.unhideCancel") }),
  ).toBeFocused();
  await shootForReview(page, "mobile-kitchen-unhide-question");
  await dialog
    .getByRole("button", { name: romanian("staffActions.unhideConfirm") })
    .click();

  await expect(banner).toHaveCount(0);
  await expect(
    page.getByTestId("staff-kitchen-unhide-announcement"),
  ).toHaveText(romanian("staffActions.unhideDone"));
});
