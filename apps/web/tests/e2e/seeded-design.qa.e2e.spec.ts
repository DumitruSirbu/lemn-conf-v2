import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { expect } from "@playwright/test";

import { openSeededDesign, test } from "./support/seeded-design";

/**
 * Adversarial QA for wave 7E4 S1's fixture (M7 plan §4 criterion 4). Serial on purpose: the
 * teardown invariant — "a failing test still leaves its row deleted" — is only observable from a
 * later test, after the fixture's teardown has run. A skipped predecessor therefore fails the
 * observer loudly rather than passing vacuously.
 */
test.describe.configure({ mode: "serial" });

const WRITE_TOKEN_COOKIE_PREFIX = "lemnaria_write_token_";
const PAGE_SIDE_PROBE_HOLD_MS = 2_000;

const idsSeenByEarlierTests: string[] = [];
let idOfDeliberatelyFailedTest = "";

test("the first test receives a seeded row", ({ seededDesign }) => {
  expect(seededDesign.id).not.toBe("");
  expect(seededDesign.revision).not.toBe("");
  idsSeenByEarlierTests.push(seededDesign.id);
});

test("a second test in the same file receives a different row", ({
  seededDesign,
}) => {
  expect(idsSeenByEarlierTests).toHaveLength(1);
  expect(seededDesign.id).not.toBe(idsSeenByEarlierTests[0]);
  idsSeenByEarlierTests.push(seededDesign.id);
});

test("a deliberately failing test still hands its row to teardown", ({
  seededDesign,
}) => {
  test.fail(true, "the failure is the scenario; teardown must still delete");
  idOfDeliberatelyFailedTest = seededDesign.id;
  expect(seededDesign.id, "deliberate failure").toBe("never-this");
});

test("the rows of every earlier test, including the failed one, are gone", async ({
  request,
}) => {
  const earlierIds = [...idsSeenByEarlierTests, idOfDeliberatelyFailedTest];
  expect(earlierIds).toHaveLength(3);
  expect(earlierIds).not.toContain("");

  const statuses = await Promise.all(
    earlierIds.map(async (id) =>
      (await request.get(`/api/designs/${id}`)).status(),
    ),
  );
  expect(statuses).toEqual([404, 404, 404]);
});

test("the opened document deep-equals KITCHEN_L_DESIGN", async ({
  page,
  seededDesign,
}) => {
  const probe = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  await openSeededDesign(page, seededDesign);

  const loaded = (await (await probe).json()) as { design: unknown };
  expect(loaded.design).toEqual(KITCHEN_L_DESIGN);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-updated-at",
    KITCHEN_L_DESIGN.updatedAt,
  );
});

test("the write-token cookie sits in the browser's jar, scoped to the design's API path", async ({
  context,
  seededDesign,
}) => {
  const cookies = await context.cookies();
  const writeCookies = cookies.filter((cookie) =>
    cookie.name.startsWith(WRITE_TOKEN_COOKIE_PREFIX),
  );
  expect(writeCookies).toHaveLength(1);
  expect(writeCookies[0]).toMatchObject({
    name: `${WRITE_TOKEN_COOKIE_PREFIX}${seededDesign.id}`,
    path: `/api/designs/${seededDesign.id}`,
    httpOnly: true,
  });
});

test("openSeededDesign returns only after the store applied canWrite, even when the page is slow to apply it", async ({
  page,
  seededDesign,
}) => {
  // The page's own hand-over of the probe's body to the store is held back *after* the body was
  // read, so the runner sees the probe response well before the store can apply it — the gap a busy
  // main thread opens on a slow runner. A helper that returned on the network answer alone would
  // return mid-"checking".
  await page.addInitScript(
    ({ probePath, holdMs }) => {
      const networkFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await networkFetch(input, init);
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.href,
        );
        const isProbe =
          url.pathname === probePath &&
          (init?.method ?? "GET").toUpperCase() === "GET";
        if (!isProbe) return response;
        // The body is read at once — Chromium only reports the response finished to the runner once
        // the page consumed it — and only the hand-over to the store is held.
        const readBody = response.json.bind(response);
        const body: unknown = await readBody();
        response.json = async () => {
          await new Promise((resolve) => setTimeout(resolve, holdMs));
          return body;
        };
        return response;
      };
    },
    {
      probePath: `/api/designs/${seededDesign.id}`,
      holdMs: PAGE_SIDE_PROBE_HOLD_MS,
    },
  );

  await openSeededDesign(page, seededDesign);

  // `isEnabled()` does not retry: this is the state at the instant the helper returned.
  expect(await page.getByTestId("global-settings-trigger").isEnabled()).toBe(
    true,
  );
});

test("openSeededDesign throws by name on a design this browser holds no token for", async ({
  page,
  context,
  seededDesign,
}) => {
  await context.clearCookies();

  await expect(openSeededDesign(page, seededDesign)).rejects.toThrow(
    `openSeededDesign: the write-access probe for ${seededDesign.id} answered canWrite: false, wanted true`,
  );
});
