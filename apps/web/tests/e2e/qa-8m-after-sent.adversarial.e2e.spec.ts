// Wave 8M, what a customer has after a send, by touch, on the production server (criteria 1, 2, 3, 11, 12, 13): for each
// channel the page is replaced by the design's confirmation, the history is no longer, the reference is the answer's,
// the channel line names the one value typed for it and no other, and a reload shows the stored reference with no typed
// value. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): it counts requests and reads the history's length.
// Each test is a new browser context, so each is its own visitor and sends one new request, registered with
// `contact-run.ts` before it leaves so that the teardown removes its row (ADR 0151).
import { expect, type Page } from "@playwright/test";

import {
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  MESSAGES,
  clientRequestIdOf,
  donePath,
  pressTheCallToAction,
  recordContactRequests,
  sentAt,
  tickConsent,
  typeInto,
  chooseChannel,
  expectFormDrawn,
  fillTheTextFields,
} from "./support/contact-page";
import {
  countAndNoteStored,
  noteVisitorOf,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import { expectEditorReady, historyLength } from "./support/qa-8d-review";
import {
  channelLineOf,
  expectNoTokenInThePage,
  expectNothingTypedKept,
  newTypedTokens,
  reachContactFromTheEditor,
  readyToSend,
  unexpectedConsoleErrors,
  watchWhatTheBrowserKeeps,
  type SentChannel,
} from "./support/qa-8m";
import { test } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It counts requests and reads the history's length on the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-after-sent.adversarial.e2e.spec.ts --project=mobile";

const run: ContactRun = startContactRun();

test.afterAll(async () => {
  for (const id of run.requestIds) {
    if (!run.storedIds.includes(id)) await countAndNoteStored(run, id);
  }
  const removal = await removeContactRun(run);

  expect(removal.requestRows, "requests removed by their ids").toBe(
    new Set(run.storedIds).size,
  );
  expect(removal.requestRowsLeft, "requests left by those ids").toBe(0);
});

test.beforeEach(() => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);
});

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

const CHANNELS: readonly SentChannel[] = ["phone", "whatsapp", "email"];

for (const channel of CHANNELS) {
  test(`ro, ${channel}: sent from the contact page, the confirmation replaces it, adds no history entry, shows the answer's reference and the value typed for the channel, and a reload shows the stored reference and no typed value`, async ({
    page,
    context,
    seededDesign,
  }) => {
    registerIdsOf(page);
    const kept = watchWhatTheBrowserKeeps(page);
    const sent = recordContactRequests(page);
    const typed = newTypedTokens(run);
    const { drawnAtMs } = await reachContactFromTheEditor(
      page,
      seededDesign,
      "ro",
    );
    await noteVisitorOf(run, context);
    await fillTheTextFields(page, typed);
    if (channel === "email") {
      await chooseChannel(page, "email");
      await typeInto(page, "email", typed.email);
    } else {
      await chooseChannel(page, channel);
    }
    await tickConsent(page);
    await readyToSend(page, drawnAtMs);
    const historyBefore = await historyLength(page);
    const answer = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/contact-submissions",
    );

    await pressTheCallToAction(page);
    const answered = (await (await answer).json()) as { reference: string };
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);

    expect(sent, "exactly one request").toHaveLength(1);
    const requestId = clientRequestIdOf(sentAt(sent, 0));
    expect(await countAndNoteStored(run, requestId)).toBe(1);
    expect(await historyLength(page), "replace, not push").toBe(historyBefore);
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(
      answered.reference,
    );

    const typedForTheChannel = channel === "email" ? typed.email : typed.phone;
    await expect(page.getByTestId("done-channel-line")).toHaveText(
      channelLineOf(
        MESSAGES.ro.submissionResult.channelLine,
        channel,
        typedForTheChannel,
      ),
    );
    const shown = await page.evaluate(() => document.body.innerText);
    const notForTheChannel = [typed.name, typed.locality].concat(
      channel === "email" ? [typed.phone] : [typed.email],
    );
    for (const value of notForTheChannel) expect(shown).not.toContain(value);

    // Criterion 3: the design is kept in this browser; no telephone claim, no profile, no dial link, no time.
    await expect(page.getByTestId("done-saved-sentence")).toHaveText(
      MESSAGES.ro.submissionResult.savedSentence,
    );
    await expect(page.getByTestId("done-saved-sentence")).not.toContainText(
      /telefon/i,
    );
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    expect(shown).not.toMatch(/\d+\s*(minut|ore\b|ora\b|zile|secunde)/i);
    expect(shown).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
    await expectNothingTypedKept(page, context, typed, kept, `${channel}: 5A`);

    // Criterion 2: a load shows the latest notified request of this design at its stored revision, and no typed value.
    await page.reload();
    await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(
      answered.reference,
    );
    await expect(page.getByTestId("done-channel-line")).toHaveText(
      MESSAGES.ro.submissionResult.channelLineWithoutValue,
    );
    await expectNoTokenInThePage(page, typed, `${channel}: reload`);
    // Criterion 18's gate: the action is drawn only for a browser known to be able to write the design, and a load of
    // this page has not asked the server about write access (only the editor does). So after a reload it is not drawn,
    // though the pinned region and the way back to the design are.
    await expect(page.getByTestId("done-whatsapp")).toHaveCount(0);
    await expect(page.getByTestId("done-back-to-design")).toBeVisible();
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    expect(unexpectedConsoleErrors(kept)).toEqual([]);
    expect(kept.pageErrors).toEqual([]);
    expect(sent, "a reload sends no request").toHaveLength(1);
  });
}

test("ro: a second request for the same design is the second confirmation, and a reload shows the latest notified request's reference, never the first's", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  const kept = watchWhatTheBrowserKeeps(page);
  const sent = recordContactRequests(page);
  const first = newTypedTokens(run);
  const second = newTypedTokens(run);

  const firstForm = await reachContactFromTheEditor(page, seededDesign, "ro");
  await noteVisitorOf(run, context);
  await fillTheTextFields(page, first);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, firstForm.drawnAtMs);
  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
  const firstReference =
    (await page.getByTestId(DONE_REFERENCE).textContent()) ?? "";
  await expect(page.getByTestId("done-channel-line")).toContainText(
    first.phone,
  );

  // Back to the design by the screen's own way, and on to a new form: the confirmation's hand-over is dropped by it.
  await page.getByTestId("done-back-to-design").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}`);
  await expectEditorReady(page);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/review`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/contact`);
  const secondDrawnAtMs = await expectFormDrawn(page);
  await fillTheTextFields(page, second);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, secondDrawnAtMs);
  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);

  const secondReference =
    (await page.getByTestId(DONE_REFERENCE).textContent()) ?? "";
  expect(secondReference).not.toBe(firstReference);
  await expect(page.getByTestId("done-channel-line")).toContainText(
    second.phone,
  );
  await expect(page.getByTestId("done-channel-line")).not.toContainText(
    first.phone,
  );
  expect(sent).toHaveLength(2);
  expect(clientRequestIdOf(sentAt(sent, 1))).not.toBe(
    clientRequestIdOf(sentAt(sent, 0)),
  );
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sent, 0))),
  ).toBe(1);
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sent, 1))),
  ).toBe(1);

  await page.reload();
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(secondReference);
  await expectNoTokenInThePage(
    page,
    first,
    "the first request's tokens after a reload",
  );
  await expectNoTokenInThePage(
    page,
    second,
    "the second request's tokens after a reload",
  );
  await expectNothingTypedKept(page, context, first, kept, "two sends, first");
  await expectNothingTypedKept(
    page,
    context,
    second,
    kept,
    "two sends, second",
  );
});
