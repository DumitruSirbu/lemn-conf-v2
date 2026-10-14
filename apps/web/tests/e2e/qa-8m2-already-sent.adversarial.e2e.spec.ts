// Wave 8M2 S4, the contact page of a kitchen already sent for, attacked by touch on the production server (criteria 10,
// 12, 13, 14 (a) (e) (f), 25 and Amendment A's A3 to A5). THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): it
// counts requests and relies on a server process that has served the form before it serves the view. Each test is a
// new browser context, so each is its own visitor, and none sends more than the two new requests a browser may in an
// hour; every request id is registered with `contact-run.ts` before it leaves so that the teardown removes its row
// (ADR 0151). The test database only; nothing here deletes a row.
import { expect, type Page } from "@playwright/test";

import {
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  FAILURE,
  MESSAGES,
  chooseChannel,
  clientRequestIdOf,
  donePath,
  expectFormDrawn,
  fillTheTextFields,
  pressTheCallToAction,
  recordContactRequests,
  sentAt,
  tickConsent,
} from "./support/contact-page";
import {
  countAndNoteStored,
  noteVisitorOf,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import {
  contactPath,
  editorPath,
  refuseWebGL,
  reviewPath,
} from "./support/qa-8d-review";
import {
  newTypedTokens,
  reachContactFromTheEditor,
  readyToSend,
  type TypedTokens,
} from "./support/qa-8m";
import {
  ALREADY_SENT,
  CONTACT_BACK,
  COPY_REFERENCE,
  WEBGL_UNAVAILABLE,
  consoleProblems,
  contactPosts,
  expectAlreadySentView,
  recordApiWrites,
  registerRequestIdsOf,
  watchTheConsole,
} from "./support/qa-8m2";
import { test } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It counts requests on the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m2-already-sent.adversarial.e2e.spec.ts --project=mobile";

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

/** What no response to the contact page may carry (ADR 0163 A3): the row's own column names, `notified` in any case. */
const NEVER_ON_THE_WIRE = [
  "notified",
  "created_at",
  "client_request_id",
  "payload_digest",
];

function expectNoRowDetail(text: string, typed: TypedTokens, where: string) {
  const lowered = text.toLowerCase();
  for (const name of NEVER_ON_THE_WIRE)
    expect(lowered, `${where} names ${name}`).not.toContain(name);
  for (const value of Object.values(typed))
    expect(text, `${where} holds a typed value`).not.toContain(value);
}

async function readAsTheOwner(
  page: Page,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ readonly status: number; readonly text: string }> {
  const response = await page.context().request.get(path, { headers });
  return { status: response.status(), text: await response.text() };
}

test("ro and ru: a form at r, one send whose answer is lost, then a reload and a fresh navigation are the view with that request's reference, and one row; no response of the page holds a column of the row or a typed value; every control pressed sends no contact request; the console stays clean, with WebGL refused too; a stranger's browser gets neither", async ({
  page,
  context,
  browser,
  seededDesign,
}) => {
  registerRequestIdsOf(run, page);
  const id = seededDesign.id;

  // 14 (f), A4: the form at r (the server process answered `none` for it), one send whose answer the browser never sees:
  // the server stores and notifies, 5B shows, and a reload of the contact page is the view with that request's reference.
  const sent = recordContactRequests(page);
  const typed = newTypedTokens(run);
  let lostReference: string | undefined;
  let handled = 0;
  await page.route("**/api/contact-submissions", async (route) => {
    handled += 1;
    if (handled > 1) {
      await route.continue();
      return;
    }
    const answer = await route.fetch();
    lostReference = ((await answer.json()) as { reference?: string }).reference;
    await route.abort("internetdisconnected");
  });
  const { drawnAtMs } = await reachContactFromTheEditor(
    page,
    seededDesign,
    "ro",
  );
  await noteVisitorOf(run, context);
  await fillTheTextFields(page, typed);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, drawnAtMs);
  await pressTheCallToAction(page);
  await expect(page.getByTestId(FAILURE)).toBeVisible();
  const requestId = clientRequestIdOf(sentAt(sent, 0));
  expect(await countAndNoteStored(run, requestId)).toBe(1);
  const reference = lostReference ?? "";
  expect(reference, "the server answered, the page did not see it").not.toBe(
    "",
  );
  const one = { reference, typed, sent };

  const said = watchTheConsole(page);
  const writes = recordApiWrites(page);
  const flights: { text: string; isPrefetch: boolean }[] = [];
  // The client's own fetch of the page's data is read in the route, the one place its body is still there to read.
  await page.route("**/contact*", async (route) => {
    const request = route.request();
    if (request.headers().rsc !== "1") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    flights.push({
      text: await response.text(),
      isPrefetch: request.headers()["next-router-prefetch"] !== undefined,
    });
    await route.fulfill({ response });
  });
  await page.reload();
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ro.submissionResult.alreadySentHeading,
  });

  // A4, 14 (a): a fresh navigation, in the same server process, is the view with the reference the answer carried.
  await page.goto(contactPath("ro", id));
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ro.submissionResult.alreadySentHeading,
  });
  await expect(page.getByTestId(DONE_HEADING)).toHaveCount(0);
  await page.reload();
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ro.submissionResult.alreadySentHeading,
  });

  // A3: the document and the flight response, read as the owner (the control: the reference is in both, so the
  // search is of a payload that carries the page's props).
  const document = await readAsTheOwner(page, contactPath("ro", id));
  const flight = await readAsTheOwner(page, contactPath("ro", id), {
    RSC: "1",
  });
  expect(document.status).toBe(200);
  expect(flight.status).toBe(200);
  expect(document.text, "control: the document carries the props").toContain(
    one.reference,
  );
  expect(flight.text, "control: the flight carries the props").toContain(
    one.reference,
  );
  expectNoRowDetail(document.text, one.typed, "the document");
  expectNoRowDetail(flight.text, one.typed, "the flight response");
  expect(
    document.text,
    "the server render is the loading line, never the view or the form",
  ).not.toContain(`data-testid="${ALREADY_SENT}"`);
  expect(document.text).not.toContain(`data-testid="${CTA}"`);

  // A5: every control on the view, pressed. The copy control, the locale menu, the chevron.
  await page.getByTestId(COPY_REFERENCE).tap();
  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ru").tap();
  await page.waitForURL(`**${contactPath("ru", id)}`);
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ru.submissionResult.alreadySentHeading,
  });
  await page.reload();
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ru.submissionResult.alreadySentHeading,
  });
  await expect(page.getByTestId(CONTACT_BACK)).toHaveAttribute(
    "href",
    reviewPath("ru", id),
  );
  await page.getByTestId(CONTACT_BACK).tap();
  await page.waitForURL(`**${reviewPath("ru", id)}`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${contactPath("ru", id)}`);
  await expectAlreadySentView(page, one.reference, {
    heading: MESSAGES.ru.submissionResult.alreadySentHeading,
  });
  await page.waitForTimeout(1500);

  expect(contactPosts(writes), "no contact request from the view").toBe(0);
  expect(one.sent, "the page sent the one request only").toHaveLength(1);
  expect(handled, "the lost request is the only one that left").toBe(1);
  expect(await countAndNoteStored(run, requestId)).toBe(1);
  const fetchedWithProps = flights.filter(({ isPrefetch }) => !isPrefetch);
  expect(
    fetchedWithProps.length,
    "the client fetched the page's data itself",
  ).toBeGreaterThan(0);
  for (const { text, isPrefetch } of flights) {
    if (!isPrefetch)
      expect(text, "control: a flight the client fetched").toContain(
        one.reference,
      );
    expectNoRowDetail(text, one.typed, "a flight response the client fetched");
  }
  expect(consoleProblems(said), "criterion 13").toEqual([]);
  await page.evaluate(() => {
    console.warn("a control line the watcher must see");
  });
  await expect
    .poll(() => consoleProblems(said).length, {
      message: "control: the watcher sees a warning",
    })
    .toBe(1);

  // Criterion 13, WebGL refused: the view, not the unavailable exit, and nothing in the console.
  const noWebGl = await context.newPage();
  const saidWithoutWebGl = watchTheConsole(noWebGl);
  await refuseWebGL(noWebGl);
  await noWebGl.goto(contactPath("ro", id));
  await expectAlreadySentView(noWebGl, one.reference, {
    heading: MESSAGES.ro.submissionResult.alreadySentHeading,
  });
  expect(consoleProblems(saidWithoutWebGl)).toEqual([]);
  await noWebGl.goto(editorPath("ro", id));
  await expect(
    noWebGl.getByTestId(WEBGL_UNAVAILABLE),
    "control: refuseWebGL does refuse it",
  ).toBeVisible();

  // Criterion 10: a browser that does not own the design is refused before any read, so the reference is not in it.
  const stranger = await browser.newContext();
  try {
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(contactPath("ro", id));
    await expect(strangerPage.getByTestId("design-load-error")).toBeVisible();
    const foreign = await stranger.request.get(contactPath("ro", id), {
      headers: { RSC: "1" },
    });
    expect(await foreign.text()).not.toContain(one.reference);
    expect(await strangerPage.content()).not.toContain(one.reference);
  } finally {
    await stranger.close();
  }
});

test("14 (e): two forms open on one kitchen at one revision, both sent, are two notified rows, and the page shows the later one's reference, in either tab", async ({
  page,
  context,
  seededDesign,
}) => {
  const id = seededDesign.id;
  const tabB = await context.newPage();
  registerRequestIdsOf(run, page);
  registerRequestIdsOf(run, tabB);
  const sentA = recordContactRequests(page);
  const sentB = recordContactRequests(tabB);
  const typedA = newTypedTokens(run);
  const typedB = newTypedTokens(run);

  const formA = await reachContactFromTheEditor(page, seededDesign, "ro");
  await noteVisitorOf(run, context);
  await tabB.goto(contactPath("ro", id));
  const drawnB = await expectFormDrawn(tabB);
  await fillTheTextFields(page, typedA);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await fillTheTextFields(tabB, typedB);
  await chooseChannel(tabB, "phone");
  await tickConsent(tabB);
  await readyToSend(page, formA.drawnAtMs);
  await readyToSend(tabB, drawnB);

  await pressTheCallToAction(page);
  await page.waitForURL(`**${donePath("ro", id)}`);
  const referenceA =
    (await page.getByTestId(DONE_REFERENCE).textContent()) ?? "";
  await pressTheCallToAction(tabB);
  await tabB.waitForURL(`**${donePath("ro", id)}`);
  const referenceB =
    (await tabB.getByTestId(DONE_REFERENCE).textContent()) ?? "";

  expect(referenceB).not.toBe(referenceA);
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sentA, 0))),
  ).toBe(1);
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sentB, 0))),
  ).toBe(1);
  for (const tab of [page, tabB]) {
    await tab.goto(contactPath("ro", id));
    await expectAlreadySentView(tab, referenceB, {
      heading: MESSAGES.ro.submissionResult.alreadySentHeading,
    });
  }
});
