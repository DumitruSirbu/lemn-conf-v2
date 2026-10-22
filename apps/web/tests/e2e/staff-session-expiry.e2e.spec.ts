// K-13 of the Lot 3 plan, across two pages of one browser context (one cookie jar): the session ends under a note being
// typed, the note is pressed and refused, the session sheet comes over the page with the typed text kept, the sign-in link
// opens in a new tab, the person signs in there, and "Am intrat din nou" and a second press save the note exactly once.
//
// How the session ends here: the cookie leaves the jar, which the server reads as no session (a `401`, as a revoked or
// expired session is). How the person signs in again: the same session's cookie goes back into the jar from outside the
// page, which is all a sign-in in the new tab changes for the first page. The login form itself is not driven (it asks
// Turnstile), and no persistence helper can plant a second session for an account.
import { expect, test, type Request } from "@playwright/test";

import {
  countOf,
  NOTHING_LEFT,
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
  savedNote,
  saveNoteButton,
  shootForReview,
} from "./support/staff-pages";

let world: StaffWorld;
let kitchenId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  kitchenId = await plantSentKitchen(world, {
    name: `${world.marker} sesiune`,
    status: "contacted",
    notes: ["O nota veche"],
  });
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

function isNotePost(request: Request): boolean {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === `/api/staff/kitchens/${kitchenId}/notes`
  );
}

test("a note typed when the session ends is kept, and is saved exactly once after signing in again in a new tab", async ({
  context,
  page,
}) => {
  const text = `Nota scrisa cat a expirat sesiunea ${world.marker}`;
  const notePosts: Request[] = [];
  await signIn(context, world.operator);
  await openStaffKitchen(page, kitchenId);
  page.on("request", (request) => {
    if (isNotePost(request)) notePosts.push(request);
  });
  const notesBefore = (await countOf(world)).designNotes;
  await noteField(page).fill(text);

  await context.clearCookies();
  await saveNoteButton(page).click();

  const sheet = page.getByTestId("staff-session-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(
    romanian("staffActions.sessionBodyKeepsText"),
  );
  await expect(noteField(page)).toHaveValue(text);
  expect(
    (await countOf(world)).designNotes,
    "the refused note wrote nothing",
  ).toBe(notesBefore);
  await shootForReview(page, "mobile-session-sheet");

  const signInLink = page.getByTestId("staff-session-sign-in");
  await expect(signInLink).toHaveAttribute("target", "_blank");
  await expect(signInLink).toHaveAttribute("rel", /noopener/);
  const [signInTab] = await Promise.all([
    context.waitForEvent("page"),
    signInLink.click(),
  ]);
  await expect(signInTab).toHaveURL(
    /\/ro\/account\/login\?reason=session-expired$/,
  );
  expect(
    await signInTab.evaluate((): unknown => window.opener),
    "no opener",
  ).toBeNull();
  await signIn(context, world.operator);
  await signInTab.close();

  await page
    .getByRole("button", { name: romanian("staffActions.sessionRecheck") })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(noteField(page)).toHaveValue(text);
  expect(notePosts, "the sheet's recheck sent no note").toHaveLength(1);
  await saveNoteButton(page).click();

  await expect(savedNote(page, text)).toHaveCount(1);
  expect(notePosts, "one refused press, one that saved").toHaveLength(2);
  expect((await countOf(world)).designNotes, "exactly one note stored").toBe(
    notesBefore + 1,
  );
  await page.reload();
  await expect(savedNote(page, text)).toHaveCount(1);
});
