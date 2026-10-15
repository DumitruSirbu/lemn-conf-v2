// What wave 8M's QA specs share: the typed tokens, what a browser keeps of a page, the real path to the contact page,
// and the routes that lose an answer. No assertion about a criterion lives here, except `expectNothingTypedKept`, which
// is the criterion-12 check itself, so that every step of a trace is held to the one list of places.
import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  ANSWERS,
  answerContactWith,
  CONTACT_ROUTE_PATH,
  donePath,
  expectFormDrawn,
  fillTheWholeForm,
  pressTheCallToAction,
  fillTheTextFields,
  chooseChannel,
  newToken,
  tickConsent,
  typeInto,
  waitForTheLeastFormTime,
  DONE_HEADING,
} from "./contact-page";
import { newAddress, newName, newPhone, type ContactRun } from "./contact-run";
import {
  contactPath,
  expectReviewDrawn,
  REVIEW_CTA,
  reviewPath,
} from "./qa-8d-review";
import { openSeededDesign, type SeededDesign } from "./seeded-design";

/** A value for each field the form takes, none of which any other run, spec or page shares. */
export interface TypedTokens {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly email: string;
}

export function newTypedTokens(run: ContactRun): TypedTokens {
  return {
    name: `${newName()} Nm${newToken()}`,
    phone: newPhone(),
    locality: `Lc${newToken()}${newToken()}`,
    email: newAddress(run),
  };
}

/** The four tokens by the field each was typed in. */
export function namedTokens(
  typed: TypedTokens,
): readonly (readonly [string, string])[] {
  return [
    ["name", typed.name],
    ["phone", typed.phone],
    ["locality", typed.locality],
    ["email", typed.email],
  ];
}

/** Everything a page does that could carry a typed value out of memory, kept as it happens. */
export interface WhatTheBrowserKept {
  readonly urls: string[];
  readonly otherRequestBodies: string[];
  readonly console: string[];
  readonly pageErrors: string[];
}

export function watchWhatTheBrowserKeeps(page: Page): WhatTheBrowserKept {
  const kept: WhatTheBrowserKept = {
    urls: [],
    otherRequestBodies: [],
    console: [],
    pageErrors: [],
  };
  page.on("request", (request) => {
    kept.urls.push(request.url());
    const isTheContactSend =
      new URL(request.url()).pathname === CONTACT_ROUTE_PATH;
    if (!isTheContactSend)
      kept.otherRequestBodies.push(request.postData() ?? "");
  });
  page.on("framenavigated", (frame) => kept.urls.push(frame.url()));
  page.on("console", (message) => kept.console.push(message.text()));
  page.on("pageerror", (error) => kept.pageErrors.push(error.message));
  return kept;
}

/** Console errors that are the browser telling a request failed, which is what an offline context makes on purpose, and
 *  the one Chromium prints for every page about a feature name in the Permissions-Policy header (`security-headers.ts`,
 *  not this wave's: it is on every page of the application). */
const EXPECTED_WHILE_OFFLINE =
  /Failed to load resource|net::ERR_|Permissions-Policy header/;

export function unexpectedConsoleErrors(kept: WhatTheBrowserKept): string[] {
  return kept.console.filter(
    (line) => /error/i.test(line) && !EXPECTED_WHILE_OFFLINE.test(line),
  );
}

/**
 * The criterion-12 list: no token of what was typed in the document's cookie, the context's cookies, local or session
 * storage, the names of IndexedDB's databases, the history entry's state or any URL of the run, any request's URL or
 * body but the contact send's own, the resource timing, the title, the console or an uncaught error.
 */
export async function expectNothingTypedKept(
  page: Page,
  context: BrowserContext,
  typed: TypedTokens,
  kept: WhatTheBrowserKept,
  step: string,
): Promise<void> {
  const inThePage = await page.evaluate(async () => ({
    cookie: document.cookie,
    local: JSON.stringify(Object.entries(window.localStorage)),
    session: JSON.stringify(Object.entries(window.sessionStorage)),
    databases: JSON.stringify(
      (await window.indexedDB.databases()).map(({ name }) => name),
    ),
    historyState: JSON.stringify(window.history.state),
    location: window.location.href,
    windowName: window.name,
    resources: JSON.stringify(
      performance.getEntriesByType("resource").map(({ name }) => name),
    ),
    title: document.title,
    storedCaches: JSON.stringify(await window.caches.keys()),
  }));
  const holders: Readonly<Record<string, string>> = {
    ...inThePage,
    contextCookies: JSON.stringify(await context.cookies()),
    urlsOfTheRun: kept.urls.join("\n"),
    otherRequestBodies: kept.otherRequestBodies.join("\n"),
    console: kept.console.join("\n"),
    pageErrors: kept.pageErrors.join("\n"),
  };
  for (const [holder, text] of Object.entries(holders)) {
    const lowered = text.toLowerCase();
    for (const [fieldName, value] of namedTokens(typed)) {
      const forms = [value, encodeURIComponent(value), btoa(value)];
      for (const form of forms) {
        expect(
          lowered,
          `${step}: ${holder} holds the ${fieldName} (${form})`,
        ).not.toContain(form.toLowerCase());
      }
    }
  }
}

