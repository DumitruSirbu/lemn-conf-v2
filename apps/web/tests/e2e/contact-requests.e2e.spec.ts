// Wave 8L, the contact form's requests, counted. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`: a build and
// `next start`): with `CI` unset Playwright boots `next dev`, React's strict mode runs effects twice, and an exact count
// of requests cannot be trusted either way (ADR 0158 *Limits*, backlog 182). Its evidence is a `CI=1` run, never
// `pnpm ci:local`, whose e2e step runs `next dev` until Q42 is answered.
//
// Criteria 3 to 6, 10, 11 and 14 of the plan's point 4, by touch, in the mobile project. A browser may send two new
// contact requests an hour, so no test sends more than two; every request that can reach the server is registered with
// `contact-run.ts` before it leaves, so the teardown removes its row (ADR 0151). Answers a test needs the server not to
// give are made by `page.route` and never reach it. The form is open for 2.4 seconds before a tap that must succeed:
// the server refuses a request made sooner (Q39).
import { isSubmissionReference } from "@lemnaria/persistence";
import { isClientRequestId } from "@lemnaria/configurator-domain";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import {
  ANSWERS,
  BACK,
  BOTTOM,
  CARD,
  clientRequestIdOf,
  CONSENT,
  contactDocumentPath,
  CTA,
  elapsedOf,
  expectFormDrawn,
  fillTheWholeForm,
  field,
  MESSAGES,
  NETWORK_FAILURE,
  openContactPage,
  OUTCOME,
  pressTheCallToAction,
  recordContactRequests,
  referenceIn,
  sentAt,
  RETRY,
  REVIEW_LINK_IN_OUTCOME,
  SAVE_WAIT as CONTACT_SAVE_WAIT,
  SENDING_LINE,
  SENT,
  typeInto,
  waitForTheLeastFormTime,
  withoutElapsed,
  answerContactInOrder,
  answerContactWith,
  fillTheTextFields,
} from "./support/contact-page";
import {
  countAndNoteStored,
  newAddress,
  newName,
  newPhone,
  noteVisitorOf,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import {
  chooseAnotherHardwareTier,
  chooseAnotherHardwareTierAndSave,
  contactPath,
  expectEditorReady,
  expectReviewDrawn,
  goBackAndSettle,
  goForwardAndSettle,
  historyLength,
  recordRequests,
  REVIEW_CTA,
  reviewPath,
  toTheDesignApi,
} from "./support/qa-8d-review";
import { deleteMintedDesigns } from "./support/minted-designs";
import { openSeededDesign, test } from "./support/seeded-design";
import { seedDesign } from "./support/u-design";

const ro = MESSAGES.ro.contact;
const FIGURE = '[data-section="figure"]';
const ROOM_LINE = '[data-section="roomLine"]';
const SETTINGS_ROW = '[data-section="settingsRow"]';
const CARD_SELECTOR = `[data-testid="${CARD}"]`;
/** Long enough for a request a tap had caused to have left the page. */
const SETTLE_MS = 1500;
const HELD_FOR_MS = 10_000;
const PRESS_EVERY_MS = 2500;

const run: ContactRun = startContactRun();

test.afterAll(async () => {
  // A test that failed before it counted its rows must not leave them to be reported as the next failure.
  for (const id of run.requestIds) {
    if (!run.storedIds.includes(id)) await countAndNoteStored(run, id);
  }
  const removal = await removeContactRun(run);

  expect(removal.requestRows, "requests removed by their ids").toBe(
    run.storedIds.length,
  );
  expect(removal.requestRowsLeft, "requests left by those ids").toBe(0);
});

/** Registers every id a page sends the moment it leaves, so a test that fails half way still cleans up. */
function registerIdsOf(page: Page): void {
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/contact-submissions") return;
    const text = request.postData();
    if (text === null) return;
    const id = (JSON.parse(text) as { clientRequestId?: unknown })
      .clientRequestId;
    if (typeof id === "string") run.requestIds.push(id);
  });
}

