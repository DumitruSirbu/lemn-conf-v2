// Wave 8M frame 5B and the automatic retry, by touch, in Chromium (criteria 4 to 6, 13, 19). THIS FILE HOLDS ONLY ON THE
// PRODUCTION SERVER (`CI=1`): it counts requests, and under `next dev` React's strict mode runs effects twice (ADR 0158
// *Limits*, backlog 182). Every answer is made by `page.route` and the server is not reached, so no row is stored and no
// bucket is spent: what is proved here is what the page sends and shows. The lost answer that does reach the server, and
// its one row, is `qa-8m-lost-answer`'s.
import { expect, type Page } from "@playwright/test";

import {
  ANSWERS,
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  FAILURE,
  FAILURE_HEADING,
  FAILURE_SENTENCE,
  FAILURE_WAITING,
  MESSAGES,
  NETWORK_FAILURE,
  OUTCOME,
  RETRY,
  answerContactInOrder,
  callbackPath,
  clientRequestIdOf,
  contactDocumentPath,
  designAddressOf,
  donePath,
  expectDesignLinkShown,
  expectFormDrawn,
  expectReferenceNotShown,
  fillTheWholeForm,
  newToken,
  pressTheCallToAction,
  recordContactRequests,
  sentAt,
  touchTheMiddleOfRetry,
  withoutElapsed,
  type RouteAnswer,
} from "./support/contact-page";
import { historyLength } from "./support/qa-8d-review";
import { test } from "./support/seeded-design";
import { shopTelAddress } from "../../src/shop/shop-phone";

const RUN_UNDER_CI =
  "It counts requests, which only the production server answers as the plan says. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-failure-screens.adversarial.e2e.spec.ts --project=mobile";

test.beforeEach(() => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);
});

const ro = MESSAGES.ro;
/** Long enough for a request that an event had caused to have left the page. */
const SETTLE_MS = 1500;

/** Criterion 16: 5B draws the one call link, dialling the shop's constant, after the retry in the document and below it
 *  on the screen, named as the catalogue names it; no other `tel:` link is on the page. */
