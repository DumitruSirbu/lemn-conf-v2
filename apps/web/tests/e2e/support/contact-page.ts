// What the 8L contact specs share: the form's test ids, filling and sending it by touch, recording the contact
// requests a page makes, and answering them from `page.route`. No assertion about a criterion lives here.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, type Locator, type Page, type Route } from "@playwright/test";

import { touchTheMiddleOf } from "./qa-8d-review";
import { FIRST_FRAME_FREEZE_TIMEOUT_MS } from "./seeded-design";

export interface ContactMessages {
  readonly contact: {
    readonly heading: string;
    readonly sending: string;
    readonly sendingLine: string;
    readonly sendingLineNoDesign: string;
    readonly callToAction: string;
    readonly retry: string;
    readonly unavailable: string;
    readonly consent: string;
    readonly consentProvisionalMarker: string;
    readonly reviewLink: string;
    readonly fieldErrors: {
      readonly CONSENT_NOT_GIVEN: string;
      readonly PHONE_MOLDOVAN_INCOMPLETE: string;
    };
    readonly outcomes: {
      readonly refused: string;
      readonly conflict: string;
      readonly designNotCurrent: string;
      readonly limited: string;
      readonly limitedTomorrow: string;
    };
  };
  readonly reviewScreen: { readonly saving: string };
  readonly submissionResult: {
    readonly topBarTitle: string;
    readonly sentHeading: string;
    readonly copy: string;
    readonly copied: string;
    readonly channelLine: string;
    readonly channelLineWithoutValue: string;
    readonly savedSentence: string;
    readonly sendOnWhatsapp: string;
    readonly openWhatsapp: string;
    readonly whatsappMessageToShop: string;
    readonly noRequest: string;
    readonly notShown: string;
    readonly alreadySentHeading: string;
    readonly alreadySentAdvice: string;
    readonly alreadySentChangedKitchen: string;
    readonly callShop: string;
    readonly backToDesign: string;
    readonly failureHeading: string;
    readonly failureKeptNoDesign: string;
    readonly failureLostConnection: string;
    readonly failureNotSent: string;
    readonly waitingForConnection: string;
    readonly retryAutomatically: string;
  };
  readonly share: { readonly reissueWarning: string; readonly error: string };
}

