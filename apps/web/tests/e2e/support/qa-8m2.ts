// What wave 8M2's QA specs share: sending one request by the real form, the already-sent view's test ids, what the
// browser's console said by type, and the checks every spec on that view repeats. No criterion of its own lives here
// beyond `expectAlreadySentView`, which is criterion 12's shape.
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  CTA,
  DONE_COPY,
  DONE_DESIGN_LINK_CARD,
  DONE_REFERENCE,
  MESSAGES,
  chooseChannel,
  clientRequestIdOf,
  expectDoneShown,
  expectReferenceNotShown,
  fillTheTextFields,
  nextSentReference,
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
import { shopPhoneDisplay, shopTelAddress } from "../../../src/shop/shop-phone";

export const ALREADY_SENT = "contact-already-sent";
export const ALREADY_SENT_HEADING = "contact-already-sent-heading";
export const WEBGL_UNAVAILABLE = "webgl-unavailable";
export const CONTACT_BACK = "contact-back";
export const ALREADY_SENT_ADVICE = "contact-already-sent-advice";
export const ALREADY_SENT_CHANGED_KITCHEN =
  "contact-already-sent-changed-kitchen";
export const ALREADY_SENT_BOTTOM = "contact-already-sent-bottom";
export const CALL_SHOP_LINK = "call-shop-link";
export const BACK_TO_DESIGN = "done-back-to-design";

/** What the advice said before wave 8V criterion 18, in Romanian and Russian: *tell us the request's number*. */
// eslint-disable-next-line no-restricted-syntax -- a negative claim about the wording (criterion 18): the words the re-drafted leaf must no longer hold, which no catalogue leaf can supply.
const ASKS_FOR_THE_REQUEST_NUMBER = /numărul cererii|номер заявки/i;

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
 *  one new request in the database, whose reference is returned as the server's answer carried it (no screen shows it
 *  since wave 8V D2). */
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
  const answered = nextSentReference(page);
  await pressTheCallToAction(page);
  const reference = await answered;
  await expectDoneShown(page, locale, design.id);
  await expectReferenceNotShown(page, reference);
  return {
    reference,
    requestId: clientRequestIdOf(sentAt(sent, 0)),
    typed,
    sent,
  };
}

/** Criterion 12's shape, as S5 completes it and wave 8V (D2, criterion 18) amends it: the one `h1` with the focus, no
 *  reference (`reference`, the request's own, is in none of the page's shown text) and no card or copy control, the
 *  advice naming the display form of the shop's number (and no unfilled `{phone}`) and not asking for the request's
 *  number, the one call link dialling the constant, the changed-kitchen sentence, the way back to the design pinned at
 *  the foot outside the view's container, and no form, no input, no call to action. */
export async function expectAlreadySentView(
  page: Page,
  reference: string,
  locale: "ro" | "ru",
): Promise<void> {
  const copy = MESSAGES[locale].submissionResult;
  const view = page.getByTestId(ALREADY_SENT);
  await expect(view).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId(ALREADY_SENT_HEADING)).toHaveText(
    copy.alreadySentHeading,
  );
  await expect(page.getByTestId(ALREADY_SENT_HEADING)).toBeFocused();
  await expect(page.locator("h1")).toHaveCount(1);
  await expectReferenceNotShown(page, reference);
  for (const absent of [DONE_REFERENCE, DONE_COPY, DONE_DESIGN_LINK_CARD]) {
    await expect(page.getByTestId(absent), absent).toHaveCount(0);
  }
  await expectAdviceNamesTheShopNumber(view, copy.alreadySentAdvice);
  await expect(view.getByTestId(ALREADY_SENT_ADVICE)).not.toContainText(
    ASKS_FOR_THE_REQUEST_NUMBER,
  );
  await expectOneCallLinkDialling(page, view, copy.callShop);
  await expect(view.getByTestId(ALREADY_SENT_CHANGED_KITCHEN)).toHaveText(
    copy.alreadySentChangedKitchen,
  );
  await expectBackLinkOutsideTheContainer(page, view, copy.backToDesign);
  await expect(page.getByTestId(CTA)).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByTestId(WEBGL_UNAVAILABLE)).toHaveCount(0);
}

async function expectAdviceNamesTheShopNumber(
  view: Locator,
  adviceTemplate: string,
): Promise<void> {
  const advice = view.getByTestId(ALREADY_SENT_ADVICE);
  await expect(advice).toContainText(shopPhoneDisplay());
  await expect(advice).toHaveText(
    adviceTemplate.replace("{phone}", shopPhoneDisplay()),
  );
  expect(await advice.innerText(), "no unfilled placeholder").not.toMatch(
    /[{}]/,
  );
}

/** Exactly one call link on the page, inside the view, dialling the constant and named as frame 5B names it. */
async function expectOneCallLinkDialling(
  page: Page,
  view: Locator,
  label: string,
): Promise<void> {
  await expect(page.getByTestId(CALL_SHOP_LINK)).toHaveCount(1);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(1);
  const link = view.getByTestId(CALL_SHOP_LINK);
  await expect(link).toHaveAttribute("href", shopTelAddress());
  await expect(link).toContainText(label);
}

