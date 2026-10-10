import {
  countContactSubmissionsForTests,
  isSubmissionReference,
} from "@lemnaria/persistence";
import { expect, type Browser, type Page } from "@playwright/test";

import {
  expectStoredOnce,
  newAddress,
  newName,
  newPhone,
  newRequestId,
  noteReplayOf,
  noteVisitorOf,
  removeContactRun,
  startContactRun,
  type ContactRun,
} from "./support/contact-run";
import { test } from "./support/seeded-design";

/**
 * `POST /api/contact-submissions` through the real route, the real store and the fake sender, in a real browser
 * (M8 wave 8K, S5). The server behind this suite is given the fake mail sender and no mail variable
 * (`playwright.config.ts`), so a request that is stored is also passed on, and nothing leaves the machine.
 *
 * Rows are counted in the database by the ids this run wrote, which every test makes from a random value and
 * remembers before it sends, so that a failing test still removes what it stored. Names, phones and addresses are
 * synthetic and unique to the run. The counter rows of a request's tries, a browser and an address are removed by the
 * keys computed from the run's secret; the network's three buckets are the teardown's.
 */
const CONTACT_ROUTE = "/api/contact-submissions";
const FORM_OPEN_FOR_MS = 12_000;
const OVERSIZE_BODY_BYTES = 9 * 1024;

const run: ContactRun = startContactRun();

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

test.afterAll(async () => {
  const removal = await removeContactRun(run);

  // A key computed here that is not the server's removes nothing and reports nothing: each of the three the run
  // used must have found its rows, or the rows of every run would stay behind.
  expect(removal.requestRows, "requests removed by their ids").toBe(
    run.storedIds.length,
  );
  expect(removal.requestRowsLeft, "requests left by those ids").toBe(0);
  expectRowsFoundFor(run.replayedIds, removal.triesRows, "tries' counter rows");
  expectRowsFoundFor(
    run.visitorHashes,
    removal.visitorRows,
    "browser counter rows",
  );
  expectRowsFoundFor(
    run.addresses,
    removal.addressRows,
    "address counter rows",
  );
});

/** What the run counted under a key it computed was counted under the server's, or the rows would stay: none found
 *  for a key the run used is a failure, and a key the run never used asks for nothing. */
function expectRowsFoundFor(
  used: readonly string[],
  rowsRemoved: number,
  what: string,
): void {
  if (used.length > 0) expect(rowsRemoved, what).toBeGreaterThan(0);
}

/** The contact form's body for a callback, or for the design when one is handed over. */
function requestBody(
  clientRequestId: string,
  target:
    | { readonly design: { readonly id: string; readonly revision: string } }
    | { readonly intent: "callback" },
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    contact: {
      name: newName(),
      phone: newPhone(),
      locality: "Chisinau",
      channel: "phone",
      consent: true,
      consentTextVersion: "placeholder",
    },
    ...target,
    clientRequestId,
    locale: "ro",
    honeypot: "",
    elapsedMs: FORM_OPEN_FOR_MS,
    ...overrides,
  };
}

/** Sent from inside the page, as the form sends it, so the browser's own cookies and fetch metadata go with it. */
async function sendFromPage(
  page: Page,
  body: unknown,
  contentType = "application/json",
): Promise<Answer> {
  return page.evaluate(
    async ({ route, text, type }) => {
      const response = await fetch(route, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": type },
        body: text,
      });
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return { status: response.status, body: payload };
    },
    {
      route: CONTACT_ROUTE,
      text: typeof body === "string" ? body : JSON.stringify(body),
      type: contentType,
    },
  );
}

async function openAppOrigin(page: Page): Promise<void> {
  await page.goto("/ro/configurator/room");
}

test.describe("a request that is taken", () => {
  test("a callback answers a reference and is one row, its notice passed on", async ({
    page,
  }) => {
    await openAppOrigin(page);
    const id = newRequestId(run);

    const answer = await sendFromPage(
      page,
      requestBody(id, { intent: "callback" }),
    );

    expect(answer.status).toBe(200);
    expect(answer.body.status).toBe("sent");
    expect(isSubmissionReference(String(answer.body.reference))).toBe(true);
    expect(await expectStoredOnce(run, id)).toBe(1);
  });

  test("a design's request answers a reference and is one row", async ({
    page,
    context,
    seededDesign,
  }) => {
    await noteVisitorOf(run, context);
    const id = newRequestId(run);
    const body = requestBody(
      id,
      { design: { id: seededDesign.id, revision: seededDesign.revision } },
      {
        contact: {
          name: newName(),
          phone: newPhone(),
          locality: "Balti",
          channel: "email",
          email: newAddress(run),
          consent: true,
          consentTextVersion: "placeholder",
        },
      },
    );

    const answer = await sendFromPage(page, body);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ status: "sent" });
    expect(await expectStoredOnce(run, id)).toBe(1);
  });

  test("the same id again is the same reference and still one row", async ({
    page,
  }) => {
    await openAppOrigin(page);
    const id = newRequestId(run);
    const body = requestBody(id, { intent: "callback" });

    const first = await sendFromPage(page, body);
    noteReplayOf(run, id);
    const again = await sendFromPage(page, body);

    expect(first.status).toBe(200);
    expect(again).toEqual(first);
    expect(await expectStoredOnce(run, id)).toBe(1);
  });
});