function readCatalogue(locale: "ro" | "ru"): ContactMessages {
  return JSON.parse(
    readFileSync(
      new URL(`../../../src/messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as ContactMessages;
}

export const MESSAGES = { ro: readCatalogue("ro"), ru: readCatalogue("ru") };

export const CONTACT_ROUTE_PATH = "/api/contact-submissions";

export const CTA = "contact-cta";
export const BOTTOM = "contact-bottom";
export const CONSENT = "contact-consent";
export const OUTCOME = "contact-outcome";
export const RETRY = "contact-retry";
export const SENDING_LINE = "contact-sending-line";
export const SAVE_WAIT = "contact-save-wait";
/** The callback form's own sent view, drawn in place; the design form leaves for the confirmation instead. */
export const CALLBACK_SENT = "contact-sent";
/** Frame 5B, the contact page's state for a send that did not arrive: its root, its `h1` and its one sentence. */
export const FAILURE = "submission-failure";
export const FAILURE_HEADING = "failure-heading";
export const FAILURE_SENTENCE = "failure-sentence";
export const FAILURE_WAITING = "failure-waiting";
/** Frame 5A, the confirmation the design form leaves for. */
export const DONE_HEADING = "done-heading";
/** The request's reference as text. Since wave 8V (D2) only the callback form's sent view draws it; 5A and the
 *  already-sent view do not. */
export const DONE_REFERENCE = "done-reference";
/** 5A's card with the customer's own address of the design's editor (wave 8V D1), the address itself, and the copy
 *  control and its announcement, whose test ids the callback view's reference card shares. */
export const DONE_DESIGN_LINK_CARD = "done-design-link-card";
export const DONE_DESIGN_LINK = "done-design-link";
export const DONE_COPY = "done-copy";
export const DONE_COPIED = "done-copied";
export const UNAVAILABLE = "contact-unavailable";
export const REFUSED_DESIGN = "contact-refused";
export const REVIEW_LINK_IN_OUTCOME = "contact-outcome-review-link";
export const BACK = "contact-back";
export const CARD = "contact-design-card";

/** The server refuses a form that was open for less than two seconds (`CONTACT_LEAST_FORM_TIME_MS`); a spec that must
 *  succeed waits this long after the form is drawn, which is later than the first render the client measures from. */
export const LEAST_FORM_TIME_PASSED_MS = 2400;

export function contactDocumentPath(
  locale: "ro" | "ru",
  designId: string,
): string {
  return `/${locale}/d/${designId}/contact`;
}

export function donePath(locale: "ro" | "ru", designId: string): string {
  return `/${locale}/d/${designId}/done`;
}

/** The design form's request was sent: the contact page was replaced by the design's confirmation, which shows the
 *  customer's own design address and no reference card (wave 8V D1, D2). */
export async function expectDoneShown(
  page: Page,
  locale: "ro" | "ru",
  designId: string,
): Promise<void> {
  await page.waitForURL(`**${donePath(locale, designId)}`);
  await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
  await expectDesignLinkShown(page, locale, designId);
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveCount(0);
}

/** The editor's address of this design in this locale, absolute from the page's own origin: what 5A's card must show
 *  and copy. Built from the page's URL, never from the card. */
export function designAddressOf(
  page: Page,
  locale: "ro" | "ru",
  designId: string,
): string {
  return `${new URL(page.url()).origin}/${locale}/d/${designId}`;
}

/** The server render and the hydrating render show the editor's path; the absolute address follows on the next
 *  render, which a page that stalls on a runner draws late. */
const ABSOLUTE_ADDRESS_WITHIN_MS = 20_000;

/** 5A's design-link card is visible and its address is this design's editor in this locale, absolute. */
export async function expectDesignLinkShown(
  page: Page,
  locale: "ro" | "ru",
  designId: string,
): Promise<void> {
  await expect(page.getByTestId(DONE_DESIGN_LINK_CARD)).toBeVisible();
  await expect(page.getByTestId(DONE_DESIGN_LINK)).toHaveText(
    designAddressOf(page, locale, designId),
    { timeout: ABSOLUTE_ADDRESS_WITHIN_MS },
  );
}

/** Wave 8V D2: the reference is on none of the customer's screens. Read from what the page shows (`innerText`), not its
 *  markup, whose flight payload may carry the reference as a prop. An empty reference is refused, since every text
 *  contains it and the check would pass for nothing. */
export async function expectReferenceNotShown(
  page: Page,
  reference: string,
): Promise<void> {
  expect(reference, "a reference to look for").not.toBe("");
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveCount(0);
  const shown = await page.evaluate(() => document.body.innerText);
  expect(shown, "the screen shows the reference").not.toContain(reference);
}

/** The reference of the contact route's next `200` answer to this page, which the screens no longer show (wave 8V D2).
 *  Call it before the press: a response that came before the wait was armed is never seen. A test that fails before it
 *  awaits the wait is already red, so the wait's own rejection when the page closes is marked handled here. */
export function nextSentReference(page: Page): Promise<string> {
  const reference = referenceOfTheNextSentAnswer(page);
  reference.catch(() => undefined);
  return reference;
}

/** Generous for a runner that stalls for seconds at a time, and short of the 120 s test timeout so that a send answered
 *  otherwise than `200` fails here, by name, and not as a timeout that names nothing. */
const SENT_ANSWER_WITHIN_MS = 60_000;

async function referenceOfTheNextSentAnswer(page: Page): Promise<string> {
  const response = await page
    .waitForResponse(
      (answer) =>
        new URL(answer.url()).pathname === CONTACT_ROUTE_PATH &&
        answer.request().method() === "POST" &&
        answer.status() === 200,
      { timeout: SENT_ANSWER_WITHIN_MS },
    )
    .catch((cause: unknown) => {
      throw new Error(
        `no 200 answer from ${CONTACT_ROUTE_PATH} within ${String(SENT_ANSWER_WITHIN_MS)} ms`,
        { cause },
      );
    });
  const body = (await response.json()) as { reference?: unknown };
  if (typeof body.reference !== "string" || body.reference === "") {
    throw new Error("the contact route's 200 answer carries no reference");
  }
  return body.reference;
}

export function callbackPath(locale: "ro" | "ru"): string {
  return `/${locale}/configurator/contact`;
}

export interface FormValues {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly email?: string;
}

export function field(page: Page, name: string): Locator {
  return page.locator(`form input[name="${name}"]`);
}

/** The form is drawn and its call to action is on the page; returns when this was, which bounds the first render. */
export async function expectFormDrawn(page: Page): Promise<number> {
  await expect(page.getByTestId(CTA)).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  return Date.now();
}

/** A hard load of the contact page, returned once the form is drawn, with the time it was. */
export async function openContactPage(
  page: Page,
  path: string,
): Promise<{ readonly drawnAtMs: number }> {
  await page.goto(path);
  return { drawnAtMs: await expectFormDrawn(page) };
}

/** Waits until the form has been open long enough for the server to take it. */
export async function waitForTheLeastFormTime(
  drawnAtMs: number,
): Promise<void> {
  const remaining = drawnAtMs + LEAST_FORM_TIME_PASSED_MS - Date.now();
  // A wait that outlasts the form's first render: the client measures from a render that was no later than `drawnAtMs`.
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
}

export async function typeInto(
  page: Page,
  name: string,
  text: string,
): Promise<void> {
  const input = field(page, name);
  await input.tap();
  await input.fill(text);
}

export async function fillTheTextFields(
  page: Page,
  values: FormValues,
): Promise<void> {
  await typeInto(page, "name", values.name);
  await typeInto(page, "phone", values.phone);
  await typeInto(page, "locality", values.locality);
}

export async function tickConsent(page: Page): Promise<void> {
  await page.getByTestId(CONSENT).locator('input[name="consent"]').tap();
}

export async function chooseChannel(
  page: Page,
  channel: "phone" | "whatsapp" | "email",
): Promise<void> {
  await page.locator(`form input[name="channel"][value="${channel}"]`).tap();
}

export async function fillTheWholeForm(
  page: Page,
  values: FormValues,
): Promise<void> {
  await fillTheTextFields(page, values);
  if (values.email !== undefined) {
    await chooseChannel(page, "email");
    await typeInto(page, "email", values.email);
  }
  await tickConsent(page);
}

/** A finger on the middle of the call to action, whatever it says about itself: Playwright's own `tap` waits for a
 *  control with `aria-disabled` to be enabled, so a press the page must ignore would instead wait to be allowed. */
export async function pressTheCallToAction(page: Page): Promise<void> {
  await touchTheMiddleOf(page, page.getByTestId(CTA));
}

export interface SentContactRequest {
  readonly url: string;
  readonly method: string;
  readonly text: string | null;
  readonly body: Record<string, unknown>;
}

/** Every request the page makes to the contact endpoint from now on, in the order it left the page. */
export function recordContactRequests(page: Page): SentContactRequest[] {
  const sent: SentContactRequest[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== CONTACT_ROUTE_PATH) return;
    const text = request.postData();
    sent.push({
      url: request.url(),
      method: request.method(),
      text,
      body: parseBody(text),
    });
  });
  return sent;
}

function parseBody(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function clientRequestIdOf(sent: SentContactRequest): string {
  const id = sent.body.clientRequestId;
  if (typeof id !== "string") {
    throw new Error("the contact request carries no clientRequestId");
  }
  return id;
}

export type RouteAnswer = (route: Route) => Promise<void>;

/** Answers every contact request with `answer`, one call per request, until the returned function is called. */
export async function answerContactWith(
  page: Page,
  answer: RouteAnswer,
): Promise<() => Promise<void>> {
  const pattern = `**${CONTACT_ROUTE_PATH}`;
  await page.route(pattern, answer);
  return () => page.unroute(pattern, answer);
}

/** Answers the first requests with `answers` in order and lets the rest through to the server. */
export async function answerContactInOrder(
  page: Page,
  answers: readonly RouteAnswer[],
): Promise<void> {
  let next = 0;
  await page.route(`**${CONTACT_ROUTE_PATH}`, async (route) => {
    const answer = answers[next];
    next += 1;
    if (answer === undefined) await route.continue();
    else await answer(route);
  });
}

export function fulfilWith(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): RouteAnswer {
  return (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    });
}

export const NETWORK_FAILURE: RouteAnswer = (route) =>
  route.abort("connectionreset");

/** The answers the contact route gives, as `contact-responses.ts` writes them. */
export const ANSWERS = {
  unavailable: fulfilWith(503, { code: "CONTACT_UNAVAILABLE" }),
  noticeNotSentRetry: fulfilWith(502, {
    code: "CONTACT_NOTICE_NOT_SENT_RETRY",
  }),
  noticeNotSent: fulfilWith(502, { code: "CONTACT_NOTICE_NOT_SENT" }),
  rejected: fulfilWith(400, { code: "CONTACT_REJECTED" }),
  invalidPhone: fulfilWith(400, {
    code: "CONTACT_INVALID",
    issues: [{ field: "contact.phone", code: "PHONE_MOLDOVAN_INCOMPLETE" }],
  }),
  conflict: fulfilWith(409, { code: "CONTACT_REQUEST_CONFLICT" }),
  designNotCurrent: fulfilWith(409, { code: "CONTACT_DESIGN_NOT_CURRENT" }),
  doesNotFit: fulfilWith(422, {
    code: "CONTACT_DESIGN_DOES_NOT_FIT",
    placementIds: [],
  }),
  limited: (retryAfter: string): RouteAnswer =>
    fulfilWith(
      429,
      { code: "CONTACT_LIMIT_REACHED" },
      { "retry-after": retryAfter },
    ),
  limitedWithNoWait: fulfilWith(429, { code: "CONTACT_LIMIT_REACHED" }),
  sent: (reference: string): RouteAnswer =>
    fulfilWith(200, { status: "sent", reference }),
  notAnAnswerWeKnow: fulfilWith(200, { status: "queued" }),
  unreadable: (route: Route): Promise<void> =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html>" }),
} as const;

/** The contact requests' bodies without the one field a retry re-measures. */
export function withoutElapsed(sent: SentContactRequest): unknown {
  const { elapsedMs, ...rest } = sent.body;
  void elapsedMs;
  return rest;
}

export function elapsedOf(sent: SentContactRequest): number {
  const elapsed = sent.body.elapsedMs;
  if (typeof elapsed !== "number") {
    throw new Error("the contact request carries no elapsedMs");
  }
  return elapsed;
}

/** The contact request at `index`, in the order they left the page; a test that asks for one that was not sent fails
 *  here, by name, and not as an undefined later. */
export function sentAt(
  sent: readonly SentContactRequest[],
  index: number,
): SentContactRequest {
  const request = sent[index];
  if (request === undefined) {
    throw new Error(
      `the page sent ${String(sent.length)} contact requests, not ${String(index + 1)}`,
    );
  }
  return request;
}

/** Eight hexadecimal characters from a random value: a typed value no other run, spec or page shares. */
export function newToken(): string {
  return randomUUID().replaceAll("-", "").slice(0, 8);
}

/** A finger on the middle of the retry, whatever it says about itself: Playwright's own `tap` waits for a control with
 *  `aria-disabled` to be enabled, so a press the page must ignore would instead wait to be allowed. */
export async function touchTheMiddleOfRetry(page: Page): Promise<void> {
  await touchTheMiddleOf(page, page.getByTestId(RETRY));
}
