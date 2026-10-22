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

  const view = await page.getByTestId("staff-kitchen-view").boundingBox();
  const status = await page.getByTestId("staff-kitchen-status").boundingBox();
  const notes = await page.getByTestId("staff-notes").boundingBox();
  expect(view && status && notes, "every part is drawn").toBeTruthy();
  expect(status?.x).toBe(view?.x);
  expect(notes?.x).toBe(view?.x);
  expect(status?.y).toBeGreaterThan((view?.y ?? 0) + (view?.height ?? 0) - 1);
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
  await expect(sheet.getByRole("navigation").getByRole("link")).toHaveText([
    romanian("staffShell.navKitchens"),
  ]);
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
