// What wave 8M2's QA specs share: sending one request by the real form, the already-sent view's test ids, what the
// browser's console said by type, and the checks every spec on that view repeats. No criterion of its own lives here
// beyond `expectAlreadySentView`, which is criterion 12's shape.
import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  chooseChannel,
  clientRequestIdOf,
  donePath,
  fillTheTextFields,
  pressTheCallToAction,
  recordContactRequests,
  sentAt,
  tickConsent,
  type SentContactRequest,
} from "./contact-page";
import { noteVisitorOf, type ContactRun } from "./contact-run";
import {
  newTypedTokens,
  reachContactFromTheEditor,
  readyToSend,
  type TypedTokens,
} from "./qa-8m";
import type { SeededDesign } from "./seeded-design";

export const ALREADY_SENT = "contact-already-sent";
export const ALREADY_SENT_HEADING = "contact-already-sent-heading";
export const WEBGL_UNAVAILABLE = "webgl-unavailable";
export const CONTACT_BACK = "contact-back";
export const COPY_REFERENCE = "done-copy";

/** Two lines no wave of this application owns: the one the browser prints on every page for a feature name in the
 *  Permissions-Policy header (`security-headers.ts`), and the library's own deprecation of `THREE.Clock`, which a page
 *  with a scene prints once. Neither is about hydration or the contact page. */
const KNOWN_EVERY_PAGE_LINE =
  /Permissions-Policy header|THREE\.Clock: This module has been deprecated/;

export interface ConsoleLine {
  readonly type: string;
  readonly text: string;
}

export interface WhatTheConsoleSaid {
  readonly lines: ConsoleLine[];
  readonly pageErrors: string[];
}

/** Every console message by its type, and every uncaught error, from now on. The type is kept because a hydration
 *  mismatch in a development build is a warning and in a production build an error with no word `error` in its text. */
export function watchTheConsole(page: Page): WhatTheConsoleSaid {
  const said: WhatTheConsoleSaid = { lines: [], pageErrors: [] };
  page.on("console", (message) => {
    said.lines.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => said.pageErrors.push(error.message));
  return said;
}

/** What criterion 13 forbids: any error or warning, and anything that names hydration, a mismatch or a minified React
 *  error, whatever its type. */
export function consoleProblems(said: WhatTheConsoleSaid): string[] {
  const named = /hydrat|mismatch|did not match|Minified React error/i;
  return [
    ...said.lines
      .filter(({ type, text }) => {
        if (KNOWN_EVERY_PAGE_LINE.test(text)) return false;
        return type === "error" || type === "warning" || named.test(text);
      })
      .map(({ type, text }) => `${type}: ${text}`),
    ...said.pageErrors.map((message) => `pageerror: ${message}`),
  ];
}

/** Every request this page makes to a path under `/api/` by a method that writes, from now on. */
export function recordApiWrites(
  page: Page,
): { readonly method: string; readonly pathname: string }[] {
  const writes: { method: string; pathname: string }[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith("/api/")) return;
    if (request.method() === "GET" || request.method() === "HEAD") return;
    writes.push({ method: request.method(), pathname });
  });
  return writes;
}

export function contactPosts(
  writes: readonly { method: string; pathname: string }[],
): number {
  return writes.filter(
    ({ method, pathname }) =>
      method === "POST" && pathname === "/api/contact-submissions",
  ).length;
}

/** Registers every request id the page sends the moment it leaves, so a test that fails half way still cleans up. */
export function registerRequestIdsOf(run: ContactRun, page: Page): void {
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/contact-submissions") return;
    const text = request.postData();
    if (text === null) return;
    const id = (JSON.parse(text) as { clientRequestId?: unknown })
      .clientRequestId;
    if (typeof id === "string") run.requestIds.push(id);
  });
}

export interface OneSentRequest {
  readonly reference: string;
  readonly requestId: string;
  readonly typed: TypedTokens;
  readonly sent: SentContactRequest[];
}

/** The editor, the review, the contact page, the form filled with new tokens, one press, and the confirmation shown:
 *  one new request in the database, whose reference is returned as the confirmation shows it. */
export async function sendOneRequestByTheForm(
  page: Page,
  context: BrowserContext,
  run: ContactRun,
  design: SeededDesign,
  locale: "ro" | "ru" = "ro",
): Promise<OneSentRequest> {
  const sent = recordContactRequests(page);
  const typed = newTypedTokens(run);
  const { drawnAtMs } = await reachContactFromTheEditor(page, design, locale);
  await noteVisitorOf(run, context);
  await fillTheTextFields(page, typed);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, drawnAtMs);
  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath(locale, design.id)}`);
  await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
  const reference =
    (await page.getByTestId(DONE_REFERENCE).textContent()) ?? "";
  expect(reference, "the confirmation shows a reference").not.toBe("");
  return {
    reference,
    requestId: clientRequestIdOf(sentAt(sent, 0)),
    typed,
    sent,
  };
}

/** Criterion 12's shape, as the interim view of S4 draws it: the one `h1` with the focus, the reference as text in the
 *  card, the copy control, and no form, no input, no call to action. The reference is scoped to the view because the
 *  card reuses the confirmation's test ids. */
export async function expectAlreadySentView(
  page: Page,
  reference: string,
  { heading }: { readonly heading: string },
): Promise<void> {
  const view = page.getByTestId(ALREADY_SENT);
  await expect(view).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(ALREADY_SENT_HEADING)).toHaveText(heading);
  await expect(page.getByTestId(ALREADY_SENT_HEADING)).toBeFocused();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(view.getByTestId(DONE_REFERENCE)).toHaveText(reference);
  await expect(view.getByTestId(COPY_REFERENCE)).toBeVisible();
  await expect(page.getByTestId(CTA)).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByTestId(WEBGL_UNAVAILABLE)).toHaveCount(0);
}
