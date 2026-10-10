// `POST /api/contact-submissions` on the suite's built server, with the real store and the fake sender: what two calls
// at once with one id leave in the database, what a changed field under a stored id does to its row, what another
// method is answered, and what a body of exactly the bound becomes. All but the design's request are made with no
// browser and no cookie, as a caller that is no browser makes them, so the browser's own bucket is asked once.
//
// Rows are counted in the database by the ids this file wrote, each made from a random value and remembered before it
// is sent; names and phones are synthetic. The file removes its rows by those ids and its tries' counters by their
// keys; the network's buckets are the teardown's. Nothing leaves the machine: the server is given the fake sender.
import {
  countContactSubmissionsForTests,
  isSubmissionReference,
} from "@lemnaria/persistence";
import { expect, type APIResponse } from "@playwright/test";

import {
  expectStoredOnce,
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

const CONTACT_ROUTE = "/api/contact-submissions";
const FORM_OPEN_FOR_MS = 12_000;
const BOUND_BYTES = 8 * 1024;
const OTHER_METHODS = ["GET", "PUT", "PATCH", "DELETE", "HEAD"] as const;
const METHOD_NOT_ALLOWED = 405;

const run: ContactRun = startContactRun();

test.afterAll(async () => {
  const removal = await removeContactRun(run);

  expect(removal.requestRows, "requests removed by their ids").toBe(
    run.storedIds.length,
  );
  expect(removal.requestRowsLeft, "requests left by those ids").toBe(0);
  expect(removal.triesRows, "tries' counter rows").toBeGreaterThan(0);
  expect(removal.visitorRows, "browser counter rows").toBeGreaterThan(0);
});

function callback(
  clientRequestId: string,
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
    intent: "callback",
    clientRequestId,
    locale: "ro",
    honeypot: "",
    elapsedMs: FORM_OPEN_FOR_MS,
    ...overrides,
  };
}

async function referenceOf(answer: APIResponse): Promise<string> {
  const body = (await answer.json()) as { reference?: unknown };
  return String(body.reference);
}

function expectNothingKeptByTheCaller(answer: APIResponse): void {
  const headers = answer.headers();
  expect(headers["set-cookie"]).toBeUndefined();
  expect(headers["cache-control"]).toBe("no-store");
}

test("two calls at once with one id are answered one reference and are one row", async ({
  request,
}) => {
  const id = newRequestId(run);
  const body = callback(id);
  // Whichever call lands second may find the first's row, which counts a try under the id.
  noteReplayOf(run, id);

  const answers = await Promise.all([
    request.post(CONTACT_ROUTE, { data: body }),
    request.post(CONTACT_ROUTE, { data: body }),
  ]);

  const references = await Promise.all(answers.map(referenceOf));
  expect(answers.map((answer) => answer.status())).toEqual([200, 200]);
  expect(isSubmissionReference(references[0])).toBe(true);
  expect(references[1]).toBe(references[0]);
  expect(await expectStoredOnce(run, id)).toBe(1);
  answers.forEach(expectNothingKeptByTheCaller);
});

test("a design's request sent twice at once from its own browser is one row and one reference", async ({
  page,
  context,
  seededDesign,
}) => {
  await noteVisitorOf(run, context);
  const id = newRequestId(run);
  noteReplayOf(run, id);
  // A key that is `undefined` is not written, so the callback's intent gives way to the design.
  const body = JSON.stringify({
    ...callback(id),
    intent: undefined,
    design: { id: seededDesign.id, revision: seededDesign.revision },
  });

  const answers = await page.evaluate(
    async ({ route, text }) => {
      const sendOnce = async () => {
        const response = await fetch(route, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: text,
        });
        const payload = (await response.json()) as { reference?: string };
        return { status: response.status, reference: payload.reference };
      };
      return Promise.all([sendOnce(), sendOnce()]);
    },
    { route: CONTACT_ROUTE, text: body },
  );

  expect(answers.map(({ status }) => status)).toEqual([200, 200]);
  const [first, second] = answers;
  expect(second.reference).toBe(first.reference);
  expect(await expectStoredOnce(run, id)).toBe(1);
});

test("a stored id sent again with one field changed is the conflict, and its row and reference stay", async ({
  request,
}) => {
  const id = newRequestId(run);
  const body = callback(id);
  const first = await request.post(CONTACT_ROUTE, { data: body });
  noteReplayOf(run, id);

  const changed = await request.post(CONTACT_ROUTE, {
    data: { ...body, locale: "ru" },
  });
  const again = await request.post(CONTACT_ROUTE, { data: body });

  expect(first.status()).toBe(200);
  expect(changed.status()).toBe(409);
  const conflict = (await changed.json()) as Record<string, unknown>;
  expect(conflict.code).toBe("CONTACT_REQUEST_CONFLICT");
  expect(Object.keys(conflict).sort()).toEqual(["code", "error"]);
  expect(again.status()).toBe(200);
  expect(await referenceOf(again)).toBe(await referenceOf(first));
  expect(await expectStoredOnce(run, id)).toBe(1);
  expectNothingKeptByTheCaller(changed);
});

test("a method that is not POST has no answer of the route's and stores nothing", async ({
  request,
}) => {
  const id = newRequestId(run);
  const body = callback(id);

  const statuses: number[] = [];
  for (const method of OTHER_METHODS) {
    const answer = await request.fetch(CONTACT_ROUTE, { method, data: body });
    statuses.push(answer.status());
  }

  expect(statuses).toEqual(OTHER_METHODS.map(() => METHOD_NOT_ALLOWED));
  expect(await countContactSubmissionsForTests([id])).toBe(0);
});

test("a body of exactly the bound is read and judged by the schema, and one byte more is refused unread", async ({
  request,
}) => {
  const id = newRequestId(run);
  const empty = JSON.stringify(callback(id, { junk: "" }));
  const exactly = JSON.stringify(
    callback(id, { junk: "j".repeat(BOUND_BYTES - Buffer.byteLength(empty)) }),
  );
  const headers = { "content-type": "application/json" };

  const atTheBound = await request.post(CONTACT_ROUTE, {
    headers,
    data: exactly.padEnd(BOUND_BYTES, " "),
  });
  const pastIt = await request.post(CONTACT_ROUTE, {
    headers,
    data: exactly.padEnd(BOUND_BYTES + 1, " "),
  });

  expect(atTheBound.status()).toBe(400);
  expect(await atTheBound.json()).toMatchObject({
    code: "CONTACT_INVALID",
    issues: [{ field: "request", code: "UNKNOWN_FIELD" }],
  });
  expect(pastIt.status()).toBe(413);
  expect(await countContactSubmissionsForTests([id])).toBe(0);
  expectNothingKeptByTheCaller(atTheBound);
  expectNothingKeptByTheCaller(pastIt);
});
