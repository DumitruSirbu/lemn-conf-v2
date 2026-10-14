// Wave 8M, what a customer has after a send, by touch, on the production server (criteria 1, 2, 3, 11, 12, 13): for each
// channel the page is replaced by the design's confirmation, the history is no longer, the reference is the answer's,
// the channel line names the one value typed for it and no other, and a reload shows the stored reference with no typed
// value. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): it counts requests and reads the history's length.
// Each test is a new browser context, so each is its own visitor and sends one new request, registered with
// `contact-run.ts` before it leaves so that the teardown removes its row (ADR 0151).
import {
  expect,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";

import { shopWhatsAppDigits } from "../../src/shop/shop-phone";

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
import {
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  goBackAndSettle,
  historyLength,
} from "./support/qa-8d-review";
import { ALREADY_SENT, expectAlreadySentView } from "./support/qa-8m2";
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
import { test, type SeededDesign } from "./support/seeded-design";

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
    // 8M2 criterion 8 (F3): a load of this page has not asked the server about write access (only the editor does), so
    // the store holds "checking"; the gate hides the action only for a known `false`. After a reload in the owning
    // browser the action is drawn, with the way back to the design under it.
    await expect(page.getByTestId("done-whatsapp")).toBeVisible();
    await expect(page.getByTestId("done-whatsapp-send")).toHaveText(
      MESSAGES.ro.submissionResult.sendOnWhatsapp,
    );
    await expect(page.getByTestId("done-back-to-design")).toBeVisible();
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    expect(unexpectedConsoleErrors(kept)).toEqual([]);
    expect(kept.pageErrors).toEqual([]);
    expect(sent, "a reload sends no request").toHaveLength(1);
  });
}

test("ro: after a send the contact page of the same kitchen is the already-sent view and sends nothing; only a kitchen changed and saved at a new revision gets the form again, and its send is a second confirmation whose reference a reload shows, never the first's", async ({
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

  // Back to the design by the screen's own way and on to the contact page of the kitchen just sent: 8M2's already-sent
  // view (criteria 12 and 14 (a)), not a second form. The interim view of S4 draws no call link; S5 adds it and moves
  // that pin.
  await page.getByTestId("done-back-to-design").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}`);
  await expectEditorReady(page);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/review`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/contact`);
  await expectAlreadySentView(page, firstReference, {
    heading: MESSAGES.ro.submissionResult.alreadySentHeading,
  });
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(sent, "the view sends nothing").toHaveLength(1);
  await expectNoTokenInThePage(page, first, "the view holds no typed value");

  // The kitchen changes: the editor's own edit, saved (r+1). Then the form is back, and its send carries r+1.
  await goBackAndSettle(page);
  await goBackAndSettle(page);
  await expectEditorReady(page);
  await chooseAnotherHardwareTierAndSave(page, seededDesign.id);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/review`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**/ro/d/${seededDesign.id}/contact`);
  const secondDrawnAtMs = await expectFormDrawn(page);
  await expect(page.getByTestId(ALREADY_SENT)).toHaveCount(0);
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
    (sentAt(sent, 1).body.design as { revision?: unknown }).revision,
    "the second request is for the saved revision",
  ).toBe(String(BigInt(seededDesign.revision) + 1n));
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

const WRITE_TOKEN_COOKIE_PREFIX = "lemnaria_write_token_";

async function sendOneRequest(
  page: Page,
  context: BrowserContext,
  seededDesign: SeededDesign,
): Promise<string> {
  registerIdsOf(page);
  const typed = newTypedTokens(run);
  const form = await reachContactFromTheEditor(page, seededDesign, "ro");
  await noteVisitorOf(run, context);
  await fillTheTextFields(page, typed);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, form.drawnAtMs);
  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
  const reference =
    (await page.getByTestId(DONE_REFERENCE).textContent()) ?? "";
  return reference;
}

test("ro, F3 (8M2 criterion 8): after a reload the action is drawn, /done probes nothing about write access, and the editor makes exactly one probe of its own when the customer goes on", async ({
  page,
  context,
  seededDesign,
}) => {
  const designReads: string[] = [];
  page.on("request", (request: Request) => {
    if (new URL(request.url()).pathname === `/api/designs/${seededDesign.id}`) {
      designReads.push(request.method());
    }
  });
  await sendOneRequest(page, context, seededDesign);
  // The editor was opened on the way to the form and probed then; what counts is what happens from the reload on.
  designReads.length = 0;
  await page.reload();
  await expect(page.getByTestId("done-whatsapp-send")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(designReads, "/done after a reload probes nothing").toEqual([]);

  await page.getByTestId("done-back-to-design").tap();
  await expectEditorReady(page);

  expect(designReads, "the editor's own probe, and only it").toEqual(["GET"]);
});

test("ro, 8M2 criterion 9: after a reload the message to the shop names the reference on the screen, is addressed to the shop's number, and carries the customer's own share address", async ({
  page,
  context,
  seededDesign,
  baseURL,
}) => {
  const reference = await sendOneRequest(page, context, seededDesign);
  await page.reload();
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(reference);

  await page.getByTestId("done-whatsapp-send").tap();

  const open = page.getByTestId("done-whatsapp-open");
  await expect(open).toBeVisible();
  const href = (await open.getAttribute("href")) ?? "";
  const recipient = `https://wa.me/${shopWhatsAppDigits()}?text=`;
  expect(href.startsWith(recipient), "addressed to the shop").toBe(true);
  expect(href.startsWith("https://wa.me/?text=")).toBe(false);
  const message = decodeURIComponent(href.slice(recipient.length));
  expect(message).toContain(reference);
  const origin = new URL(baseURL ?? "").origin;
  expect(message).toMatch(new RegExp(`${origin}/[^ ]+$`));
});

test("ro, F3 (8M2 criterion 8): without the write cookie the action is still drawn after a reload; one press makes one status request and shows the error and its retry, and nothing repeats without a press", async ({
  page,
  context,
  seededDesign,
}) => {
  const shareMethods: string[] = [];
  page.on("request", (request: Request) => {
    if (
      new URL(request.url()).pathname ===
      `/api/designs/${seededDesign.id}/share`
    ) {
      shareMethods.push(request.method());
    }
  });
  await sendOneRequest(page, context, seededDesign);
  await context.clearCookies({
    name: `${WRITE_TOKEN_COOKIE_PREFIX}${seededDesign.id}`,
  });
  const names = (await context.cookies()).map(({ name }) => name);
  expect(names.some((name) => name.startsWith(WRITE_TOKEN_COOKIE_PREFIX))).toBe(
    false,
  );
  await page.reload();
  await expect(page.getByTestId("done-whatsapp-send")).toBeVisible();
  expect(shareMethods, "a load asks nothing").toEqual([]);

  await page.getByTestId("done-whatsapp-send").tap();

  await expect(page.getByTestId("done-whatsapp-error")).toHaveText(
    MESSAGES.ro.share.error,
  );
  await expect(page.getByTestId("done-whatsapp-retry")).toBeVisible();
  await page.waitForTimeout(2000);
  expect(shareMethods, "one status request for one press").toEqual(["GET"]);
  await expect(page.getByTestId("done-whatsapp-open")).toHaveCount(0);
});
