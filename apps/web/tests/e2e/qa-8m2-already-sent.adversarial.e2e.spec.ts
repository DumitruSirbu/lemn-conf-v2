// Wave 8M2 S4, the contact page of a kitchen already sent for, attacked by touch on the production server (criteria 10,
// 12, 13, 14 (a) (e) (f), 25 and Amendment A's A3 to A5). THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): it
// counts requests and relies on a server process that has served the form before it serves the view. Each test is a
// new browser context, so each is its own visitor, and none sends more than the two new requests a browser may in an
// hour; every request id is registered with `contact-run.ts` before it leaves so that the teardown removes its row
// (ADR 0151). The test database only; nothing here deletes a row.
import { expect, type Page, type Route } from "@playwright/test";

import {
  CTA,
  DONE_HEADING,
  FAILURE,
  chooseChannel,
  clientRequestIdOf,
  donePath,
  expectFormDrawn,
  expectReferenceNotShown,
  fillTheTextFields,
  nextSentReference,
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
  goBackAndSettle,
  refuseWebGL,
  reviewPath,
} from "./support/qa-8d-review";
import {
  expectNoTokenInThePage,
  newTypedTokens,
  reachContactFromTheEditor,
  readyToSend,
  type TypedTokens,
} from "./support/qa-8m";
import {
  ALREADY_SENT,
  CONTACT_BACK,
  WEBGL_UNAVAILABLE,
  consoleProblems,
  contactPosts,
  expectAlreadySentView,
  expectFocusClearOfThePinnedRegion,
  expectViewLayout,
  recordApiWrites,
  registerRequestIdsOf,
  tapTheCallLinkAndStay,
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

test("ro and ru: a form at r, one send whose answer is lost, then a reload and a fresh navigation are the view for that request, its reference in the page's data and not on the screen, and one row; no response of the page holds a column of the row or a typed value; every control pressed sends no contact request; the console stays clean, with WebGL refused too; a stranger's browser gets neither", async ({
  page,
  context,
  browser,
  seededDesign,
}) => {
  registerRequestIdsOf(run, page);
  const id = seededDesign.id;

  // 14 (f), A4: the form at r (the server process answered `none` for it), one send whose answer the browser never sees:
  // the server stores and notifies, 5B shows, and a reload of the contact page is the view for that request.
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
  const editorPrefetches: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    const isEditor = /^\/(?:ro|ru)\/d\/[^/]+$/.test(pathname);
    if (isEditor && request.headers()["next-router-prefetch"] !== undefined)
      editorPrefetches.push(pathname);
  });
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
  await expectAlreadySentView(page, one.reference, "ro");

  // A4, 14 (a): a fresh navigation, in the same server process, is the view; the reference the answer carried is in the
  // page's data (the controls below) and not on the screen (wave 8V D2).
  await page.goto(contactPath("ro", id));
  await expectAlreadySentView(page, one.reference, "ro");
  await expect(page.getByTestId(DONE_HEADING)).toHaveCount(0);
  await page.reload();
  await expectAlreadySentView(page, one.reference, "ro");
  await expectViewLayout(page, "ro 390 x 844");

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

  // A5: every control on the view, pressed. The locale menu, the chevron (the copy control left the view with the
  // reference, wave 8V D2).
  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ru").tap();
  await page.waitForURL(`**${contactPath("ru", id)}`);
  await expectAlreadySentView(page, one.reference, "ru");
  await page.reload();
  await expectAlreadySentView(page, one.reference, "ru");
  // Criteria 16 and 17, in Russian, at 390 x 844 and then at the 640 px column of a desktop width; the press of the
  // call link, the A5 sweep's one control that is not ours to handle, leaves nothing for the server.
  await expectViewLayout(page, "ru 390 x 844");
  await expectFocusClearOfThePinnedRegion(page, "ru arrival");
  // 8M2.7: the way back is a link to the editor and is never prefetched, so the view's own load asks for no editor page.
  await expect(page.getByTestId("done-back-to-design")).toHaveAttribute(
    "href",
    editorPath("ru", id),
  );
  expect(editorPrefetches, "the way back to the design was prefetched").toEqual(
    [],
  );
  await tapTheCallLinkAndStay(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectViewLayout(page, "ru 1280 x 800");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId(CONTACT_BACK)).toHaveAttribute(
    "href",
    reviewPath("ru", id),
  );
  await page.getByTestId(CONTACT_BACK).tap();
  await page.waitForURL(`**${reviewPath("ru", id)}`);
  await page.getByTestId("review-cta").tap();
  await page.waitForURL(`**${contactPath("ru", id)}`);
  await expectAlreadySentView(page, one.reference, "ru");
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
  await expectAlreadySentView(noWebGl, one.reference, "ro");
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

test("14 (e): two forms open on one kitchen at one revision, both sent, are two notified rows, and the page is the view for the later one, whose reference (never the earlier's) is in the page's data, in either tab, with neither on the screen", async ({
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

  const answeredA = nextSentReference(page);
  await pressTheCallToAction(page);
  const referenceA = await answeredA;
  await page.waitForURL(`**${donePath("ro", id)}`);
  const answeredB = nextSentReference(tabB);
  await pressTheCallToAction(tabB);
  const referenceB = await answeredB;
  await tabB.waitForURL(`**${donePath("ro", id)}`);

  expect(referenceB).not.toBe(referenceA);
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sentA, 0))),
  ).toBe(1);
  expect(
    await countAndNoteStored(run, clientRequestIdOf(sentAt(sentB, 0))),
  ).toBe(1);
  for (const tab of [page, tabB]) {
    await tab.goto(contactPath("ro", id));
    await expectAlreadySentView(tab, referenceB, "ro");
    await expectReferenceNotShown(tab, referenceA);
    const flight = await readAsTheOwner(tab, contactPath("ro", id), {
      RSC: "1",
    });
    expect(flight.text, "the page's data names the later request").toContain(
      referenceB,
    );
    expect(flight.text, "never the earlier one").not.toContain(referenceA);
  }
});

