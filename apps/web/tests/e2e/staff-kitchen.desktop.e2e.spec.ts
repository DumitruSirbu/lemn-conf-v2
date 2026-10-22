// One client's kitchen as staff open it on a desktop, signed in by a real session planted on the test database: the
// three columns, the request, the profile and the notes; a note added once; a status saved; the "changed meanwhile"
// refusal read from a second browser context; and a hidden kitchen made visible again through the confirmation.
//
// Each test that writes uses a kitchen of its own, so no test reads what another wrote. The world is removed in
// `afterAll`, which proves nothing is left, the audit rows the application wrote while the tests ran included.
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
  statusSaveButton,
  statusSelect,
} from "./support/staff-pages";

const PLANTED_NOTES = ["Prima nota", "A doua nota", "A treia nota"];

let world: StaffWorld;
let openedId = "";
let noteId = "";
let statusId = "";
let conflictId = "";
let hiddenId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  const plantWithNotes = (word: string): Promise<string> =>
    plantSentKitchen(world, {
      name: `${world.marker} ${word}`,
      status: "contacted",
      notes: PLANTED_NOTES,
    });
  openedId = await plantWithNotes("deschisa");
  noteId = await plantWithNotes("nota");
  statusId = await plantWithNotes("status");
  conflictId = await plantWithNotes("conflict");
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

test("a sent kitchen opens in three columns, with the request, the client, the three notes and the log caption", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  await openStaffKitchen(page, openedId);

  const view = await page.getByTestId("staff-kitchen-view").boundingBox();
  const summary = await page.getByTestId("staff-kitchen-summary").boundingBox();
  const status = await page.getByTestId("staff-kitchen-status").boundingBox();
  const notes = await page.getByTestId("staff-notes").boundingBox();
  expect(
    view && summary && status && notes,
    "every column is drawn",
  ).toBeTruthy();
  // The picture and the configuration share the first column; the request is in the second and the notes in the third.
  expect(summary?.x).toBe(view?.x);
  expect(view?.x).toBeLessThan(status?.x ?? 0);
  expect(status?.x).toBeLessThan(notes?.x ?? 0);
  expect(Math.abs((view?.y ?? 0) - (status?.y ?? 99_999))).toBeLessThan(40);
  expect(Math.abs((status?.y ?? 0) - (notes?.y ?? 99_999))).toBeLessThan(40);
  await expect(page.getByTestId("staff-notes-count")).toHaveText(
    romanian("staffNotes.count", { count: PLANTED_NOTES.length }),
  );
  await expect(page.getByTestId("staff-kitchen-request")).toContainText("FX-");
  await expect(page.getByText(world.client.email).first()).toBeVisible();
  await expect(
    page.getByText(romanian("staffKitchen.accessLogged")),
  ).toBeVisible();
  await expect(page.getByTestId("staff-kitchen-last-change")).toBeVisible();
  await shootForReview(page, "desktop-kitchen-1920");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await pageScrollsSideways(page), "1440 px").toBe(false);
  await shootForReview(page, "desktop-kitchen-1440");
});

test("a note added is saved once, shown first, and the field is empty again", async ({
  page,
}) => {
  const text = `Am sunat clientul ${world.marker}`;
  await openStaffKitchen(page, noteId);
  const before = (await countOf(world)).designNotes;

  await noteField(page).fill(text);
  await saveNoteButton(page).click();

  await expect(savedNote(page, text)).toHaveCount(1);
  await expect(savedNote(page, text)).toBeVisible();
  await expect(noteField(page)).toHaveValue("");
  await expect(page.getByText(romanian("staffNotes.saved"))).toBeVisible();
  await expect(page.getByTestId("staff-notes-count")).toHaveText(
    romanian("staffNotes.count", { count: PLANTED_NOTES.length + 1 }),
  );
  expect((await countOf(world)).designNotes, "one row stored").toBe(before + 1);
  await shootForReview(page, "desktop-kitchen-note-saved");
});

test("a status chosen and saved reads 'Status salvat' and names who changed it", async ({
  page,
}) => {
  await openStaffKitchen(page, statusId);

  await statusSelect(page).selectOption("offer-sent");
  await statusSaveButton(page).click();

  await expect(statusSaveButton(page)).toHaveText(
    romanian("staffActions.statusSaved"),
  );
  await expect(page.getByTestId("staff-kitchen-status")).toContainText(
    romanian("staffKitchens.statusOfferSent"),
  );
  await expect(page.getByTestId("staff-kitchen-last-change")).toContainText(
    "Fixture Account",
  );
});

test("a status saved from a page that read an older one is refused as changed meanwhile, the other member's status stands, and the page then saves from what it re-read", async ({
  browser,
  page,
  context,
}) => {
  // The page sends the status it last read, so the server refuses a save made against a status that has moved on: the
  // other member's status is not overwritten, the page reads the kitchen again, and the choice stays.
  await openStaffKitchen(page, conflictId);
  const storedStatus = async (): Promise<string> => {
    const stored = await context.request.get(
      `/api/staff/kitchens/${conflictId}`,
    );
    return ((await stored.json()) as { status: { value: string } }).status
      .value;
  };
  const otherContext = await browser.newContext();
  try {
    await signIn(otherContext, world.operator);
    const otherPage = await otherContext.newPage();
    await openStaffKitchen(otherPage, conflictId);
    await statusSelect(otherPage).selectOption("offer-sent");
    await statusSaveButton(otherPage).click();
    await expect(statusSaveButton(otherPage)).toHaveText(
      romanian("staffActions.statusSaved"),
    );

    await statusSelect(page).selectOption("closed");
    await statusSaveButton(page).click();

    await expect(page.getByTestId("staff-status-control")).toContainText(
      romanian("staffActions.statusChangedMeanwhile"),
    );
    expect(await storedStatus(), "the other member's status stands").toBe(
      "offer-sent",
    );
    await expect(page.getByTestId("staff-kitchen-status")).toContainText(
      romanian("staffKitchens.statusOfferSent"),
    );
    await expect(statusSelect(page)).toHaveValue("closed");
    await expect(statusSaveButton(page)).toHaveText(
      romanian("staffActions.statusSave"),
    );

    await statusSaveButton(page).click();

    await expect(statusSaveButton(page)).toHaveText(
      romanian("staffActions.statusSaved"),
    );
    expect(await storedStatus(), "the save from the re-read page").toBe(
      "closed",
    );
  } finally {
    await otherContext.close();
  }
});

test("a hidden kitchen shows its banner, the question focuses 'Anuleaza', and 'Fa-o vizibila' takes the banner away", async ({
  page,
}) => {
  await openStaffKitchen(page, hiddenId);
  const banner = page.getByTestId("staff-kitchen-hidden-banner");
  await expect(banner).toContainText(romanian("staffKitchen.hiddenBanner"));

  await banner
    .getByRole("button", { name: romanian("staffActions.unhideAction") })
    .click();

  const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  await expect(dialog).toContainText(romanian("staffActions.unhideTitle"));
  await expect(
    dialog.getByRole("button", { name: romanian("staffActions.unhideCancel") }),
  ).toBeFocused();
  await shootForReview(page, "desktop-kitchen-unhide-question");
  await dialog
    .getByRole("button", { name: romanian("staffActions.unhideConfirm") })
    .click();

  await expect(banner).toHaveCount(0);
  await expect(
    page.getByTestId("staff-kitchen-unhide-announcement"),
  ).toHaveText(romanian("staffActions.unhideDone"));
});