async function expectOneCallLinkUnderTheRetry(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  const link = page.getByTestId("call-shop-link");
  await expect(link).toHaveCount(1);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(1);
  await expect(link).toHaveAttribute("href", shopTelAddress());
  await expect(link).toContainText(MESSAGES[locale].submissionResult.callShop);
  const retryBox = await page.getByTestId(RETRY).boundingBox();
  const linkBox = await link.boundingBox();
  expect(retryBox, "the retry is drawn").not.toBeNull();
  expect(linkBox, "the call link is drawn").not.toBeNull();
  expect(linkBox?.y ?? 0, "the call link is under the retry").toBeGreaterThan(
    (retryBox?.y ?? 0) + (retryBox?.height ?? 0) - 1,
  );
  expect(
    await page.evaluate(() => {
      const retry = document.querySelector('[data-testid="contact-retry"]');
      const call = document.querySelector('[data-testid="call-shop-link"]');
      if (retry === null || call === null) return false;
      return Boolean(
        retry.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
    "the call link follows the retry in the document",
  ).toBe(true);
}

async function openAndFill(
  page: Page,
  path: string,
): Promise<{ readonly typedPhone: string }> {
  await page.goto(path);
  await expectFormDrawn(page);
  const phone = `06${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
  await fillTheWholeForm(page, {
    name: `Nm${newToken()}`,
    phone,
    locality: "Chisinau",
  });
  return { typedPhone: phone };
}

/** The revision the server holds for the design, asked as the page asks and by the same browser. */
async function storedRevisionOf(page: Page, designId: string): Promise<string> {
  const answer = await page.request.get(`/api/designs/${designId}`);
  expect(answer.status()).toBe(200);
  const body = (await answer.json()) as { revision?: unknown };
  expect(typeof body.revision).toBe("string");
  return String(body.revision);
}

/** The ids of the elements the page's focus has been on, in order, by test id. */
async function recordFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    Reflect.set(window, "__focused", seen);
    document.addEventListener("focusin", (event) => {
      const target = event.target as HTMLElement;
      seen.push(target.dataset.testid ?? target.tagName);
    });
  });
}

async function focusedSoFar(page: Page): Promise<string[]> {
  return page.evaluate(() => Reflect.get(window, "__focused") as string[]);
}

async function dispatchOnline(page: Page, times: number): Promise<void> {
  await page.evaluate((count) => {
    for (let event = 0; event < count; event += 1) {
      window.dispatchEvent(new Event("online"));
    }
  }, times);
}

const ANSWERED_FAILURES: readonly (readonly [string, RouteAnswer])[] = [
  ["502, a retry may follow", ANSWERS.noticeNotSentRetry],
  ["502, the notice not sent", ANSWERS.noticeNotSent],
  ["503", ANSWERS.unavailable],
  ["400 CONTACT_REJECTED", ANSWERS.rejected],
  ["a 200 that is not a send", ANSWERS.notAnAnswerWeKnow],
  ["a 200 that is not JSON", ANSWERS.unreadable],
];

test.describe("an answered failure is 5B's not-sent, and no return of the connection sends it again", () => {
  for (const [name, answer] of ANSWERED_FAILURES) {
    test(`${name}: 5B says it did not arrive, with no code and no status; offline then online sends nothing; the customer's own press does, under the same id`, async ({
      page,
      context,
      seededDesign,
    }) => {
      const sent = recordContactRequests(page);
      await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
      await page.waitForTimeout(2400);
      await answerContactInOrder(page, [answer, ANSWERS.sent("LMN-5B-0001")]);
      const revisionBefore = await storedRevisionOf(page, seededDesign.id);

      await pressTheCallToAction(page);

      await expect(page.getByTestId(FAILURE)).toHaveAttribute(
        "data-screen",
        "not-sent",
      );
      await expect(page.getByTestId(FAILURE_SENTENCE)).toHaveText(
        ro.submissionResult.failureNotSent,
      );
      // The kept box holds the design's price and sizes, so the words are read where the failure speaks.
      const spoken = [
        await page.getByTestId(FAILURE_HEADING).innerText(),
        await page.getByTestId(FAILURE_SENTENCE).innerText(),
        await page.getByTestId("failure-kept-sentence").innerText(),
      ].join(" ");
      expect(spoken).not.toMatch(/[A-Z]{2,}_[A-Z_]+|\b[1-5]\d\d\b/);
      await expect(page.getByTestId(FAILURE_WAITING)).toHaveCount(0);
      await expect(page.getByTestId("failure-automatic-retry")).toHaveCount(0);
      // Criterion 4: nothing about the design changed by a failed send, and no field is asked for again.
      expect(await storedRevisionOf(page, seededDesign.id)).toBe(
        revisionBefore,
      );
      await expect(page.locator("main input")).toHaveCount(0);
      await expectOneCallLinkUnderTheRetry(page);

      await context.setOffline(true);
      await context.setOffline(false);
      await dispatchOnline(page, 2);
      await page.waitForTimeout(SETTLE_MS);
      expect(sent, "nothing is sent by the connection's return").toHaveLength(
        1,
      );

      await page.getByTestId(RETRY).tap();
      await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
      expect(sent).toHaveLength(2);
      expect(clientRequestIdOf(sentAt(sent, 1))).toBe(
        clientRequestIdOf(sentAt(sent, 0)),
      );
      expect(withoutElapsed(sentAt(sent, 1))).toEqual(
        withoutElapsed(sentAt(sent, 0)),
      );
      await expectDesignLinkShown(page, "ro", seededDesign.id);
      await expectReferenceNotShown(page, "LMN-5B-0001");
    });
  }

  test("429: 8L's sentence stands beside the form, 5B is not drawn, and the connection's return sends nothing, before the wait or after it", async ({
    page,
    context,
    seededDesign,
  }) => {
    const sent = recordContactRequests(page);
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [ANSWERS.limited("6")]);

    await pressTheCallToAction(page);

    await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
      "data-outcome",
      "limited",
    );
    await expect(page.getByTestId(FAILURE)).toHaveCount(0);
    await expect(page.getByTestId("call-shop-link")).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await context.setOffline(true);
    await context.setOffline(false);
    await dispatchOnline(page, 1);
    await page.waitForTimeout(SETTLE_MS);
    expect(sent, "before the wait").toHaveLength(1);
    await page.waitForTimeout(6000);
    await dispatchOnline(page, 1);
    await page.waitForTimeout(SETTLE_MS);
    expect(sent, "after the wait").toHaveLength(1);
    await expect(page.getByTestId(CTA)).toBeVisible();
  });
});