/** The way back is pinned at the foot, which is a sibling of the view's container and not inside it. */
async function expectBackLinkOutsideTheContainer(
  page: Page,
  view: Locator,
  label: string,
): Promise<void> {
  await expect(page.getByTestId(BACK_TO_DESIGN)).toHaveCount(1);
  await expect(view.getByTestId(BACK_TO_DESIGN)).toHaveCount(0);
  const way = page.getByTestId(ALREADY_SENT_BOTTOM).getByTestId(BACK_TO_DESIGN);
  await expect(way).toBeVisible();
  await expect(way).toHaveText(label);
}

const LEAST_TOUCH_TARGET = 44;
const COLUMN_WIDTH = 640;

interface Rect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

async function rectOf(target: Locator): Promise<Rect> {
  return target.evaluate((element) => {
    const { top, bottom, left, right, width, height } =
      element.getBoundingClientRect();
    return { top, bottom, left, right, width, height };
  });
}

/** Criterion 17 on the already-sent view: no sideways scroll, every control at least 44 px each way, the pinned region
 *  (the way back) at most half the viewport and on its bottom edge, and the last block clear of it after scrolling to
 *  the end. What holds the focus is checked apart, by `expectFocusClearOfThePinnedRegion`. */
export async function expectViewLayout(
  page: Page,
  label: string,
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport, `${label}: a viewport`).not.toBeNull();
  const height = viewport?.height ?? 0;
  const width = viewport?.width ?? 0;
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, `${label}: sideways`).toBeLessThanOrEqual(
    overflow.clientWidth,
  );
  for (const id of [CALL_SHOP_LINK, BACK_TO_DESIGN]) {
    const box = await rectOf(page.getByTestId(id));
    expect
      .soft(box.height, `${label}: ${id} height`)
      .toBeGreaterThanOrEqual(LEAST_TOUCH_TARGET);
    expect
      .soft(box.width, `${label}: ${id} width`)
      .toBeGreaterThanOrEqual(LEAST_TOUCH_TARGET);
    expect(box.left, `${label}: ${id} left`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${label}: ${id} right`).toBeLessThanOrEqual(width);
  }
  const region = await rectOf(page.getByTestId(ALREADY_SENT_BOTTOM));
  expect(region.height, `${label}: the pinned region`).toBeLessThanOrEqual(
    height / 2,
  );
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const pinned = await rectOf(page.getByTestId(ALREADY_SENT_BOTTOM));
  expect(pinned.bottom, `${label}: the region sits on the bottom edge`).toBe(
    height,
  );
  const lastBlock = await rectOf(
    page.getByTestId(ALREADY_SENT_CHANGED_KITCHEN),
  );
  expect(
    lastBlock.bottom,
    `${label}: the last block clears the pinned region`,
  ).toBeLessThanOrEqual(pinned.top);
  const column = await rectOf(page.getByTestId(ALREADY_SENT));
  expect(column.width, `${label}: the 640 px column`).toBeLessThanOrEqual(
    COLUMN_WIDTH,
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

/** Presses the call link once and shows that the press led nowhere of ours: the page is where it was, the view still
 *  stands, and no request to `/api/` (a write or a read) left because of it. */
export async function tapTheCallLinkAndStay(page: Page): Promise<void> {
  const before = page.url();
  const apiRequests: string[] = [];
  const watch = (request: { url(): string; method(): string }) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/"))
      apiRequests.push(`${request.method()} ${pathname}`);
  };
  page.on("request", watch);
  await page.getByTestId(CALL_SHOP_LINK).tap();
  await page.waitForTimeout(1000);
  page.off("request", watch);
  expect(page.url(), "the call link left the page").toBe(before);
  await expectFocusClearOfThePinnedRegion(page, "after the call link press");
  await expect(page.getByTestId(ALREADY_SENT)).toBeVisible();
  expect(
    apiRequests,
    "the press of the call link made an /api/ request",
  ).toEqual([]);
}

/** ADR 0148 A4, G3: what holds the focus is not covered by the pinned region. The focus may be inside the region (its own
 *  link); anything else must end above the region's top edge as the page stands now. */
export async function expectFocusClearOfThePinnedRegion(
  page: Page,
  label: string,
): Promise<void> {
  const where = await page.evaluate(() => {
    const focused = document.activeElement;
    const region = document.querySelector(
      '[data-testid="contact-already-sent-bottom"]',
    );
    if (focused === null || region === null) return undefined;
    const box = focused.getBoundingClientRect();
    return {
      tag: focused.tagName,
      testId: focused.getAttribute("data-testid"),
      isInside: region.contains(focused),
      bottom: box.bottom,
      regionTop: region.getBoundingClientRect().top,
    };
  });
  expect(where, `${label}: something holds the focus`).toBeDefined();
  expect(where?.tag, `${label}: the focus is not on the body`).not.toBe("BODY");
  if (where?.isInside === true) return;
  expect(
    where?.bottom ?? Number.POSITIVE_INFINITY,
    `${label}: ${where?.testId ?? where?.tag ?? "the focused element"} is under the pinned region`,
  ).toBeLessThanOrEqual(where?.regionTop ?? 0);
}
