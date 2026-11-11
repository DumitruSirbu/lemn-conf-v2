import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "../../../src/staff/changed-count-poll-interval";
import { romanian } from "./staff-world";

// What the staff specs do on the screens, in one place: open a page, search the list, read the count. The assertions
// stay in the specs (docs/best-practices/browser-and-visual-qa.md); these only reach a state and name an element.

/** The directory screenshots go to when a reviewer asks for them. Never inside the repository: unset, nothing is written. */
const SHOTS_DIRECTORY_VARIABLE = "STAFF_E2E_SHOTS_DIR";

export const STAFF_LIST_PATH = "/ro/staff/kitchens";
export const STAFF_AUDIT_PATH = "/ro/staff/audit";

export async function openStaffList(page: Page): Promise<void> {
  await page.goto(STAFF_LIST_PATH);
  await expect(page.getByTestId("staff-kitchens-page")).toBeVisible();
}

export function kitchenRows(page: Page): Locator {
  return page.getByTestId("staff-kitchen-row");
}

export function searchBox(page: Page): Locator {
  return page.getByRole("searchbox");
}

/** Types the text key by key, as a person does, and waits for the list to show its count. */
export async function typeSearch(page: Page, text: string): Promise<void> {
  await searchBox(page).pressSequentially(text, { delay: 25 });
}

export function isApiListRequest(url: string): boolean {
  const { pathname } = new URL(url);
  return pathname === "/api/staff/kitchens";
}

/** Whether the page has a horizontal scroll bar of its own: the whole page must never. */
export function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

/** What the kitchens link may say: the page's name alone or followed by the count of changed kitchens, never a zero. */
const KITCHENS_LINK_TEXT = new RegExp(
  `^${escapedForRegExp(romanian("staffShell.navKitchens"))}(?:[1-9][0-9]*)?$`,
  "u",
);

function escapedForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Expects a staff navigation link to the kitchens, in the nav or the sheet, to read the page's name and nothing but a
 * badge. The badge is the count of every run's changed kitchens on the shared database, so a spec cannot say whether
 * it is drawn; it can say that a drawn one is a whole number above zero and is named for a screen reader with that
 * same number, and that an undrawn one leaves the link named by its text.
 */
export async function expectKitchensLinkLabelled(link: Locator): Promise<void> {
  await expect(link).toHaveText(KITCHENS_LINK_TEXT);
  const { text, accessibleName } = await link.evaluate((element) => ({
    text: element.textContent,
    accessibleName: element.getAttribute("aria-label"),
  }));
  const pageName = romanian("staffShell.navKitchens");
  const drawnCount = text.slice(pageName.length);
  expect(accessibleName, "the link's spoken name").toBe(
    drawnCount === "" ? null : kitchensLinkSpokenName(Number(drawnCount)),
  );
}

/**
 * The most a count can take to reach the link: the server answers from a cache that is a poll interval old at most, and the
 * browser asks once on opening and then once an interval, so a kitchen changed just before the page opened can wait for
 * the second answer. A spec that expects the count sets its test timeout to this.
 */
export const KITCHENS_LINK_COUNT_WAIT_MS =
  (2 * CHANGED_COUNT_POLL_INTERVAL_SECONDS + 10) * 1000;

/** Expects the kitchens link to wear a count, which a world holding a changed kitchen makes at least one. */
export async function expectKitchensLinkWearsCount(
  link: Locator,
): Promise<void> {
  const pageName = escapedForRegExp(romanian("staffShell.navKitchens"));
  await expect(link).toHaveText(new RegExp(`^${pageName}[1-9][0-9]*$`, "u"), {
    timeout: KITCHENS_LINK_COUNT_WAIT_MS,
  });
  await expectKitchensLinkLabelled(link);
}

/** What a screen reader says for the kitchens link while `count` changed kitchens are drawn beside it. */
export function kitchensLinkSpokenName(count: number): string {
  return romanian("priceDashboard.nav.itemWithBadge", {
    name: romanian("staffShell.navKitchens"),
    label: romanian("priceDashboard.nav.changedKitchens", { count }),
  });
}

/** Writes a screenshot for a reviewer when `STAFF_E2E_SHOTS_DIR` names a directory; otherwise does nothing. */
export async function shootForReview(page: Page, name: string): Promise<void> {
  const directory = process.env[SHOTS_DIRECTORY_VARIABLE];
  if (directory === undefined || directory === "") return;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    path: join(directory, `${name}.png`),
    fullPage: true,
  });
}

export async function openStaffKitchen(
  page: Page,
  designId: string,
): Promise<void> {
  await page.goto(`/ro/staff/kitchens/${designId}`);
  await expect(page.getByTestId("staff-kitchen-page")).toBeVisible();
  await expect(page.getByTestId("staff-notes")).toBeVisible();
}

export function noteField(page: Page): Locator {
  return page.getByRole("textbox", { name: ADD_A_NOTE });
}

export function saveNoteButton(page: Page): Locator {
  return page.getByRole("button", { name: SAVE_THE_NOTE, exact: true });
}

/** The words of the note field's label and button, from the Romanian copy the app reads. */
const ADD_A_NOTE = romanian("staffNotes.fieldLabel");
const SAVE_THE_NOTE = romanian("staffNotes.submit");

/** One note of the list, by its text: the field's own text is not a note until it is saved. */
export function savedNote(page: Page, text: string): Locator {
  return page.getByTestId("staff-notes").locator("li", { hasText: text });
}

export function statusSelect(page: Page): Locator {
  return page
    .getByTestId("staff-status-control")
    .getByLabel(romanian("staffActions.statusSelectLabel"));
}

export function statusSaveButton(page: Page): Locator {
  return page.getByTestId("staff-status-control").getByRole("button");
}

/** Today's calendar day in Chisinau as a date field holds it: the day the audit page filters by. */
export function todayInChisinau(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
  }).format(new Date());
}

const LOG_MOVED_ON_RETRIES = 12;
const LOG_MOVED_ON_WAIT_MS = 3000;

/**
 * Opens the audit log and chooses a person in its filter. The people the filter offers are those of the rows on the first
 * page, and the log is every spec's: another spec that planted its rows after this one's can hold the first page for a
 * few seconds, until its own `afterAll` removes them. So a person who is not offered yet is waited for, a page load at a
 * time, and a person who never is fails the test with the reason.
 */
export async function openAuditChoosingPerson(
  page: Page,
  accountId: string,
): Promise<void> {
  const person = page.getByLabel(romanian("staffAudit.filterPerson"));
  for (let attempt = 0; attempt < LOG_MOVED_ON_RETRIES; attempt += 1) {
    await page.goto(STAFF_AUDIT_PATH);
    await expect(person).toBeVisible();
    await expect(page.getByTestId("staff-audit-row").first()).toBeVisible();
    if ((await person.locator(`option[value="${accountId}"]`).count()) > 0) {
      await person.selectOption(accountId);
      return;
    }
    await page.waitForTimeout(LOG_MOVED_ON_WAIT_MS);
  }
  throw new Error(
    "The person never appeared among the first page's people: the shared log stayed buried under another run's rows",
  );
}
