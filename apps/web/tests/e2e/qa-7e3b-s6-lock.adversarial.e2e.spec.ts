import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
} from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign } from "./support/seeded-design";

/**
 * M7 wave 7E3b S6 adversarial QA (ADR 0114 Amendment H6) — the create-design Web Lock in a real
 * Chromium: the second tab's `POST` carries the first tab's freshly set cookie (the lock is released
 * only after `Set-Cookie` is stored), the 10 s acquisition timeout falls back to an unlocked mint, a
 * failed or abandoned mint does not keep the lock, and a browser without `navigator.locks` still
 * creates a design.
 *
 * Every design minted here is deleted afterwards (ADR 0006).
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const LOCK_NAME = "lemnaria:create-design";
const TYPED_ROOM_QUERY =
  "shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";
const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
/** Well under the acquire timeout: a lock that was released lets the next mint start at once. */
const PROMPT_MINT_BOUND_MS = 6_000;
const RELEASE_TIMING_ROUNDS = 6;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

interface ObservedMint {
  readonly sentCookie: string | undefined;
  readonly setValue: string | undefined;
}

function visitorValueIn(cookieHeader: string | undefined): string | undefined {
  return cookieHeader
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(`${VISITOR_COOKIE_NAME}=`))
    ?.slice(VISITOR_COOKIE_NAME.length + 1);
}

function isMintRequest(request: PlaywrightRequest): boolean {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/designs"
  );
}

/** Records every `POST /api/designs` in the context, in the order the requests were sent: the
 *  visitor value each carried, and the one its response set. */
function recordMints(context: BrowserContext): Promise<ObservedMint>[] {
  const observed: Promise<ObservedMint>[] = [];
  context.on("request", (request) => {
    if (!isMintRequest(request)) return;
    observed.push(
      (async () => {
        const sentCookie = visitorValueIn((await request.allHeaders()).cookie);
        const response = await request.response();
        const setLine = (await response?.headersArray())?.find(
          ({ name, value }) =>
            name.toLowerCase() === "set-cookie" &&
            value.startsWith(`${VISITOR_COOKIE_NAME}=`),
        )?.value;
        return {
          sentCookie,
          setValue: setLine
            ?.slice(VISITOR_COOKIE_NAME.length + 1)
            .split(";")[0],
        };
      })(),
    );
  });
  return observed;
}

async function readyToContinue(page: Page): Promise<void> {
  await page.goto(`/ro/configurator/room?${TYPED_ROOM_QUERY}`);
  await page.getByTestId("room-continue").waitFor({ state: "visible" });
}

async function continueToDesign(page: Page): Promise<string> {
  await page.getByTestId("room-continue").click();
  return awaitDesign(page);
}

/** Waits for the hand-off's own navigation to `/ro/d/{id}` after a tap already made. */
async function awaitDesign(page: Page): Promise<string> {
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const id = decodeURIComponent(
    new URL(page.url()).pathname.split("/").pop() ?? "",
  );
  mintedDesignIds.push(id);
  return id;
}

async function canWrite(page: Page, id: string): Promise<boolean> {
  return page.evaluate(async (designId) => {
    const response = await fetch(`/api/designs/${designId}`);
    if (response.status !== 200) return false;
    return ((await response.json()) as { canWrite: boolean }).canWrite;
  }, id);
}

for (let round = 0; round < RELEASE_TIMING_ROUNDS; round++) {
  test(`release timing, round ${String(round + 1)}: the second tab's POST carries the value the first tab's response set`, async ({
    context,
  }) => {
    const prior = await mintSeededDesign(await context.newPage());
    mintedDesignIds.push(prior.id);
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await readyToContinue(pageA);
    await readyToContinue(pageB);
    const observed = recordMints(context);

    const [idA, idB] = await Promise.all([
      continueToDesign(pageA),
      continueToDesign(pageB),
    ]);

    const mints = await Promise.all(observed);
    expect(mints).toHaveLength(2);
    const [first, second] = mints;
    expect(first?.setValue).toBeDefined();
    expect(second?.sentCookie).toBe(first?.setValue);
    for (const id of [prior.id, idA, idB])
      expect(await canWrite(pageA, id), id).toBe(true);
  });
}

test("a lock another tab holds past 10 s is waited out, and the mint then proceeds unlocked", async ({
  context,
}) => {
  const holder = await context.newPage();
  const page = await context.newPage();
  await holder.goto("/ro/configurator/room");
  await readyToContinue(page);
  await holder.evaluate(
    ([name, holdMs]) => {
      void navigator.locks.request(
        name,
        () => new Promise((resolve) => setTimeout(resolve, holdMs)),
      );
    },
    [LOCK_NAME, LOCK_ACQUIRE_TIMEOUT_MS + 8_000] as const,
  );
  const mintSent = page.waitForRequest(isMintRequest, { timeout: 20_000 });

  const clickedAt = Date.now();
  await page.getByTestId("room-continue").click();
  await mintSent;
  const waitedMs = Date.now() - clickedAt;

  expect(waitedMs).toBeGreaterThanOrEqual(LOCK_ACQUIRE_TIMEOUT_MS - 500);
  expect(waitedMs).toBeLessThan(LOCK_ACQUIRE_TIMEOUT_MS + 4_000);
  expect(await canWrite(page, await awaitDesign(page))).toBe(true);
});

test("a mint whose request fails releases the lock: the next tab's mint starts at once", async ({
  context,
}) => {
  const failing = await context.newPage();
  const page = await context.newPage();
  await readyToContinue(failing);
  await readyToContinue(page);
  await failing.route("**/api/designs", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  const failedMint = failing.waitForEvent("requestfailed", isMintRequest);
  await failing.getByTestId("room-continue").click();
  await failedMint;

  const mintSent = page.waitForRequest(isMintRequest);
  const clickedAt = Date.now();
  await page.getByTestId("room-continue").click();
  await mintSent;

  expect(Date.now() - clickedAt).toBeLessThan(PROMPT_MINT_BOUND_MS);
  await awaitDesign(page);
});

test("a tab closed while its mint is in flight releases the lock: the next tab's mint starts at once", async ({
  context,
}) => {
  const closing = await context.newPage();
  const page = await context.newPage();
  await readyToContinue(closing);
  await readyToContinue(page);
  await closing.route("**/api/designs", () => {
    // Never answered: the mint stays in flight, holding the lock, until the tab goes away.
  });
  const heldMint = closing.waitForRequest(isMintRequest);
  await closing.getByTestId("room-continue").click();
  await heldMint;
  await closing.close();

  const mintSent = page.waitForRequest(isMintRequest);
  const clickedAt = Date.now();
  await page.getByTestId("room-continue").click();
  await mintSent;

  expect(Date.now() - clickedAt).toBeLessThan(PROMPT_MINT_BOUND_MS);
  await awaitDesign(page);
});

test("a browser without navigator.locks still creates a design, with no page error", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "locks", {
      get: () => undefined,
      configurable: true,
    });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await readyToContinue(page);
  expect(
    await page.evaluate(() => "locks" in navigator && navigator.locks),
  ).toBeFalsy();

  const id = await continueToDesign(page);

  expect(await canWrite(page, id)).toBe(true);
  expect(pageErrors).toEqual([]);
});