function validValues(): { name: string; phone: string; locality: string } {
  return { name: newName(), phone: newPhone(), locality: "Chisinau" };
}

async function fillAndWait(page: Page, drawnAtMs: number): Promise<void> {
  await fillTheWholeForm(page, validValues());
  await waitForTheLeastFormTime(drawnAtMs);
}

test("criterion 3: with consent unticked a press makes no request, shows the consent sentence and puts focus on consent", async ({
  page,
  seededDesign,
}) => {
  registerIdsOf(page);
  const sent = recordContactRequests(page);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  await fillTheTextFields(page, validValues());
  await waitForTheLeastFormTime(drawnAtMs);

  await pressTheCallToAction(page);

  await expect(page.getByTestId(CONSENT).getByRole("alert")).toHaveText(
    new RegExp(ro.fieldErrors.CONSENT_NOT_GIVEN),
  );
  await expect(page.locator('input[name="consent"]')).toBeFocused();
  await page.waitForTimeout(SETTLE_MS);
  expect(sent).toEqual([]);
  // The consent control and its sentence stand in the pinned region with the call to action (frame 4A), with the
  // provisional mark beside the sentence and no link to a notice that does not exist.
  const bottom = page.getByTestId(BOTTOM);
  await expect(bottom.getByTestId(CONSENT)).toContainText(ro.consent);
  await expect(bottom.getByTestId(CONSENT)).toContainText(
    ro.consentProvisionalMarker,
  );
  await expect(bottom.getByTestId(CONSENT).locator("a")).toHaveCount(0);
});

test("criteria 4 and 10: while the answer is held, presses made in one task, taps 50 ms apart, Enter and taps for ten seconds send one request, and the screen is the sending state", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  await fillAndWait(page, drawnAtMs);
  let releaseTheAnswer: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseTheAnswer = resolve;
  });
  await answerContactWith(page, async (route) => {
    await held;
    await route.continue();
  });
  const callToAction = page.getByTestId(CTA);

  // Two presses dispatched in one task, before any answer and before any render of the sending state.
  await callToAction.evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
  });

  await expect(callToAction).toHaveAttribute("aria-disabled", "true");
  await expect(callToAction).toHaveText(ro.sending);
  await expect(page.getByTestId(SENDING_LINE)).toHaveText(ro.sendingLine);
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[inert][data-dimmed='true']")).toHaveCount(2);
  const typedName = await page.locator('input[name="name"]').inputValue();
  expect(typedName).not.toBe("");
  const box = await callToAction.boundingBox();
  if (box === null) throw new Error("the call to action has no box");
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.touchscreen.tap(middle.x, middle.y);
  await page.waitForTimeout(50);
  await page.touchscreen.tap(middle.x, middle.y);
  await callToAction.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");

  // An inert field takes neither focus nor a tap, though its values stay readable.
  await page.locator('input[name="name"]').tap({ force: true });
  expect(
    await page.evaluate(
      () => document.activeElement?.getAttribute("name") === "name",
    ),
  ).toBe(false);
  expect(await page.locator('input[name="name"]').inputValue()).toBe(typedName);

  for (let elapsed = 0; elapsed < HELD_FOR_MS; elapsed += PRESS_EVERY_MS) {
    await page.waitForTimeout(PRESS_EVERY_MS);
    await page.touchscreen.tap(middle.x, middle.y);
    expect(sent, `after ${String(elapsed)} ms held`).toHaveLength(1);
  }
  expect(sent).toHaveLength(1);

  releaseTheAnswer();

  await expect(page.getByTestId(SENT)).toBeVisible();
  const shown = (await page.getByTestId(SENT).textContent()) ?? "";
  const reference = referenceIn(shown, ro.outcomes.sent);
  expect(isSubmissionReference(reference), shown).toBe(true);
  expect(sent).toHaveLength(1);
  const [only] = sent;
  if (only === undefined) throw new Error("no request was sent");
  expect(isClientRequestId(clientRequestIdOf(only))).toBe(true);
  expect(only.body).toMatchObject({
    locale: "ro",
    honeypot: "",
    design: { id: seededDesign.id, revision: seededDesign.revision },
  });
  expect(only.body.contact).toMatchObject({
    channel: "phone",
    consent: true,
    consentTextVersion: "placeholder",
  });
  expect(only.body).not.toHaveProperty("intent");
  expect(only.body.contact).not.toHaveProperty("email");
  expect(elapsedOf(only)).toBeGreaterThanOrEqual(2000);
  expect(await countAndNoteStored(run, clientRequestIdOf(only))).toBe(1);
});

