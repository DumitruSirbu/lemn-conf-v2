// Wave 8M's main proof, by touch, in Chromium, on the production server: a request that reached the server whose answer
// the browser never saw. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`: a build and `next start`): it counts
// requests, and under `next dev` React's strict mode runs effects twice (ADR 0158 *Limits*, backlog 182).
//
// The answer is lost by `page.route` calling `route.fetch()`, which makes the request from this process and so reaches
// the server and stores the row, and then `route.abort("internetdisconnected")`, which gives the page a rejected fetch.
// The context is then taken offline and back online, which is the browser's own word that the connection is back. What
// must follow: one more request under the same id and the same body, the page replaced by the confirmation with the
// reference the first answer carried, and ONE row in the database. Every request that can reach the server is
// registered with `contact-run.ts` before it leaves, so the teardown removes its rows (ADR 0151). Each test is a new
// browser context, so each is its own visitor and sends one new request.
import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  FAILURE,
  FAILURE_HEADING,
  FAILURE_WAITING,
  MESSAGES,
  RETRY,
  clientRequestIdOf,
  donePath,
  elapsedOf,
  pressTheCallToAction,
  recordContactRequests,
  sentAt,
  withoutElapsed,
} from "./support/contact-page";
import {
  countAndNoteStored,
  noteReplayOf,
  noteVisitorOf,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import {
  expectNoTokenInThePage,
  expectNothingTypedKept,
  fillWithAllFourTokens,
  namedTokens,
  newTypedTokens,
  type TypedTokens,
  type WhatTheBrowserKept,
  reachContactFromTheEditor,
  readyToSend,
  unexpectedConsoleErrors,
  watchWhatTheBrowserKeeps,
  countConnectionEvents,
  connectionEventsSeen,
} from "./support/qa-8m";
import {
  expectReviewDrawn,
  goBackAndSettle,
  goForwardAndSettle,
  historyLength,
  recordRequests,
  reviewPath,
  toTheDesignApi,
} from "./support/qa-8d-review";
import { test } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It counts requests, which only the production server answers as the plan says. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-lost-answer.adversarial.e2e.spec.ts --project=mobile";

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

interface TheServersFirstAnswer {
  reference: string | undefined;
  readonly seenByTheServer: number[];
}

/** The first contact request is made by this process, so the server stores it, and its answer is dropped; the rest go
 *  on as the page made them. */
async function loseTheFirstAnswer(page: Page): Promise<TheServersFirstAnswer> {
  const lost: TheServersFirstAnswer = {
    reference: undefined,
    seenByTheServer: [],
  };
  let handled = 0;
  await page.route("**/api/contact-submissions", async (route) => {
    handled += 1;
    if (handled > 1) {
      await route.continue();
      return;
    }
    const answer = await route.fetch();
    lost.seenByTheServer.push(answer.status());
    const body = (await answer.json()) as { reference?: string };
    lost.reference = body.reference;
    await route.abort("internetdisconnected");
  });
  return lost;
}

interface TheTrace {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly typed: TypedTokens;
  readonly kept: WhatTheBrowserKept;
  readonly designId: string;
  readonly reference: string;
  readonly requestId: string;
}

/** Back, Forward, a language switch and a reload of the confirmation, each held to the criterion-12 list. */
async function walkTheRestOfTheTrace({
  page,
  context,
  typed,
  kept,
  designId,
  reference,
  requestId,
}: TheTrace): Promise<void> {
  const requestsOfTheTraversal = recordRequests(page);
  await goBackAndSettle(page);
  await expect(page).toHaveURL(reviewPath("ro", designId));
  await expectReviewDrawn(page);
  // Q41 (a): Back shows the tab's own copy of the review and asks the server for nothing, and the contact page that sent
  // the request is not one step back.
  expect(toTheDesignApi(requestsOfTheTraversal, designId)).toEqual([]);
  expect(
    requestsOfTheTraversal.filter(({ pathname }) =>
      pathname.endsWith("/contact"),
    ),
  ).toEqual([]);
  await expectNothingTypedKept(page, context, typed, kept, "Back");

  await goForwardAndSettle(page);
  await expect(page).toHaveURL(donePath("ro", designId));
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(reference);
  await expect(page.getByTestId("done-channel-line")).toContainText(
    typed.phone,
  );
  await expectNothingTypedKept(page, context, typed, kept, "Forward");

  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ru").tap();
  await page.waitForURL(`**${donePath("ru", designId)}`);
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(reference);
  await expect(page.getByTestId("done-channel-line")).toContainText(
    typed.phone,
  );
  await expect(page.getByTestId(DONE_HEADING)).toHaveText(
    MESSAGES.ru.submissionResult.sentHeading,
  );
  await expectNothingTypedKept(page, context, typed, kept, "language");

  await page.reload();
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(reference);
  await expect(page.getByTestId("done-channel-line")).toHaveText(
    MESSAGES.ru.submissionResult.channelLineWithoutValue,
  );
  await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
  await expectNoTokenInThePage(page, typed, "reload");
  await expectNothingTypedKept(page, context, typed, kept, "reload");

  // The page's own markup and its flight payload, asked for as a browser would, carry no token either.
  for (const headers of [{}, { rsc: "1" }]) {
    const answer = await context.request.get(donePath("ru", designId), {
      headers,
    });
    expect(answer.status()).toBe(200);
    const body = await answer.text();
    for (const [, value] of namedTokens(typed)) {
      expect(body).not.toContain(value);
    }
  }
  expect(await countAndNoteStored(run, requestId), "still one row").toBe(1);
}

for (const locale of ["ro", "ru"] as const) {
  const words = MESSAGES[locale];

  test(`${locale}: an answer the browser never saw is stored once; offline and online sends it again under its id, and the end is the confirmation with the first answer's reference`, async ({
    page,
    context,
    seededDesign,
  }) => {
    registerIdsOf(page);
    await countConnectionEvents(page);
    const kept = watchWhatTheBrowserKeeps(page);
    const sent = recordContactRequests(page);
    const typed = newTypedTokens(run);
    const { drawnAtMs } = await reachContactFromTheEditor(
      page,
      seededDesign,
      locale,
    );
    await noteVisitorOf(run, context);
    await fillWithAllFourTokens(page, typed, "phone");
    await readyToSend(page, drawnAtMs);
    const lost = await loseTheFirstAnswer(page);
    const historyBefore = await historyLength(page);

    await pressTheCallToAction(page);

    // 5B, the lost-connection sentence, with the one typed value the shop would have used and no other.
    const failure = page.getByTestId(FAILURE);
    await expect(failure).toHaveAttribute("data-screen", "lost-connection");
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    expect(
      lost.seenByTheServer,
      "the server answered the first request",
    ).toEqual([200]);
    expect(lost.reference, "the server's answer carried a reference").toMatch(
      /\S/,
    );
    const first = sentAt(sent, 0);
    const requestId = clientRequestIdOf(first);
    expect(await countAndNoteStored(run, requestId)).toBe(1);
    await expect(page.getByTestId("failure-contact-value")).toHaveText(
      typed.phone,
    );
    for (const other of [typed.name, typed.locality, typed.email]) {
      expect(await failure.innerText()).not.toContain(other);
    }
    expect(
      first.text ?? "",
      "the e-mail typed under another channel",
    ).not.toContain(typed.email);
    await expect(page.getByTestId(FAILURE_HEADING)).toBeFocused();
    await expectNothingTypedKept(page, context, typed, kept, "5B, lost answer");

    // Offline: the line that says what is awaited is drawn, and nothing is sent.
    await context.setOffline(true);
    await expect(page.getByTestId(FAILURE_WAITING)).toHaveText(
      words.submissionResult.waitingForConnection,
    );
    await expect(page.getByTestId(FAILURE_WAITING)).toHaveAttribute(
      "role",
      "status",
    );
    await expect(page.getByTestId(FAILURE_HEADING)).toBeFocused();
    expect(sent, "nothing is sent by going offline").toHaveLength(1);
    await expectNothingTypedKept(page, context, typed, kept, "5B, offline");

    if (locale === "ru") {
      // A press on 5B while offline: still 5B, the retry in its place, and no more than the one extra attempt that
      // could not leave the browser.
      await page.getByTestId(RETRY).tap();
      await expect.poll(() => sent.length).toBe(2);
      await expect(failure).toHaveAttribute("data-screen", "lost-connection");
      await expect(page.getByTestId(RETRY)).toBeFocused();
      await expect(page.getByTestId(FAILURE_WAITING)).toBeVisible();
      expect(clientRequestIdOf(sentAt(sent, 1))).toBe(requestId);
      // The press has been answered by nothing (the context is offline): the return of the connection must find the
      // page waiting again and not still sending, or the event is spent on a request that is already out.
      await expect(page.getByTestId(RETRY)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByTestId(RETRY)).toHaveText(
        MESSAGES.ru.contact.retry,
      );
    }

    // Back online: one more request, the same id and the same body, the elapsed time measured again.
    const sentBeforeReturn = sent.length;
    noteReplayOf(run, requestId);
    await context.setOffline(false);
    await page.waitForURL(`**${donePath(locale, seededDesign.id)}`);
    await expect(page.getByTestId(DONE_HEADING)).toBeVisible();

    expect(await connectionEventsSeen(page)).toEqual(["offline", "online"]);
    expect(sent).toHaveLength(sentBeforeReturn + 1);
    const again = sentAt(sent, sent.length - 1);
    expect(clientRequestIdOf(again)).toBe(requestId);
    expect(withoutElapsed(again)).toEqual(withoutElapsed(first));
    expect(elapsedOf(again)).toBeGreaterThan(elapsedOf(first));
    expect(await countAndNoteStored(run, requestId), "one row").toBe(1);
    expect(
      sent.map(clientRequestIdOf).every((id) => id === requestId),
      "every attempt carried the one id",
    ).toBe(true);

    // The end: the first answer's reference, the phone as typed, nothing else typed, focus on the heading, and the
    // history no longer than it was when the form was sent.
    await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(
      lost.reference ?? "",
    );
    await expect(page.getByTestId("done-channel-line")).toContainText(
      typed.phone,
    );
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    expect(await historyLength(page)).toBe(historyBefore);
    const screen = await page.evaluate(() => document.body.innerText);
    for (const other of [typed.name, typed.locality, typed.email]) {
      expect(screen).not.toContain(other);
    }
    await expectNothingTypedKept(page, context, typed, kept, "5A, arrived");

    if (locale === "ro") {
      await walkTheRestOfTheTrace({
        page,
        context,
        typed,
        kept,
        designId: seededDesign.id,
        reference: lost.reference ?? "",
        requestId,
      });
    }

    expect(unexpectedConsoleErrors(kept)).toEqual([]);
    expect(kept.pageErrors).toEqual([]);
  });
}

test("ro: offline before the press, the request never leaves; 5B waits for the connection, and its return sends the request, once, under one id", async ({
  page,
  context,
  seededDesign,
}) => {
  registerIdsOf(page);
  await countConnectionEvents(page);
  const sent = recordContactRequests(page);
  const typed = newTypedTokens(run);
  const { drawnAtMs } = await reachContactFromTheEditor(
    page,
    seededDesign,
    "ro",
  );
  await noteVisitorOf(run, context);
  await fillWithAllFourTokens(page, typed, "phone");
  await readyToSend(page, drawnAtMs);
  await context.setOffline(true);

  await pressTheCallToAction(page);

  await expect(page.getByTestId(FAILURE)).toHaveAttribute(
    "data-screen",
    "lost-connection",
  );
  await expect(page.getByTestId(FAILURE_WAITING)).toBeVisible();
  await expect(page.getByTestId(FAILURE_HEADING)).toBeFocused();
  expect(sent).toHaveLength(1);
  const requestId = clientRequestIdOf(sentAt(sent, 0));
  expect(await countAndNoteStored(run, requestId), "nothing reached it").toBe(
    0,
  );

  noteReplayOf(run, requestId);
  await context.setOffline(false);
  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);

  await expect(page.getByTestId(DONE_REFERENCE)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(clientRequestIdOf(sentAt(sent, 1))).toBe(requestId);
  expect(withoutElapsed(sentAt(sent, 1))).toEqual(
    withoutElapsed(sentAt(sent, 0)),
  );
  expect(await countAndNoteStored(run, requestId), "one row").toBe(1);
  await expect(page.getByTestId("done-channel-line")).toContainText(
    typed.phone,
  );
  expect(await connectionEventsSeen(page)).toEqual(["offline", "online"]);
});
