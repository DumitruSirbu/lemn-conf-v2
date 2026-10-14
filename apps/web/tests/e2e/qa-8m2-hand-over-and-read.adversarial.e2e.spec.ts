// Wave 8M2 S4, what the contact page of a kitchen already sent for does to the hand-over and to an edit held, and how long
// its read takes (criteria 13, 15, 26 and Amendment A's A1 and A8). THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER
// (`CI=1`). Each test is a new browser context and sends one new request, registered with `contact-run.ts` before it
// leaves so that the teardown removes its row (ADR 0151). The test database only; the one direct read in it is a
// `select` of one reference through the store the server itself uses.
import { NeonContactSubmissionStore } from "@lemnaria/persistence";
import { expect, type BrowserContext } from "@playwright/test";

import {
  CTA,
  MESSAGES,
  SAVE_WAIT,
  expectFormDrawn,
} from "./support/contact-page";
import {
  countAndNoteStored,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import {
  chooseAnotherHardwareTier,
  contactPath,
  expectEditorReady,
  goBackAndSettle,
  goForwardAndSettle,
  reviewPath,
} from "./support/qa-8d-review";
import {
  channelLineOf,
  expectNoTokenInThePage,
  expectNothingTypedKept,
  watchWhatTheBrowserKeeps,
} from "./support/qa-8m";
import {
  ALREADY_SENT,
  consoleProblems,
  contactPosts,
  expectAlreadySentView,
  recordApiWrites,
  registerRequestIdsOf,
  sendOneRequestByTheForm,
  watchTheConsole,
} from "./support/qa-8m2";
import { test, type SeededDesign } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It counts requests on the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m2-hand-over-and-read.adversarial.e2e.spec.ts --project=mobile";

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

const ALREADY_SENT_HEADING_RO = MESSAGES.ro.submissionResult.alreadySentHeading;

/** The confirmation's channel line, as the catalogue words it for the phone channel. */
function phoneLine(contact: string): string {
  return channelLineOf(
    MESSAGES.ro.submissionResult.channelLine,
    "phone",
    contact,
  );
}

test("15 and 26: the contact page's mount drops the hand-over (the editor's does not), so a confirmation reached after the view, by the history, shows the channel line with no typed value; and the read the page waits for is measured", async ({
  page,
  context,
  seededDesign,
}) => {
  const id = seededDesign.id;
  registerRequestIdsOf(run, page);
  const one = await sendOneRequestByTheForm(page, context, run, seededDesign);
  const kept = watchWhatTheBrowserKeeps(page);
  const channelLine = page.getByTestId("done-channel-line");
  await expect(channelLine).toHaveText(phoneLine(one.typed.phone));

  // Control: the editor is not a design contact page, so going there and Back to the confirmation keeps the value.
  await page.getByTestId("done-back-to-design").tap();
  await page.waitForURL(`**/ro/d/${id}`);
  await expectEditorReady(page);
  await goBackAndSettle(page);
  await expect(page.getByTestId("done-reference")).toHaveText(one.reference);
  await expect(channelLine).toHaveText(phoneLine(one.typed.phone));

  // Forward to the editor and on, by the controls, to the contact page of the kitchen sent: the view.
  await goForwardAndSettle(page);
  await expectEditorReady(page);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${reviewPath("ro", id)}`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${contactPath("ro", id)}`);
  await expectAlreadySentView(page, one.reference, {
    heading: ALREADY_SENT_HEADING_RO,
  });
  await expectNoTokenInThePage(page, one.typed, "the view");

  // Back three times is the confirmation, in the same document: nothing typed is recalled.
  for (let step = 0; step < 3; step += 1) await goBackAndSettle(page);
  await expect(page.getByTestId("done-reference")).toHaveText(one.reference);
  await expect(channelLine).toHaveText(
    MESSAGES.ro.submissionResult.channelLineWithoutValue,
  );
  await expectNoTokenInThePage(page, one.typed, "the confirmation after Back");

  // And by Forward: one step back to the review and forward to the confirmation again.
  await goBackAndSettle(page);
  await goForwardAndSettle(page);
  await expect(page.getByTestId("done-reference")).toHaveText(one.reference);
  await expect(channelLine).toHaveText(
    MESSAGES.ro.submissionResult.channelLineWithoutValue,
  );
  await expectNothingTypedKept(page, context, one.typed, kept, "15: the trace");

  await measureTheRead(context, seededDesign, one.reference);
});