test("criterion 11: a request answered 503 is sent again with the same id and the same body but for the elapsed time, which is measured again", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  await fillAndWait(page, drawnAtMs);
  await answerContactInOrder(page, [ANSWERS.unavailable]);

  await pressTheCallToAction(page);
  await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
    "data-outcome",
    "failed",
  );
  await expect(page.getByTestId(OUTCOME)).toContainText(ro.outcomes.failed);
  await expect(page.getByTestId(OUTCOME)).not.toContainText(/CONTACT|503/);
  await page.waitForTimeout(300);
  await page.getByTestId(RETRY).tap();

  await expect(page.getByTestId(SENT)).toBeVisible();
  expect(sent).toHaveLength(2);
  const [first, second] = sent;
  if (first === undefined || second === undefined) throw new Error("two sends");
  expect(clientRequestIdOf(second)).toBe(clientRequestIdOf(first));
  expect(withoutElapsed(second)).toEqual(withoutElapsed(first));
  expect(elapsedOf(second)).toBeGreaterThan(elapsedOf(first));
  expect(await countAndNoteStored(run, clientRequestIdOf(second))).toBe(1);
});

test.describe("every class of answer, driven through the screen (the server is not reached)", () => {
  interface ClassCase {
    readonly name: string;
    readonly answer: Parameters<typeof answerContactWith>[1];
    readonly outcome: string;
    readonly sentence: string | undefined;
    readonly isSendable: boolean;
    readonly keepsId: boolean;
  }

  const CLASS_CASES: readonly ClassCase[] = [
    {
      name: "200 that is not a send",
      answer: ANSWERS.notAnAnswerWeKnow,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "a 200 that is not JSON",
      answer: ANSWERS.unreadable,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "400 CONTACT_REJECTED",
      answer: ANSWERS.rejected,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "502, the notice not sent, a retry may follow",
      answer: ANSWERS.noticeNotSentRetry,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "502, the notice not sent",
      answer: ANSWERS.noticeNotSent,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "503",
      answer: ANSWERS.unavailable,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "a network failure",
      answer: NETWORK_FAILURE,
      outcome: "failed",
      sentence: ro.outcomes.failed,
      isSendable: true,
      keepsId: true,
    },
    {
      name: "409 CONTACT_REQUEST_CONFLICT",
      answer: ANSWERS.conflict,
      outcome: "conflict",
      sentence: ro.outcomes.conflict,
      isSendable: true,
      keepsId: false,
    },
  ];

  for (const testCase of CLASS_CASES) {
    test(`${testCase.name}: its one sentence, no code, a send is offered, and ${testCase.keepsId ? "the same id is kept" : "the next id is new"}`, async ({
      page,
      seededDesign,
    }) => {
      registerIdsOf(page);
      const sent = recordContactRequests(page);
      const { drawnAtMs } = await openContactPage(
        page,
        contactDocumentPath("ro", seededDesign.id),
      );
      await fillAndWait(page, drawnAtMs);
      await answerContactWith(page, testCase.answer);

      await pressTheCallToAction(page);

      const outcome = page.getByTestId(OUTCOME);
      await expect(outcome).toHaveAttribute("data-outcome", testCase.outcome);
      await expect(outcome).toContainText(testCase.sentence ?? "");
      expect(await outcome.innerText()).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      await expect(page.getByTestId(CTA)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await page.getByTestId(CTA).tap();
      await expect.poll(() => sent.length).toBe(2);
      const [first, second] = sent;
      if (first === undefined || second === undefined) throw new Error("two");
      if (testCase.keepsId) {
        expect(clientRequestIdOf(second)).toBe(clientRequestIdOf(first));
        expect(withoutElapsed(second)).toEqual(withoutElapsed(first));
      } else {
        expect(clientRequestIdOf(second)).not.toBe(clientRequestIdOf(first));
        expect(withoutElapsed(second)).toEqual({
          ...(withoutElapsed(first) as object),
          clientRequestId: clientRequestIdOf(second),
        });
      }
    });
  }

  test("400 CONTACT_INVALID: each issue stands beside its field by its code, the id is kept while no covered field changed and is new once one did", async ({
    page,
    seededDesign,
  }) => {
    registerIdsOf(page);
    const sent = recordContactRequests(page);
    const { drawnAtMs } = await openContactPage(
      page,
      contactDocumentPath("ro", seededDesign.id),
    );
    await fillAndWait(page, drawnAtMs);
    await answerContactWith(page, ANSWERS.invalidPhone);

    await pressTheCallToAction(page);

    await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
      "data-outcome",
      "refused",
    );
    const phone = field(page, "phone");
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.locator("form").getByRole("alert").filter({
        hasText: ro.fieldErrors.PHONE_MOLDOVAN_INCOMPLETE,
      }),
    ).toHaveCount(1);
    expect(await page.locator("form").innerText()).not.toMatch(
      /PHONE_MOLDOVAN_INCOMPLETE|CONTACT_INVALID/,
    );

    await page.getByTestId(CTA).tap();
    await expect.poll(() => sent.length).toBe(2);
    await typeInto(page, "locality", "Balti");
    await page.getByTestId(CTA).tap();
    await expect.poll(() => sent.length).toBe(3);

    const [first, second, third] = sent;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three sends");
    }
    expect(clientRequestIdOf(second)).toBe(clientRequestIdOf(first));
    expect(clientRequestIdOf(third)).not.toBe(clientRequestIdOf(second));
  });

  test("429: the sentence names a clock time, nothing is sent before the wait has passed, and the button comes on and sends once it has", async ({
    page,
    seededDesign,
  }) => {
    registerIdsOf(page);
    const sent = recordContactRequests(page);
    const { drawnAtMs } = await openContactPage(
      page,
      contactDocumentPath("ro", seededDesign.id),
    );
    await fillAndWait(page, drawnAtMs);
    await answerContactInOrder(page, [
      ANSWERS.limited("12"),
      ANSWERS.sent("LMN-E2E-0000"),
    ]);

    await pressTheCallToAction(page);

    const outcome = page.getByTestId(OUTCOME);
    await expect(outcome).toHaveAttribute("data-outcome", "limited");
    await expect(outcome).toContainText(/\d{1,2}:\d{2}/);
    await expect(page.getByTestId(CTA)).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await pressTheCallToAction(page);
    await page.waitForTimeout(1000);
    expect(sent).toHaveLength(1);

    await expect(outcome).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId(CTA)).not.toHaveAttribute("aria-disabled");
    await page.getByTestId(CTA).tap();

    await expect(page.getByTestId(SENT)).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(clientRequestIdOf(sentAt(sent, 1))).toBe(
      clientRequestIdOf(sentAt(sent, 0)),
    );
  });
});

