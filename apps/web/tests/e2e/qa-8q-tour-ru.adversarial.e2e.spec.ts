// Wave 8Q criterion 2, in Russian, QA's: every page family of the tour loads with no violation of either disposition (the
// three observers of `support/csp-violations.ts`) AND with no console error and no uncaught page error of any kind. The
// developer's tour (`csp-every-page`) is in Romanian; a second language is a second set of bundles, copy and
// right-to-left-free-but-longer strings, and the policy is the same one header. Each page is asserted to BE Russian
// (the document's `lang`), so a fallback to Romanian cannot make this a second run of the first tour.
// THIS FILE IS A `CI=1` SPEC. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-tour-ru.adversarial.e2e.spec.ts --project=mobile
// Writes: one design minted per worker, one share link, both removed. Every contact request is answered by `page.route`,
// so none reaches the server and none is stored. Reports (there should be none) are answered by `page.route` too.
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  ANSWERS,
  DONE_HEADING,
  FAILURE,
  NETWORK_FAILURE,
  answerContactWith,
  callbackPath,
  contactDocumentPath,
  donePath,
  expectDoneShown,
  expectFormDrawn,
  fillTheWholeForm,
  pressTheCallToAction,
  waitForTheLeastFormTime,
} from "./support/contact-page";
import { newName, newPhone } from "./support/contact-run";
import { CONTENT_SECURITY_POLICY_MODE } from "../../src/lib/security-headers";
import {
  NO_VIOLATIONS,
  isReportOnlyDiagnostic,
  violationsSeen,
  watchForViolations,
} from "./support/csp-violations";
import { deleteMintedDesigns } from "./support/minted-designs";
import { captureReports, hasHydrated } from "./support/qa-8q-injection";
import {
  FIRST_FRAME_FREEZE_TIMEOUT_MS,
  issueShareLink,
  mintSeededDesign,
  openSeededDesign,
  openSharedDesign,
  type SeededDesign,
} from "./support/seeded-design";

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-tour-ru.adversarial.e2e.spec.ts --project=mobile";

const STEP_ONE_PATH = "/ru/configurator/room";
const UNKNOWN_DESIGN_PATH = "/ru/d/e2e-readiness-probe";

type OwnerState = Awaited<ReturnType<BrowserContext["storageState"]>>;

interface TourDesign {
  readonly design: SeededDesign;
  readonly sharePath: string;
  readonly ownerState: OwnerState;
}

/** What a page wrote to its console as an error, and what it threw. A 404 document's own line is not an error of the page. */
interface PageNoise {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
}

const test = base.extend<object, { tourDesign: TourDesign }>({
  tourDesign: [
    async ({ browser }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      if (baseURL === undefined) throw new Error("the project sets no baseURL");
      const tourDesign = await mintTourDesign(browser, baseURL);
      try {
        await use(tourDesign);
      } finally {
        await deleteMintedDesigns([tourDesign.design.id]);
      }
    },
    { scope: "worker" },
  ],
});

async function mintTourDesign(
  browser: Browser,
  baseURL: string,
): Promise<TourDesign> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const design = await mintSeededDesign(page, "ru");
    const sharePath = await issueShareLink(page, design);
    return { design, sharePath, ownerState: await context.storageState() };
  } finally {
    await context.close();
  }
}

/** The net of the three observers, the answered reports, and the page's own noise. */
async function watchEverything(page: Page) {
  const net = await watchForViolations(page);
  const reports = await captureReports(page);
  const noise: PageNoise = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    const text = message.text();
    // The one console error a report-only document always writes is a diagnostic about the policy, not the page's.
    if (
      message.type() === "error" &&
      !isReportOnlyDiagnostic(text, CONTENT_SECURITY_POLICY_MODE)
    ) {
      noise.consoleErrors.push(text);
    }
  });
  page.on("pageerror", (error) => {
    noise.pageErrors.push(error.message);
  });
  return { net, reports, noise };
}

async function expectRussianAndQuiet(
  page: Page,
  watched: Awaited<ReturnType<typeof watchEverything>>,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(violationsSeen(watched.net)).toEqual(NO_VIOLATIONS);
  expect(watched.reports).toEqual([]);
  expect(watched.noise.pageErrors, "uncaught errors").toEqual([]);
  expect(watched.noise.consoleErrors, "console errors").toEqual([]);
}

async function expectHydrated(page: Page): Promise<void> {
  await expect
    .poll(() => hasHydrated(page), {
      message: "React has hydrated the page",
      timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
    })
    .toBe(true);
}

type Watched = Awaited<ReturnType<typeof watchEverything>>;

interface Stop {
  readonly name: string;
  /** Drives one page and says what must hold of it; `watched` is the page's three observers and its noise. */
  run(page: Page, watched: Watched, tourDesign: TourDesign): Promise<void>;
}