test.describe("a send nothing answered", () => {
  test("5B takes the focus once, keeps it through a retry on 5B, and the retry is the same request in its sending state; two returns of the connection in one task and presses meanwhile send one", async ({
    page,
    seededDesign,
  }) => {
    const sent = recordContactRequests(page);
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await recordFocus(page);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handled = 0;
    await page.route("**/api/contact-submissions", async (route) => {
      handled += 1;
      if (handled === 1) return NETWORK_FAILURE(route);
      if (handled === 2) {
        await held;
        return ANSWERS.unavailable(route);
      }
      return ANSWERS.sent("LMN-5B-0002")(route);
    });

    await pressTheCallToAction(page);

    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expect(page.getByTestId(FAILURE_HEADING)).toBeFocused();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByTestId(FAILURE_SENTENCE)).toHaveAttribute(
      "role",
      "status",
    );
    await expect(page.getByTestId(FAILURE_WAITING)).toHaveCount(0);
    await expect(page.getByTestId("failure-automatic-retry")).toHaveText(
      ro.submissionResult.retryAutomatically,
    );
    await page.getByTestId(FAILURE_HEADING).evaluate((heading) => {
      heading.setAttribute("data-marker", "the-first-h1");
    });

    // The connection's return, twice in one task, is one request; presses while it is out make none.
    await dispatchOnline(page, 2);
    const retry = page.getByTestId(RETRY);
    await expect(retry).toHaveAttribute("aria-disabled", "true");
    await expect(retry).toHaveText(ro.contact.sending);
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    await touchTheMiddleOfRetry(page);
    await touchTheMiddleOfRetry(page);
    await dispatchOnline(page, 1);
    await page.waitForTimeout(SETTLE_MS);
    expect(sent, "the first, and one retry").toHaveLength(2);
    expect(clientRequestIdOf(sentAt(sent, 1))).toBe(
      clientRequestIdOf(sentAt(sent, 0)),
    );

    // The answer on 5B: the same h1 element, the sentence changed in its polite region, and focus where the touch left it.
    release();
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "not-sent",
    );
    await expect(page.getByTestId(FAILURE_SENTENCE)).toHaveText(
      ro.submissionResult.failureNotSent,
    );
    await expect(page.getByTestId(FAILURE_HEADING)).toHaveAttribute(
      "data-marker",
      "the-first-h1",
    );
    await expect(retry).not.toHaveAttribute("aria-disabled", "true");
    await expect(retry).toHaveText(ro.contact.retry);
    expect(
      (await focusedSoFar(page)).filter((id) => id === FAILURE_HEADING),
      "the h1 took the focus once",
    ).toHaveLength(1);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "BODY",
    );

    await page.getByTestId(RETRY).tap();
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    expect(sent).toHaveLength(3);
    for (const request of sent) {
      expect(clientRequestIdOf(request)).toBe(
        clientRequestIdOf(sentAt(sent, 0)),
      );
      expect(withoutElapsed(request)).toEqual(withoutElapsed(sentAt(sent, 0)));
    }
  });

  test("a press on 5B while offline is still 5B, with its retry where it was and the offline line drawn; the return sends, once", async ({
    page,
    context,
    seededDesign,
  }) => {
    const sent = recordContactRequests(page);
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [
      NETWORK_FAILURE,
      NETWORK_FAILURE,
      ANSWERS.sent("LMN-5B-0003"),
    ]);
    await pressTheCallToAction(page);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await context.setOffline(true);
    await expect(page.getByTestId(FAILURE_WAITING)).toBeVisible();

    await page.getByTestId(RETRY).tap();

    await expect.poll(() => sent.length).toBe(2);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expect(page.getByTestId(FAILURE_WAITING)).toBeVisible();
    await expect(page.getByTestId(RETRY)).toBeFocused();
    await expect(page.locator("h1")).toHaveCount(1);

    await context.setOffline(false);
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
    expect(sent).toHaveLength(3);
    await expectDesignLinkShown(page, "ro", seededDesign.id);
    await expectReferenceNotShown(page, "LMN-5B-0003");
  });

  test("the callback form: no design card on 5B, the no-design kept sentence, no way to a design; the return of the connection ends in the sent view in place, and a reload shows the empty form", async ({
    page,
    context,
  }) => {
    const sent = recordContactRequests(page);
    await openAndFill(page, callbackPath("ro"));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [
      NETWORK_FAILURE,
      ANSWERS.sent("LMN-CB-0001"),
    ]);
    const historyBefore = await historyLength(page);
    await pressTheCallToAction(page);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expect(page.getByTestId("contact-design-card")).toHaveCount(0);
    await expect(page.getByTestId("failure-kept-sentence")).toHaveText(
      ro.submissionResult.failureKeptNoDesign,
    );
    await expectOneCallLinkUnderTheRetry(page);

    await context.setOffline(true);
    await expect(page.getByTestId(FAILURE_WAITING)).toBeVisible();
    await context.setOffline(false);

    await expect(page.getByTestId("contact-sent")).toBeVisible();
    expect(sent).toHaveLength(2);
    await expect(page).toHaveURL(new RegExp(`${callbackPath("ro")}$`));
    expect(await historyLength(page)).toBe(historyBefore);
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    await expect(page.getByTestId(DONE_REFERENCE)).toHaveText("LMN-CB-0001");
    for (const absent of [
      "done-steps",
      "done-picture",
      "done-whatsapp",
      "done-back-to-design",
      "done-bottom",
    ]) {
      await expect(page.getByTestId(absent), absent).toHaveCount(0);
    }
    await expect(page.locator('main a[href*="/d/"]')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.getByTestId("call-shop-link")).toHaveCount(0);

    await page.reload();
    await expectFormDrawn(page);
    await expect(page.getByTestId("contact-sent")).toHaveCount(0);
    expect(await page.locator('input[name="name"]').inputValue()).toBe("");
  });
});