test("criterion 5: an edit still being saved keeps the contact page's send off and the press sends nothing; when the save is answered the next send carries the saved revision, not the page's", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  await openSeededDesign(page, seededDesign);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(contactPath("ro", seededDesign.id));
  await expectFormDrawn(page);
  await goBackAndSettle(page);
  await goBackAndSettle(page);
  await expectEditorReady(page);

  let releaseTheSave: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseTheSave = resolve;
  });
  await page.route(`**/api/designs/${seededDesign.id}`, async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  await chooseAnotherHardwareTier(page);
  await goForwardAndSettle(page);
  await goForwardAndSettle(page);
  await expect(page).toHaveURL(contactPath("ro", seededDesign.id));
  const drawnAtMs = await expectFormDrawn(page);

  await expect(page.getByTestId(CONTACT_SAVE_WAIT)).toHaveText(
    APPROVED_ROMANIAN_MESSAGES.reviewScreen.saving,
  );
  await expect(page.getByTestId(CTA)).toHaveAttribute("aria-disabled", "true");
  await fillTheWholeForm(page, validValues());
  await waitForTheLeastFormTime(drawnAtMs);
  await pressTheCallToAction(page);
  await page.waitForTimeout(SETTLE_MS);
  expect(sent).toEqual([]);

  releaseTheSave();
  await saved;

  await expect(page.getByTestId(CONTACT_SAVE_WAIT)).toHaveCount(0);
  await expect(page.getByTestId(CTA)).not.toHaveAttribute("aria-disabled");
  await pressTheCallToAction(page);

  await expect(page.getByTestId(SENT)).toBeVisible();
  expect(sent).toHaveLength(1);
  const [only] = sent;
  if (only === undefined) throw new Error("no send");
  const savedRevision = String(BigInt(seededDesign.revision) + 1n);
  expect(only.body.design).toEqual({
    id: seededDesign.id,
    revision: savedRevision,
  });
  expect(await countAndNoteStored(run, clientRequestIdOf(only))).toBe(1);
});

