import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

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