test("the connection returns while a retry made offline is still out: the event is spent on that request (P6), and when it too gets no answer 5B stands online with the customer's own retry as the way on", async ({
  page,
  context,
  seededDesign,
}) => {
  // Not a defect against the plan, which sends nothing while a request is out; it is what that rule leaves: 5B still
  // says the page will try again by itself, and nothing will until the connection goes and returns once more.
  const sent = recordContactRequests(page);
  await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
  await page.waitForTimeout(2400);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let handled = 0;
  await page.route("**/api/contact-submissions", async (route) => {
    handled += 1;
    if (handled === 1) return NETWORK_FAILURE(route);
    if (handled === 2) {
      await held;
      return NETWORK_FAILURE(route);
    }
    return ANSWERS.sent("LMN-5B-0004")(route);
  });
  await pressTheCallToAction(page);
  await expect(page.getByTestId(FAILURE)).toHaveAttribute(
    "data-screen",
    "lost-connection",
  );
  await context.setOffline(true);
  await page.getByTestId(RETRY).tap();
  await expect.poll(() => sent.length).toBe(2);

  await context.setOffline(false);
  await page.waitForTimeout(SETTLE_MS);
  expect(sent, "the return is spent on the request already out").toHaveLength(
    2,
  );
  release();

  await expect(page.getByTestId(RETRY)).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.waitForTimeout(SETTLE_MS * 2);
  expect(sent, "nothing more is sent by itself").toHaveLength(2);
  await expect(page.getByTestId(FAILURE)).toHaveAttribute(
    "data-screen",
    "lost-connection",
  );
  await expect(page.getByTestId(FAILURE_WAITING)).toHaveCount(0);
  await expect(page.getByTestId("failure-automatic-retry")).toBeVisible();

  await page.getByTestId(RETRY).tap();
  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
  expect(sent).toHaveLength(3);
});