test("criterion 14 (a): the link after 'design not current' fetches the review once, adds one history entry, shows the stored copy, and its call to action leads to a send at the new revision answered 200", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  const sent = recordContactRequests(page);

  const otherPage = await context.newPage();
  await openSeededDesign(otherPage, seededDesign);
  await chooseAnotherHardwareTierAndSave(otherPage, seededDesign.id);
  await otherPage.getByTestId(REVIEW_CTA).tap();
  await expectReviewDrawn(otherPage);
  const roomLineSaved = await otherPage.locator(ROOM_LINE).textContent();
  const figureSaved = await otherPage.locator(FIGURE).textContent();
  const settingsSaved = await otherPage.locator(SETTINGS_ROW).textContent();
  await otherPage.close();

  await page.bringToFront();
  await fillAndWait(page, drawnAtMs);
  await pressTheCallToAction(page);

  const outcome = page.getByTestId(OUTCOME);
  await expect(outcome).toHaveAttribute("data-outcome", "design-not-current");
  await expect(outcome).toContainText(ro.outcomes.designNotCurrent);
  expect(await outcome.innerText()).not.toMatch(/[A-Z]{2,}_[A-Z_]+|409/);
  await expect(page.getByTestId(CTA)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId(RETRY)).toHaveCount(0);
  const link = page.getByTestId(REVIEW_LINK_IN_OUTCOME);
  await expect(link).toHaveAttribute("href", reviewPath("ro", seededDesign.id));
  const lengthBefore = await historyLength(page);
  const requests = recordRequests(page);

  await link.tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  expect(await historyLength(page)).toBe(lengthBefore + 1);
  const forTheReview = requests.filter(
    (request) => request.pathname === reviewPath("ro", seededDesign.id),
  );
  expect(forTheReview).toHaveLength(1);
  expect(forTheReview[0]?.search).toMatch(/_rsc=/);
  await expect(page.locator(ROOM_LINE)).toHaveText(roomLineSaved ?? "");
  await expect(page.locator(FIGURE)).toHaveText(figureSaved ?? "");
  await expect(page.locator(SETTINGS_ROW)).toHaveText(settingsSaved ?? "");

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(contactPath("ro", seededDesign.id));
  const secondDrawnAtMs = await expectFormDrawn(page);
  expect(
    (await page.locator(`${CARD_SELECTOR} ${FIGURE}`).textContent())?.replace(
      /\s/g,
      "",
    ),
  ).toBe(figureSaved?.replace(/\s/g, ""));
  await fillAndWait(page, secondDrawnAtMs);
  await pressTheCallToAction(page);

  await expect(page.getByTestId(SENT)).toBeVisible();
  expect(sent).toHaveLength(2);
  const [first, second] = sent;
  if (first === undefined || second === undefined) throw new Error("two");
  expect(first.body.design).toEqual({
    id: seededDesign.id,
    revision: seededDesign.revision,
  });
  const savedRevision = String(BigInt(seededDesign.revision) + 1n);
  expect(second.body.design).toEqual({
    id: seededDesign.id,
    revision: savedRevision,
  });
  expect(await countAndNoteStored(run, clientRequestIdOf(second))).toBe(1);
  expect(await countAndNoteStored(run, clientRequestIdOf(first))).toBe(0);
});

