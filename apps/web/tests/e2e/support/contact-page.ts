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
export const DONE_REFERENCE = "done-reference";
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
 *  reference. Returns that reference as shown. */
export async function expectDoneShown(
  page: Page,
  locale: "ro" | "ru",
  designId: string,
): Promise<string> {
  await page.waitForURL(`**${donePath(locale, designId)}`);
  await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
  const reference = page.getByTestId(DONE_REFERENCE);
  await expect(reference).toBeVisible();
  return (await reference.textContent()) ?? "";
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