test.describe("a request that is refused is no row", () => {
  test("the honeypot, a form sent too fast and a request the schema refuses", async ({
    page,
  }) => {
    await openAppOrigin(page);
    const ids = [newRequestId(run), newRequestId(run), newRequestId(run)];
    const callback = { intent: "callback" } as const;
    const withoutConsent = requestBody(ids[2] ?? "", callback, {
      contact: { ...requestContact(), consent: false },
    });

    const answers = [
      await sendFromPage(
        page,
        requestBody(ids[0] ?? "", callback, { honeypot: "http://spam.test" }),
      ),
      await sendFromPage(
        page,
        requestBody(ids[1] ?? "", callback, { elapsedMs: 100 }),
      ),
      await sendFromPage(page, withoutConsent),
    ];

    expect(answers.map(({ status }) => status)).toEqual([400, 400, 400]);
    expect(answers.map(({ body }) => body.code)).toEqual([
      "CONTACT_REJECTED",
      "CONTACT_REJECTED",
      "CONTACT_INVALID",
    ]);
    expect(await expectStoredCount(ids)).toBe(0);
  });

  test("a body that is not JSON, one that is too large, and a text that is not a request", async ({
    page,
  }) => {
    await openAppOrigin(page);
    const id = newRequestId(run);
    const valid = requestBody(id, { intent: "callback" });

    const notJson = await sendFromPage(page, valid, "text/plain");
    const tooLarge = await sendFromPage(page, "a".repeat(OVERSIZE_BODY_BYTES));
    const notARequest = await sendFromPage(page, "{{{ not json");

    expect(notJson).toMatchObject({
      status: 415,
      body: { code: "CONTACT_NOT_JSON" },
    });
    expect(tooLarge).toMatchObject({
      status: 413,
      body: { code: "CONTACT_BODY_TOO_LARGE" },
    });
    expect(notARequest).toMatchObject({
      status: 400,
      body: { code: "CONTACT_INVALID" },
    });
    expect(await expectStoredCount([id])).toBe(0);
  });

  test("a request that says it came from another site", async ({
    page,
    request,
  }) => {
    await openAppOrigin(page);
    const id = newRequestId(run);

    const answer = await request.post(CONTACT_ROUTE, {
      headers: { "sec-fetch-site": "cross-site" },
      data: requestBody(id, { intent: "callback" }),
    });

    expect(answer.status()).toBe(403);
    expect(await answer.json()).toMatchObject({ code: "CONTACT_CROSS_SITE" });
    expect(await expectStoredCount([id])).toBe(0);
  });

  test("a design at a stale revision, and a design from a browser that does not own it", async ({
    page,
    browser,
    seededDesign,
  }) => {
    const staleId = newRequestId(run);
    const foreignId = newRequestId(run);
    const staleRevision = String(Number(seededDesign.revision) + 1);

    const stale = await sendFromPage(
      page,
      requestBody(staleId, {
        design: { id: seededDesign.id, revision: staleRevision },
      }),
    );
    const foreign = await sendFromAnotherBrowser(
      browser,
      requestBody(foreignId, {
        design: { id: seededDesign.id, revision: seededDesign.revision },
      }),
    );

    expect(stale).toMatchObject({
      status: 409,
      body: { code: "CONTACT_DESIGN_NOT_CURRENT" },
    });
    expect(foreign).toEqual(stale);
    expect(await expectStoredCount([staleId, foreignId])).toBe(0);
  });
});

function requestContact(): Record<string, unknown> {
  return {
    name: newName(),
    phone: newPhone(),
    locality: "Chisinau",
    channel: "phone",
    consentTextVersion: "placeholder",
  };
}

async function sendFromAnotherBrowser(
  browser: Browser,
  body: unknown,
): Promise<Answer> {
  const other = await browser.newContext();
  try {
    const page = await other.newPage();
    await openAppOrigin(page);
    return await sendFromPage(page, body);
  } finally {
    await other.close();
  }
}

/** The rows these ids hold, none of which is remembered as stored: a refusal is asserted to have left no row. */
function expectStoredCount(ids: readonly string[]): Promise<number> {
  return countContactSubmissionsForTests([...ids]);
}