test("criterion 14 (b): arriving at the contact page from the review asks the design's API for nothing and fetches the contact page once", async ({
  page,
  seededDesign,
}) => {
  await page.goto(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);
  const requests = recordRequests(page);

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(contactPath("ro", seededDesign.id));
  await expectFormDrawn(page);
  await page.waitForTimeout(SETTLE_MS);

  expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);
  expect(
    requests.filter(
      (request) =>
        request.pathname === contactPath("ro", seededDesign.id) &&
        request.search.includes("_rsc="),
    ),
  ).toHaveLength(1);
});

test("the contact page's way back is the review, fetched: one history entry and one request for it, never a step back", async ({
  page,
  seededDesign,
}) => {
  await openContactPage(page, contactDocumentPath("ro", seededDesign.id));
  await expect(page.getByTestId(BACK)).toHaveAttribute(
    "href",
    reviewPath("ro", seededDesign.id),
  );
  const lengthBefore = await historyLength(page);
  const requests = recordRequests(page);

  await page.getByTestId(BACK).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  expect(await historyLength(page)).toBe(lengthBefore + 1);
  expect(
    requests.filter(
      (request) => request.pathname === reviewPath("ro", seededDesign.id),
    ),
  ).toHaveLength(1);
});

test("criterion 6: nothing typed is in a cookie, storage, a URL, a request but the one send, the console or the page's history, before and after the send", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  const typed = {
    name: newName(),
    phone: newPhone(),
    locality: `Loc${newName().slice(4)}`,
    email: newAddress(run),
  };
  const everything = watchEverythingTheBrowserKeeps(page);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  await fillTheWholeForm(page, typed);
  await waitForTheLeastFormTime(drawnAtMs);

  await expectNoneOfThemKept(page, context, typed, everything);

  await pressTheCallToAction(page);
  await expect(page.getByTestId(SENT)).toBeVisible();

  await expectNoneOfThemKept(page, context, typed, everything);
  expect(sent).toHaveLength(1);
  const body = sent[0]?.text ?? "";
  for (const value of Object.values(typed)) expect(body).toContain(value);
  const [only] = sent;
  if (only === undefined) throw new Error("no send");
  expect(await countAndNoteStored(run, clientRequestIdOf(only))).toBe(1);
});

interface WhatTheBrowserKept {
  readonly urls: string[];
  readonly otherRequestBodies: string[];
  readonly console: string[];
}

function watchEverythingTheBrowserKeeps(page: Page): WhatTheBrowserKept {
  const kept: WhatTheBrowserKept = {
    urls: [],
    otherRequestBodies: [],
    console: [],
  };
  page.on("request", (request) => {
    kept.urls.push(request.url());
    const isTheSend =
      new URL(request.url()).pathname === "/api/contact-submissions";
    if (!isTheSend) kept.otherRequestBodies.push(request.postData() ?? "");
  });
  page.on("framenavigated", (frame) => kept.urls.push(frame.url()));
  page.on("console", (message) => kept.console.push(message.text()));
  page.on("pageerror", (error) => kept.console.push(error.message));
  return kept;
}

