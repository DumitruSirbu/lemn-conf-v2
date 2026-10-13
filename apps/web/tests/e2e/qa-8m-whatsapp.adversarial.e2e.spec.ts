// Wave 8M criterion 18, by touch, in Chromium, on the production server: the WhatsApp action of frame 5A. THIS FILE HOLDS
// ONLY ON THE PRODUCTION SERVER (`CI=1`): it counts requests. The confirmation is reached by a send answered by
// `page.route`, so no contact row is stored; the share link is the design's own, made by the real endpoint against the
// test database, and the design is removed with its link by the fixture. A tap that would open WhatsApp is answered here
// by the context, so nothing leaves the machine.
//
// Proved: nothing is asked of the share endpoint on arrival or while the page rests; with no link active one press is one
// status read and one `POST`, and the link is shown; with a link active the warning stands and nothing is issued until the
// customer goes on, three taps in all, and a double tap issues one; the external link's address is `https://wa.me/?text=`
// and the one encoded message and nothing else; `target`, `rel`; no window is opened by script, and the tap opens one;
// the share address is in no history entry of this application, no storage, no cookie and no console line.
import { expect, type Page, type Request } from "@playwright/test";

import { DONE_HEADING, MESSAGES } from "./support/contact-page";
import { reachDoneByAMockedSend } from "./support/qa-8m";
import { historyLength } from "./support/qa-8d-review";
import { test } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It counts requests on the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-whatsapp.adversarial.e2e.spec.ts --project=mobile";

test.beforeEach(() => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);
});

const SEND = "done-whatsapp-send";
const GO_ON = "done-whatsapp-go-on";
const OPEN = "done-whatsapp-open";
const WARNING = "done-whatsapp-reissue-warning";
const WHATSAPP_ADDRESS = "https://wa.me/?text=";

interface ShareTraffic {
  readonly methods: string[];
}

function watchShareEndpoint(page: Page, designId: string): ShareTraffic {
  const traffic: ShareTraffic = { methods: [] };
  page.on("request", (request: Request) => {
    if (new URL(request.url()).pathname === `/api/designs/${designId}/share`) {
      traffic.methods.push(request.method());
    }
  });
  return traffic;
}

async function stubWhatsapp(page: Page): Promise<string[]> {
  const reached: string[] = [];
  await page.context().route("https://wa.me/**", async (route) => {
    reached.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>wa.me stub</body></html>",
    });
  });
  return reached;
}

async function countScriptedWindows(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    Reflect.set(window, "__windowsOpenedByScript", calls);
    const original = window.open.bind(window);
    window.open = (...args: Parameters<typeof window.open>) => {
      calls.push(args);
      return original(...args);
    };
  });
}

async function windowsOpenedByScript(page: Page): Promise<number> {
  return page.evaluate(
    () => (Reflect.get(window, "__windowsOpenedByScript") as unknown[]).length,
  );
}

function messageFor(
  locale: "ro" | "ru",
  origin: string,
  sharePath: string,
): string {
  return MESSAGES[locale].submissionResult.whatsappMessage.replace(
    "{link}",
    `${origin}${sharePath}`,
  );
}