test("13 and 11: an edit held unsaved when the contact page of a kitchen already sent loads is the form, and the save landing keeps it the form; the page the history holds for the kitchen as sent, brought back after that save, is the form; the console stays clean", async ({
  page,
  context,
  seededDesign,
}) => {
  const id = seededDesign.id;
  registerRequestIdsOf(run, page);
  const one = await sendOneRequestByTheForm(page, context, run, seededDesign);

  // The view exists for this kitchen first, so that what follows is a change of what the page draws.
  await page.getByTestId("done-back-to-design").tap();
  await page.waitForURL(`**/ro/d/${id}`);
  await expectEditorReady(page);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${reviewPath("ro", id)}`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${contactPath("ro", id)}`);
  await expectAlreadySentView(page, one.reference, {
    heading: ALREADY_SENT_HEADING_RO,
  });

  await goBackAndSettle(page);
  await goBackAndSettle(page);
  await expectEditorReady(page);
  let releaseTheSave: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseTheSave = resolve;
  });
  await page.route(`**/api/designs/${id}`, async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${id}`,
  );
  await chooseAnotherHardwareTier(page);
  const said = watchTheConsole(page);
  await goForwardAndSettle(page);
  await goForwardAndSettle(page);
  await expect(page).toHaveURL(contactPath("ro", id));

  await expectFormDrawn(page);
  await expect(page.getByTestId(ALREADY_SENT)).toHaveCount(0);
  await expect(page.getByTestId(SAVE_WAIT)).toBeVisible();
  releaseTheSave();
  await saved;
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  await expect(page.getByTestId(CTA)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(
    page.getByTestId(ALREADY_SENT),
    "once the form, always the form: the save landing does not bring the view back",
  ).toHaveCount(0);

  // 11: the page the history holds for the kitchen as sent (r), brought back after the save landed at r+1, is the form
  // again, nothing is sent, and the console stays clean.
  const writes = recordApiWrites(page);
  await goBackAndSettle(page);
  await goBackAndSettle(page);
  await expectEditorReady(page);
  await goForwardAndSettle(page);
  await goForwardAndSettle(page);
  await expect(page).toHaveURL(contactPath("ro", id));
  await expectFormDrawn(page);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId(ALREADY_SENT)).toHaveCount(0);
  expect(contactPosts(writes)).toBe(0);
  expect(consoleProblems(said), "criterion 13").toEqual([]);
});

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return sorted[index] ?? Number.NaN;
}

function summary(label: string, samples: readonly number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    `${label}: n=${String(sorted.length)} min ${String(sorted[0])} ms, ` +
    `p50 ${String(percentile(sorted, 0.5))} ms, p95 ${String(percentile(sorted, 0.95))} ms, ` +
    `max ${String(sorted[sorted.length - 1])} ms`
  );
}

async function elapsedMs(action: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await action();
  return Math.round(performance.now() - started);
}

const READ_SAMPLES = 25;
const PAGE_SAMPLES = 12;
/** ADR 0163 A8: the contact page's read gives up at this figure. */
const READ_DEADLINE_MS = 300;

/** 26 (indicative: the test database is not production's): the store's own read, and what the contact page's document
 *  costs over the review's, measured on the request sent. */
async function measureTheRead(
  context: BrowserContext,
  design: SeededDesign,
  reference: string,
): Promise<void> {
  const id = design.id;
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === "")
    throw new Error("TEST_DATABASE_URL is not set: nothing to measure against");
  const store = new NeonContactSubmissionStore(testDatabaseUrl);
  const request = { designId: id, revision: design.revision };

  const cold = await elapsedMs(() => store.findSentReference(request));
  const reads: number[] = [];
  for (let sample = 0; sample < READ_SAMPLES; sample += 1)
    reads.push(await elapsedMs(() => store.findSentReference(request)));
  const answer = await store.findSentReference(request);
  expect(answer, "control: the store answers the row just sent").toEqual({
    kind: "sent",
    reference,
  });

  const contactLoads: number[] = [];
  const reviewLoads: number[] = [];
  for (let sample = 0; sample < PAGE_SAMPLES; sample += 1) {
    reviewLoads.push(
      await elapsedMs(async () => {
        const response = await context.request.get(reviewPath("ro", id));
        await response.text();
      }),
    );
    contactLoads.push(
      await elapsedMs(async () => {
        const response = await context.request.get(contactPath("ro", id));
        await response.text();
      }),
    );
  }
  const lines = [
    `QA8M2 the first read, cold: ${String(cold)} ms`,
    `QA8M2 ${summary("store.findSentReference, warm", reads)}`,
    `QA8M2 ${summary("GET review document", reviewLoads)}`,
    `QA8M2 ${summary("GET contact document", contactLoads)}`,
  ];
  for (const line of lines) console.log(line);

  // The fit ADR 0163 A8 names as falsifiable: a read whose p95 is near the deadline would turn real views into forms.
  const sorted = [...reads].sort((a, b) => a - b);
  expect(
    percentile(sorted, 0.95),
    `the warm read's p95 stays under the ${String(READ_DEADLINE_MS)} ms deadline`,
  ).toBeLessThan(READ_DEADLINE_MS);
}