test.describe("a reference that is not a reference", () => {
  const MARKUP = "<img src=x onerror=alert(1)>";

  function recordDialogs(page: Page): string[] {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    return dialogs;
  }

  test("5A: markup in the answer's reference is not drawn at all, nothing runs, and no element is made of it", async ({
    page,
    seededDesign,
  }) => {
    const dialogs = recordDialogs(page);
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [ANSWERS.sent(MARKUP)]);

    await pressTheCallToAction(page);
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);

    await expectDesignLinkShown(page, "ro", seededDesign.id);
    await expectReferenceNotShown(page, MARKUP);
    await expect(page.locator("main img")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
  });

  test("the callback form's sent view, which still draws the reference: markup is text, drawn as those characters, nothing runs, and no element is made of it", async ({
    page,
  }) => {
    const dialogs = recordDialogs(page);
    await openAndFill(page, callbackPath("ro"));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [ANSWERS.sent(MARKUP)]);

    await pressTheCallToAction(page);
    await expect(page.getByTestId("contact-sent")).toBeVisible();

    await expect(page.getByTestId(DONE_REFERENCE)).toHaveText(MARKUP);
    await expect(page.locator("main img")).toHaveCount(0);
    expect(await page.getByTestId(DONE_REFERENCE).innerHTML()).not.toContain(
      "<img",
    );
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
  });
});

/** The confirmation's own timer is about two seconds; a runner whose page stalls for seconds at a time runs it late. */
const CONFIRMATION_CLEARS_WITHIN_MS = 20_000;

test.describe("what the design-link card and the picture do on the page", () => {
  test("ro: the copy control writes exactly the design's address to the clipboard and its confirmation stands for about two seconds; the picture is the room's canvas with no camera control and no way to orbit it", async ({
    page,
    context,
    seededDesign,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [ANSWERS.sent("LMN-CP-0001")]);
    await pressTheCallToAction(page);
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
    await expectDesignLinkShown(page, "ro", seededDesign.id);

    await page.getByTestId("done-copy").tap();

    await expect(page.getByTestId("done-copied")).toHaveText(
      ro.submissionResult.copied,
    );
    await expect(page.getByTestId("done-copied")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      await page.evaluate(() => navigator.clipboard.readText()),
      "the clipboard holds the design's address and nothing else",
    ).toBe(designAddressOf(page, "ro", seededDesign.id));
    await expect(page.getByTestId("done-copied")).toHaveText("", {
      timeout: CONFIRMATION_CLEARS_WITHIN_MS,
    });

    const picture = page.getByTestId("done-picture");
    await expect(picture.locator("canvas")).toHaveCount(1);
    await expect(picture.locator("button, a, [role='button']")).toHaveCount(0);
    await expect(picture).toHaveAttribute("aria-hidden", "true");
  });

  test("ro: a clipboard that refuses the write shows no confirmation and leaves the design's address selected, ready to be copied by hand", async ({
    page,
    seededDesign,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new Error("refused")),
        },
      });
    });
    await openAndFill(page, contactDocumentPath("ro", seededDesign.id));
    await page.waitForTimeout(2400);
    await answerContactInOrder(page, [ANSWERS.sent("LMN-CP-0002")]);
    await pressTheCallToAction(page);
    await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
    await expectDesignLinkShown(page, "ro", seededDesign.id);

    await page.getByTestId("done-copy").tap();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("done-copied")).toHaveText("");
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      designAddressOf(page, "ro", seededDesign.id),
    );
  });
});