/** The page's own text and markup hold none of the four tokens: after a load, nothing typed is on a page. */
export async function expectNoTokenInThePage(
  page: Page,
  typed: TypedTokens,
  step: string,
): Promise<void> {
  const markup = await page.evaluate(() => document.documentElement.outerHTML);
  const text = await page.evaluate(() => document.body.innerText);
  for (const [fieldName, value] of namedTokens(typed)) {
    expect(markup, `${step}: the markup holds the ${fieldName}`).not.toContain(
      value,
    );
    expect(text, `${step}: the text holds the ${fieldName}`).not.toContain(
      value,
    );
  }
}

/** The editor, then the review, then the contact page, each by the control that leads to the next: the history a
 *  customer has when they send, so that Back after a send has somewhere to go. Returns when the form was drawn. */
export async function reachContactFromTheEditor(
  page: Page,
  design: SeededDesign,
  locale: "ro" | "ru",
): Promise<{ readonly drawnAtMs: number }> {
  await openSeededDesign(page, design, { locale });
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath(locale, design.id));
  await expectReviewDrawn(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(contactPath(locale, design.id));
  return { drawnAtMs: await expectFormDrawn(page) };
}

/** Fills the whole form with the four tokens, the channel being the one sent: the e-mail is typed first, under the
 *  e-mail chip, and the channel is then changed back, so the form's memory holds a value the request must not carry. */
export async function fillWithAllFourTokens(
  page: Page,
  typed: TypedTokens,
  channel: "phone" | "whatsapp",
): Promise<void> {
  await fillTheTextFields(page, typed);
  await chooseChannel(page, "email");
  await typeInto(page, "email", typed.email);
  await chooseChannel(page, channel);
  await tickConsent(page);
}

/** A form that has been open long enough for the server to take it. */
export async function readyToSend(
  page: Page,
  drawnAtMs: number,
): Promise<void> {
  await waitForTheLeastFormTime(drawnAtMs);
}

/** Counts the `online` and `offline` events the page's window received, so that a test knows its context's switch
 *  reached the page as the browser's own word. */
export async function countConnectionEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, "__connectionEvents", seen);
    window.addEventListener("online", () => seen.push("online"));
    window.addEventListener("offline", () => seen.push("offline"));
  });
}

export async function connectionEventsSeen(page: Page): Promise<string[]> {
  return page.evaluate(
    () => Reflect.get(window, "__connectionEvents") as string[],
  );
}

export type SentChannel = "phone" | "whatsapp" | "email";

/** The sentence 5A says of the channel, read from the catalogue's ICU `select` so that a spec compares against the
 *  catalogue's own words and not a copy of them: the branch for `channel`, with `{contact}` filled in. */
export function channelLineOf(
  template: string,
  channel: SentChannel,
  contact: string,
): string {
  const branchName = channel === "email" ? "other" : channel;
  const branches = new Map(
    [
      ...template.matchAll(
        /(phone|whatsapp|other) \{((?:[^{}]|\{contact\})*)\}/g,
      ),
    ].map((match) => [match[1], match[2]] as const),
  );
  const branch = branches.get(branchName);
  if (branch === undefined) {
    throw new Error(`the channel line has no branch for ${branchName}`);
  }
  return branch.replace("{contact}", contact);
}

/**
 * The confirmation reached the way a customer reaches it, with the server's answer made by `page.route`: the editor, the
 * review, the contact page, a filled form, a press. Nothing is stored and no bucket is spent. The write access the editor
 * probed is still in the store when the confirmation draws, which is what the WhatsApp action is gated on.
 */
export async function reachDoneByAMockedSend(
  page: Page,
  design: SeededDesign,
  locale: "ro" | "ru",
  reference: string,
): Promise<void> {
  const { drawnAtMs } = await reachContactFromTheEditor(page, design, locale);
  await fillTheWholeForm(page, {
    name: `Nm${newToken()}`,
    phone: newPhone(),
    locality: "Chisinau",
  });
  await waitForTheLeastFormTime(drawnAtMs);
  await answerContactWith(page, ANSWERS.sent(reference));
  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath(locale, design.id)}`);
  await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
}