const STRANGER_STOPS: readonly Stop[] = [
  {
    name: "Step 1",
    run: async (page, watched) => {
      await page.goto(STEP_ONE_PATH);
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the callback page",
    run: async (page, watched) => {
      await page.goto(callbackPath("ru"));
      await expectFormDrawn(page);
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the load-error page, for an id nothing matches",
    run: async (page, watched) => {
      await page.goto(UNKNOWN_DESIGN_PATH);
      await expect(page.getByTestId("design-load-error")).toBeVisible();
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the root, with the Russian cookie, redirects to Step 1 in Russian",
    run: async (page, watched) => {
      await page
        .context()
        .addCookies([
          { name: "NEXT_LOCALE", value: "ru", domain: "localhost", path: "/" },
        ]);
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(`${STEP_ONE_PATH}$`));
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "an address no route answers is Next's 404, with no violation",
    run: async (page, watched) => {
      const response = await page.goto("/ru/zz");
      await expectHydrated(page);
      expect(response?.status()).toBe(404);
      expect(violationsSeen(watched.net)).toEqual(NO_VIOLATIONS);
      expect(watched.reports).toEqual([]);
      expect(watched.noise.pageErrors).toEqual([]);
    },
  },
];

const OWNER_STOPS: readonly Stop[] = [
  {
    name: "the editor draws the scene",
    run: async (page, watched, { design }) => {
      await openSeededDesign(page, design, { locale: "ru" });
      await expectSceneDrawn(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the share view draws the scene",
    run: async (page, watched, { sharePath }) => {
      await openSharedDesign(page, sharePath, { locale: "ru" });
      await expectSceneDrawn(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the review draws the scene",
    run: async (page, watched, { design }) => {
      await page.goto(`/ru/d/${design.id}/review`);
      await expectSceneDrawn(page);
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the design's contact page",
    run: async (page, watched, { design }) => {
      await page.goto(contactDocumentPath("ru", design.id));
      await expectFormDrawn(page);
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "the confirmation, loaded with no request to show",
    run: async (page, watched, { design }) => {
      await page.goto(donePath("ru", design.id));
      await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
      await expectHydrated(page);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "frame 5A, after a send the server answers",
    run: async (page, watched, { design }) => {
      await answerContactWith(page, ANSWERS.sent("CSP-RU-0001"));
      await sendTheDesignForm(page, design);
      await expectDoneShown(page, "ru", design.id);
      await expectRussianAndQuiet(page, watched);
    },
  },
  {
    name: "frame 2F, the WebGL-unavailable page",
    run: async (page, watched, { design }) => {
      await refuseWebGlContexts(page);
      await page.goto(`/ru/d/${design.id}`);
      await expect(page.getByTestId("webgl-unavailable")).toBeVisible({
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      });
      await expectHydrated(page);
      expect(violationsSeen(watched.net)).toEqual(NO_VIOLATIONS);
      expect(watched.reports).toEqual([]);
      expect(watched.noise.pageErrors).toEqual([]);
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    },
  },
  {
    name: "frame 5B, after a lost answer",
    run: async (page, watched, { design }) => {
      await answerContactWith(page, NETWORK_FAILURE);
      await sendTheDesignForm(page, design);
      await expect(page.getByTestId(FAILURE)).toBeVisible();
      // The aborted request is the page's own, and Chromium logs it as a failed load; that line is the test's doing.
      expect(violationsSeen(watched.net)).toEqual(NO_VIOLATIONS);
      expect(watched.reports).toEqual([]);
      expect(watched.noise.pageErrors).toEqual([]);
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    },
  },
];

/** One test per group, a step per stop, each stop in a fresh browser context: the e2e budget counts tests. */
async function tourOf(
  browser: Browser,
  stops: readonly Stop[],
  tourDesign: TourDesign,
  storageState: OwnerState | undefined,
): Promise<void> {
  for (const stop of stops) {
    await test.step(stop.name, async () => {
      const context = await browser.newContext({
        baseURL: requireBaseUrl(test.info().project.use.baseURL),
        ...(storageState === undefined ? {} : { storageState }),
      });
      try {
        const page = await context.newPage();
        const watched = await watchEverything(page);
        await stop.run(page, watched, tourDesign);
      } finally {
        await context.close();
      }
    });
  }
}

test.describe("the tour, in Russian", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("a stranger's pages: Step 1, the callback page, the load-error page, the root and a 404 break no policy and write no error", async ({
    browser,
    tourDesign,
  }) => {
    await tourOf(browser, STRANGER_STOPS, tourDesign, undefined);
  });

  test("the owner's pages: the editor, share view, review, contact page, confirmation, frames 5A, 2F and 5B break no policy and write no error", async ({
    browser,
    tourDesign,
  }) => {
    await tourOf(browser, OWNER_STOPS, tourDesign, tourDesign.ownerState);
  });

  test("control: the noise collectors see a console error and an uncaught error when there is one", async ({
    page,
  }) => {
    const watched = await watchEverything(page);
    await page.goto(STEP_ONE_PATH);
    await expectHydrated(page);

    await page.evaluate(() => {
      console.error("qa8q-planted-console-error");
      setTimeout(() => {
        throw new Error("qa8q-planted-uncaught-error");
      }, 0);
    });

    await expect.poll(() => watched.noise.pageErrors.length).toBeGreaterThan(0);
    expect(watched.noise.consoleErrors).toContain("qa8q-planted-console-error");
    expect(watched.noise.pageErrors[0]).toContain(
      "qa8q-planted-uncaught-error",
    );
  });
});

function requireBaseUrl(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
  return baseURL;
}

async function expectSceneDrawn(page: Page): Promise<void> {
  await expect(page.locator("canvas").first()).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
}

/** Makes every request for a WebGL context fail, so the page draws its exit instead of the scene. */
async function refuseWebGlContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    );
    const getContext: unknown = descriptor?.value;
    if (typeof getContext !== "function") {
      throw new Error("HTMLCanvasElement.getContext is not callable");
    }
    const browserGetContext =
      getContext as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId,
      ...arguments_
    ) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return Reflect.apply(browserGetContext, this, [contextId, ...arguments_]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function sendTheDesignForm(
  page: Page,
  design: SeededDesign,
): Promise<void> {
  await page.goto(contactDocumentPath("ru", design.id));
  const drawnAtMs = await expectFormDrawn(page);
  await expectHydrated(page);
  await fillTheWholeForm(page, {
    name: newName(),
    phone: newPhone(),
    locality: "Chisinau",
  });
  await waitForTheLeastFormTime(drawnAtMs);
  await pressTheCallToAction(page);
}