async function expectNoneOfThemKept(
  page: Page,
  context: BrowserContext,
  typed: Readonly<Record<string, string>>,
  kept: WhatTheBrowserKept,
): Promise<void> {
  const inThePage = await page.evaluate(async () => ({
    cookie: document.cookie,
    local: JSON.stringify(
      Object.fromEntries(Object.entries(window.localStorage)),
    ),
    session: JSON.stringify(
      Object.fromEntries(Object.entries(window.sessionStorage)),
    ),
    databases: JSON.stringify(
      (await window.indexedDB.databases()).map(({ name }) => name),
    ),
    historyState: JSON.stringify(window.history.state),
    location: window.location.href,
    resources: JSON.stringify(
      performance.getEntriesByType("resource").map(({ name }) => name),
    ),
    title: document.title,
  }));
  const holders: Readonly<Record<string, string>> = {
    ...inThePage,
    contextCookies: JSON.stringify(await context.cookies()),
    urlsOfTheRun: kept.urls.join("\n"),
    otherRequestBodies: kept.otherRequestBodies.join("\n"),
    console: kept.console.join("\n"),
  };
  for (const [holder, text] of Object.entries(holders)) {
    for (const [fieldName, value] of Object.entries(typed)) {
      expect(text, `${holder} holds the ${fieldName}`).not.toContain(value);
      expect(
        text.toLowerCase(),
        `${holder} holds the ${fieldName}, encoded`,
      ).not.toContain(encodeURIComponent(value).toLowerCase());
    }
  }
}

test("criterion 17: a design the review refuses shows that refusal and the way back to the review, and no form, input or call to action", async ({
  page,
}) => {
  const minted = await seedDesign(page, NARROWED_ROOM_OVERFLOWING_DESIGN);
  try {
    const sent = recordContactRequests(page);
    await page.goto(contactDocumentPath("ro", minted.id));

    await expect(page.getByTestId("contact-refused")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    await expect(page.getByTestId("contact-review-link")).toHaveAttribute(
      "href",
      reviewPath("ro", minted.id),
    );
    await expect(page.locator('[data-section="refusal"]')).not.toHaveText("");
    expect(sent).toEqual([]);
  } finally {
    await deleteMintedDesigns([minted.id]);
  }
});

test("a filled honeypot is refused as the failed sentence and stores nothing; emptied, the same id is stored", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  const { drawnAtMs } = await openContactPage(
    page,
    contactDocumentPath("ro", seededDesign.id),
  );
  await fillAndWait(page, drawnAtMs);
  const honeypot = field(page, "reference_note");
  await honeypot.fill("a bot wrote here", { force: true });

  await pressTheCallToAction(page);

  await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
    "data-outcome",
    "failed",
  );
  expect(sent).toHaveLength(1);
  const [first] = sent;
  if (first === undefined) throw new Error("no send");
  expect(first.body.honeypot).toBe("a bot wrote here");
  expect(await countAndNoteStored(run, clientRequestIdOf(first))).toBe(0);

  await honeypot.fill("", { force: true });
  await page.getByTestId(RETRY).tap();

  await expect(page.getByTestId(SENT)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]?.body.honeypot).toBe("");
  expect(sent[1]?.body.clientRequestId).toBe(first.body.clientRequestId);
  expect(await countAndNoteStored(run, clientRequestIdOf(first))).toBe(1);
});

test("a form sent within two seconds of being drawn is refused as the failed sentence; sent after two seconds it is stored under the same id", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await noteVisitorOf(run, context);
  const sent = recordContactRequests(page);
  await openContactPage(page, contactDocumentPath("ro", seededDesign.id));
  const startedAtMs = Date.now();
  await fillTheWholeForm(page, validValues());

  await pressTheCallToAction(page);

  await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
    "data-outcome",
    "failed",
  );
  const [first] = sent;
  if (first === undefined) throw new Error("no send");
  expect(elapsedOf(first)).toBeLessThan(2000);
  expect(await countAndNoteStored(run, clientRequestIdOf(first))).toBe(0);

  await waitForTheLeastFormTime(startedAtMs);
  await page.getByTestId(RETRY).tap();

  await expect(page.getByTestId(SENT)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]?.body.clientRequestId).toBe(first.body.clientRequestId);
  expect(elapsedOf(sentAt(sent, 1))).toBeGreaterThanOrEqual(2000);
  expect(await countAndNoteStored(run, clientRequestIdOf(first))).toBe(1);
});