/** Every request, from now on, for this design's contact page that is not a prefetch: the document or the flight a load
 *  of the page makes, which is what a fresh server read of the sent reference would ride on. */
function recordLoadsOfTheContactPage(page: Page, designId: string): string[] {
  const loads: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (!pathname.endsWith(`/d/${designId}/contact`)) return;
    if (request.headers()["next-router-prefetch"] !== undefined) return;
    loads.push(`${request.method()} ${pathname}`);
  });
  return loads;
}

/** Aborts every send, so none reaches the server: no row, and nothing on the contact requests' run twins. Counts the
 *  presses it was asked to answer. */
async function loseEverySend(page: Page): Promise<{ answered: number }> {
  const seen = { answered: 0 };
  await page.route("**/api/contact-submissions", async (route: Route) => {
    seen.answered += 1;
    await route.abort("internetdisconnected");
  });
  return seen;
}

// A LIMIT recorded beside Q55 (a), not a requirement: the page's answer to "already sent?" is read once, when the
// document or flight for the page is made, and it is not asked again by the browser's Back. With a mocked send nothing is
// stored, so this test cannot say what a stored row would show after Back; it shows what the page can know. The claim
// "Back to a form never re-reads, so a request sent meanwhile is not seen" is inference from the zero fetches below plus
// `contactPageViewOf` (a form once decided is the form for the mount).
test("LIMIT beside Q55 (a): a form whose send was lost, left for the review by the bar and brought back by the browser's Back, is a fresh empty form and the browser asked the server for nothing about the page, so the page could not have learned of a send meanwhile", async ({
  page,
  seededDesign,
}) => {
  const id = seededDesign.id;
  const typed = newTypedTokens(run);
  const sent = recordContactRequests(page);
  const lost = await loseEverySend(page);
  const { drawnAtMs } = await reachContactFromTheEditor(
    page,
    seededDesign,
    "ro",
  );
  await fillTheTextFields(page, typed);
  await chooseChannel(page, "phone");
  await tickConsent(page);
  await readyToSend(page, drawnAtMs);
  await pressTheCallToAction(page);
  await expect(page.getByTestId(FAILURE)).toBeVisible();
  expect(sent, "one press, one attempt").toHaveLength(1);

  await page.getByTestId(CONTACT_BACK).tap();
  await page.waitForURL(`**${reviewPath("ro", id)}`);
  await expect(page.getByTestId("review-cta")).toBeVisible();
  const writes = recordApiWrites(page);
  const loadsDuringBack = recordLoadsOfTheContactPage(page, id);
  await goBackAndSettle(page);
  await expect(page).toHaveURL(contactPath("ro", id));
  await page.waitForTimeout(1500);

  // What the page shows: a form, drawn new, holding nothing of what was typed, and neither the view nor 5B.
  await expect(page.getByTestId(CTA)).toBeVisible();
  await expect(page.getByTestId(ALREADY_SENT)).toHaveCount(0);
  await expect(page.getByTestId(FAILURE)).toHaveCount(0);
  await expectNoTokenInThePage(page, typed, "the form after Back");
  const typedFields = await page
    .locator(
      'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])',
    )
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );
  expect(typedFields.length, "control: the form has fields").toBeGreaterThan(0);
  expect(
    typedFields.filter((value) => value !== ""),
    "typed fields",
  ).toEqual([]);
  await expect(page.locator('input[type="checkbox"]')).not.toBeChecked();

  // The limit: the browser asked for no data of the page, so a stored request could not have reached it.
  expect(loadsDuringBack, "Back fetched the contact page's data").toEqual([]);
  // And Back sent nothing: no attempt reached the route again, and no write of any kind left the page.
  expect(lost.answered, "Back made no send").toBe(1);
  expect(contactPosts(writes)).toBe(0);
  expect(sent).toHaveLength(1);

  // Control: the recorder sees a load of the page when there is one, so the empty list above is a measurement.
  await page.reload();
  await expect(page.getByTestId(CTA)).toBeVisible();
  expect(loadsDuringBack, "control: a reload is a load").not.toEqual([]);
});