async function sharePathOf(
  page: Page,
  press: () => Promise<void>,
  designId: string,
): Promise<string> {
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/designs/${designId}/share`,
  );
  await press();
  const body = (await (await answered).json()) as { path: string };
  return body.path;
}

async function expectTheShareAddressIsNowhereElse(
  page: Page,
  sharePath: string,
  consoleLines: readonly string[],
): Promise<void> {
  const token = sharePath.split("/").at(-1) ?? "";
  expect(token.length).toBeGreaterThan(8);
  const holders = await page.evaluate(async () => ({
    cookie: document.cookie,
    local: JSON.stringify(Object.entries(window.localStorage)),
    session: JSON.stringify(Object.entries(window.sessionStorage)),
    databases: JSON.stringify(
      (await window.indexedDB.databases()).map(({ name }) => name),
    ),
    historyState: JSON.stringify(window.history.state),
    location: window.location.href,
    resources: JSON.stringify(
      performance.getEntriesByType("resource").map(({ name }) => name),
    ),
    title: document.title,
    windowName: window.name,
  }));
  for (const [holder, text] of Object.entries({
    ...holders,
    console: consoleLines.join("\n"),
  })) {
    expect(text, `${holder} holds the share address`).not.toContain(token);
  }
  const markup = await page.evaluate(() => document.documentElement.outerHTML);
  const places = markup.split(token).length - 1;
  // The anchor's own address is the only place in the page, and it is there once.
  expect(places, "the share address stands in the page's markup once").toBe(1);
}

for (const locale of ["ro", "ru"] as const) {
  test(`${locale}: arriving asks the share endpoint for nothing; with no link active a press is one status read and one POST, then the external link is shown, and the tap on it is the one thing that opens a window`, async ({
    page,
    context,
    seededDesign,
    baseURL,
  }) => {
    const traffic = watchShareEndpoint(page, seededDesign.id);
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));
    await countScriptedWindows(page);
    const wa = await stubWhatsapp(page);
    await reachDoneByAMockedSend(page, seededDesign, locale, "LMN-WA-0001");
    const historyAtArrival = await historyLength(page);

    await page.waitForTimeout(2000);
    expect(traffic.methods, "arriving and resting ask nothing").toEqual([]);
    await expect(page.getByTestId(SEND)).toHaveText(
      MESSAGES[locale].submissionResult.sendOnWhatsapp,
    );
    await expect(page.getByTestId(DONE_HEADING)).toBeFocused();
    await expect(page.getByTestId(OPEN)).toHaveCount(0);

    const sharePath = await sharePathOf(
      page,
      () => page.getByTestId(SEND).tap(),
      seededDesign.id,
    );

    const open = page.getByTestId(OPEN);
    await expect(open).toBeVisible();
    expect(traffic.methods, "one status read and one issue").toEqual([
      "GET",
      "POST",
    ]);
    const origin = new URL(baseURL ?? "").origin;
    const expectedHref = `${WHATSAPP_ADDRESS}${encodeURIComponent(
      messageFor(locale, origin, sharePath),
    )}`;
    expect(await open.getAttribute("href")).toBe(expectedHref);
    expect(await open.getAttribute("target")).toBe("_blank");
    const rel = (await open.getAttribute("rel")) ?? "";
    expect(rel.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
    expect(expectedHref).not.toContain("LMN-WA-0001");
    // The decoded message is one sentence and the link: no reference, no typed value, no price, no second line.
    const decoded = decodeURIComponent(
      expectedHref.slice(WHATSAPP_ADDRESS.length),
    );
    expect(decoded).not.toContain("\n");
    expect(decoded.endsWith(`${origin}${sharePath}`)).toBe(true);
    await expect(open).toBeFocused();
    expect(await windowsOpenedByScript(page), "no window by script").toBe(0);
    expect(await historyLength(page)).toBe(historyAtArrival);
    await expectTheShareAddressIsNowhereElse(page, sharePath, consoleLines);

    const popupOpened = context.waitForEvent("page");
    await open.tap();
    const popup = await popupOpened;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(expectedHref);
    expect(await popup.evaluate(() => window.opener === null), "noopener").toBe(
      true,
    );
    expect(wa).toHaveLength(1);
    expect(await windowsOpenedByScript(page), "still none by script").toBe(0);
    expect(await historyLength(page)).toBe(historyAtArrival);
    await popup.close();
    expect(traffic.methods, "the tap asks nothing more").toEqual([
      "GET",
      "POST",
    ]);
  });
}

test("ro: with a link already active the warning stands first, nothing is issued until the customer goes on, a double tap on going on issues one link, and that is three taps to the external link", async ({
  page,
  seededDesign,
  baseURL,
}) => {
  const traffic = watchShareEndpoint(page, seededDesign.id);
  await countScriptedWindows(page);
  await reachDoneByAMockedSend(page, seededDesign, "ro", "LMN-WA-0002");
  const earlier = await page.evaluate(async (designId) => {
    const response = await fetch(`/api/designs/${designId}/share`, {
      method: "POST",
      credentials: "same-origin",
    });
    return (await response.json()) as { path: string };
  }, seededDesign.id);
  traffic.methods.length = 0;

  await page.getByTestId(SEND).tap();

  await expect(page.getByTestId(WARNING)).toHaveText(
    MESSAGES.ro.share.reissueWarning,
  );
  await expect(page.getByTestId(GO_ON)).toBeFocused();
  await expect(page.getByTestId(OPEN)).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(traffic.methods, "the status read, and nothing issued").toEqual([
    "GET",
  ]);

  const sharePath = await sharePathOf(
    page,
    async () => {
      await page.getByTestId(GO_ON).evaluate((button) => {
        (button as HTMLElement).click();
        (button as HTMLElement).click();
      });
    },
    seededDesign.id,
  );
  await expect(page.getByTestId(OPEN)).toBeVisible();
  expect(traffic.methods, "one issue for the two presses").toEqual([
    "GET",
    "POST",
  ]);
  expect(sharePath, "the old link was replaced").not.toBe(earlier.path);
  expect(await page.getByTestId(OPEN).getAttribute("href")).toBe(
    `${WHATSAPP_ADDRESS}${encodeURIComponent(
      messageFor("ro", new URL(baseURL ?? "").origin, sharePath),
    )}`,
  );
  await expect(page.getByTestId(WARNING)).toHaveCount(0);
  expect(await windowsOpenedByScript(page)).toBe(0);
});

test("ro: a share endpoint that fails shows the share error and its retry repeats what failed, and the link is never made by a failed read", async ({
  page,
  seededDesign,
}) => {
  const traffic = watchShareEndpoint(page, seededDesign.id);
  await reachDoneByAMockedSend(page, seededDesign, "ro", "LMN-WA-0003");
  let failTheStatusRead = true;
  await page.route(`**/api/designs/${seededDesign.id}/share`, async (route) => {
    if (route.request().method() === "GET" && failTheStatusRead) {
      await route.fulfill({ status: 500, body: "{}" });
      return;
    }
    await route.continue();
  });

  await page.getByTestId(SEND).tap();

  await expect(page.getByTestId("done-whatsapp-error")).toHaveText(
    MESSAGES.ro.share.error,
  );
  expect(traffic.methods, "a failed status read issued nothing").toEqual([
    "GET",
  ]);
  failTheStatusRead = false;
  await page.getByTestId("done-whatsapp-retry").tap();
  await expect(page.getByTestId(OPEN)).toBeVisible();
  expect(traffic.methods).toEqual(["GET", "GET", "POST"]);
});
