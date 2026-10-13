// Wave 8Q criterion 2: every page family loads with no violation of the content security policy, of either
// disposition, seen three ways (`support/csp-violations.ts`). One row per family: the pages of S0's tour, the one
// unmatched address of each of the three kinds, and the collector's own self-test (criterion 3, report-only half).
// THIS FILE IS A `CI=1` SPEC AND SAYS SO: the production build's nonces and prerendered documents are what is under
// test, and under `next dev` every page is rendered for the request and carries the development policy (ADR 0158
// *Limits*). Its evidence is a `CI=1` run, never `pnpm ci:local`, whose e2e step runs `next dev` until Q42 is answered.
//
// Writes, all to the test database and all removed by this file or the run's teardown: one design minted for the whole
// worker and one share link issued for it. Every contact request is answered from `page.route`, so none reaches the
// server and none is stored.
//
// Not in the tour, with the reason (criterion 2's own clause):
//   - the failed server render (a 500 document): it needs a second server whose database is unreachable (S6 item 4);
//   - the global error page: nothing a browser is sent reaches it. `/_global-error` is rewritten to the not-found page
//     (8Q.12), and a render that fails answers the 500 document above, not `global-error`;
//   - the two literal internal addresses and every other unmatched class: criterion 1's spec, `unmatched-addresses`;
//   - Russian: QA's pass owes the tour in Russian.
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import { CONTENT_SECURITY_POLICY_MODE } from "../../src/lib/security-headers";

import {
  ANSWERS,
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
  DONE_HEADING,
} from "./support/contact-page";
import { newName, newPhone } from "./support/contact-run";
import {
  NO_VIOLATIONS,
  POLICY_HEADER,
  REPORT_PATH,
  policyOf,
  violationsSeen,
  watchForViolations,
  type ViolationNet,
} from "./support/csp-violations";
import { deleteMintedDesigns } from "./support/minted-designs";
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
  "CI=1 pnpm exec playwright test tests/e2e/csp-every-page.e2e.spec.ts --project=mobile";

const STEP_ONE_PATH = "/ro/configurator/room";
const UNKNOWN_DESIGN_PATH = "/ro/d/e2e-readiness-probe";
const REDIRECTING_PATHS = ["/", "/ro", "/ro/configurator/configure"] as const;
const SELF_TEST_MARKER = "__cspSelfTestRan";
const SELF_TEST_SCRIPT = `<script>window.${SELF_TEST_MARKER} = 1</script>`;

type OwnerState = Awaited<ReturnType<BrowserContext["storageState"]>>;

interface TourDesign {
  readonly design: SeededDesign;
  readonly sharePath: string;
  readonly ownerState: OwnerState;
}

/** A stranger's browser: it holds no cookie, so it is every page's first visitor. */
const strangerTest = base;

/** The owner's browser: one design for the worker, minted once, whose cookies every owner test starts with. */
const ownerTest = base
  .extend<object, { tourDesign: TourDesign }>({
    tourDesign: [
      async ({ browser }, use, workerInfo) => {
        const tourDesign = await mintTourDesign(
          browser,
          requireBaseUrl(workerInfo.project.use.baseURL),
        );
        try {
          await use(tourDesign);
        } finally {
          await deleteMintedDesigns([tourDesign.design.id]);
        }
      },
      { scope: "worker" },
    ],
  })
  .extend({
    storageState: async ({ tourDesign }, use) => {
      await use(tourDesign.ownerState);
    },
  });

function requireBaseUrl(baseURL: string | undefined): string {
  if (baseURL === undefined) {
    throw new Error("the project sets no baseURL, so no page can be opened");
  }
  return baseURL;
}

async function mintTourDesign(
  browser: Browser,
  baseURL: string,
): Promise<TourDesign> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const design = await mintSeededDesign(page);
    const sharePath = await issueShareLink(page, design);
    return { design, sharePath, ownerState: await context.storageState() };
  } finally {
    await context.close();
  }
}

strangerTest.describe("a stranger's pages", () => {
  strangerTest.skip(process.env.CI === undefined, RUN_UNDER_CI);

  strangerTest(
    "Step 1 draws and hydrates with no violation",
    async ({ page }) => {
      const net = await watchForViolations(page);

      await page.goto(STEP_ONE_PATH);
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  strangerTest(
    "the callback page draws its form with no violation",
    async ({ page }) => {
      const net = await watchForViolations(page);

      await page.goto(callbackPath("ro"));
      await expectFormDrawn(page);
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  strangerTest(
    "the load-error page, for an id nothing matches, has no violation",
    async ({ page }) => {
      const net = await watchForViolations(page);

      await page.goto(UNKNOWN_DESIGN_PATH);
      await expect(page.getByTestId("design-load-error")).toBeVisible();
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  for (const path of REDIRECTING_PATHS) {
    strangerTest(
      `${path} redirects to Step 1, followed, with no violation`,
      async ({ page }) => {
        const net = await watchForViolations(page);

        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${STEP_ONE_PATH}$`));
        await expectHydrated(page);

        expectNoViolations(net);
      },
    );
  }

  strangerTest(
    "an address no route answers, under a locale, is a 404 page with no violation",
    async ({ page }) => {
      const net = await watchForViolations(page);

      const response = await page.goto("/ro/zz");
      await expectHydrated(page);

      expect(response?.status()).toBe(404);
      expectNoViolations(net);
    },
  );

  for (const path of ["/api/zz", "/internal/zz"]) {
    strangerTest(
      `${path} is an empty 404, and loading it causes no violation`,
      async ({ page }) => {
        const net = await watchForViolations(page);

        const response = await page.goto(path);

        expect(response?.status()).toBe(404);
        expectNoViolations(net);
      },
    );
  }
});

ownerTest.describe("the owner's pages", () => {
  ownerTest.skip(process.env.CI === undefined, RUN_UNDER_CI);

  ownerTest(
    "the editor draws the scene with no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);

      await openSeededDesign(page, tourDesign.design);
      await expectSceneDrawn(page);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "the share view draws the scene with no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);

      await openSharedDesign(page, tourDesign.sharePath, { locale: "ro" });
      await expectSceneDrawn(page);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "the review draws the scene with no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);

      await page.goto(`/ro/d/${tourDesign.design.id}/review`);
      await expectSceneDrawn(page);
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "the design's contact page draws its form with no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);

      await page.goto(contactDocumentPath("ro", tourDesign.design.id));
      await expectFormDrawn(page);
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "the confirmation, loaded with no request to show, has no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);

      await page.goto(donePath("ro", tourDesign.design.id));
      await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "frame 5A, the confirmation after a send the server answers, has no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);
      await answerContactWith(page, ANSWERS.sent("CSP-TOUR-0001"));

      await sendTheDesignForm(page, tourDesign.design);
      await expectDoneShown(page, "ro", tourDesign.design.id);

      expectNoViolations(net);
    },
  );

  ownerTest(
    "frame 5B, the failure after a lost answer, has no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);
      await answerContactWith(page, NETWORK_FAILURE);

      await sendTheDesignForm(page, tourDesign.design);
      await expect(page.getByTestId(FAILURE)).toBeVisible();

      expectNoViolations(net);
    },
  );

  ownerTest(
    "frame 2F, the WebGL-unavailable page, has no violation",
    async ({ page, tourDesign }) => {
      const net = await watchForViolations(page);
      await refuseWebGlContexts(page);

      await page.goto(`/ro/d/${tourDesign.design.id}`);
      await expect(page.getByTestId("webgl-unavailable")).toBeVisible({
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      });
      await expectHydrated(page);

      expectNoViolations(net);
    },
  );
});

strangerTest.describe(
  "the net's self-test (criterion 3, in the live mode)",
  () => {
    strangerTest.skip(process.env.CI === undefined, RUN_UNDER_CI);

    strangerTest(
      "an inline script nobody nonced is seen by all three observers, and runs only where nothing is blocked",
      async ({ page }) => {
        const net = await watchForViolations(page);
        await page.route(`**${REPORT_PATH}`, (route) =>
          route.fulfill({ status: 204 }),
        );
        await page.route(`**${STEP_ONE_PATH}`, injectAnInlineScript);

        await page.goto(STEP_ONE_PATH);

        await expect
          .poll(() => violationsSeen(net).events.length, {
            message: "securitypolicyviolation events",
          })
          .toBeGreaterThan(0);
        await expect
          .poll(() => violationsSeen(net).consoleMessages.length, {
            message: "console messages naming the policy",
          })
          .toBeGreaterThan(0);
        await expect
          .poll(() => violationsSeen(net).reportRequests.length, {
            message: `requests to ${REPORT_PATH}`,
          })
          .toBeGreaterThan(0);
        expect(violationsSeen(net).events).toContainEqual(
          expect.objectContaining({
            directive: "script-src-elem",
            disposition: dispositionOfTheLiveMode(),
          }),
        );
        expect(await page.evaluate(readSelfTestMarker, SELF_TEST_MARKER)).toBe(
          isEnforcing() ? null : 1,
        );
      },
    );

    strangerTest(
      "a page nothing was injected into leaves the same net empty",
      async ({ page }) => {
        const net = await watchForViolations(page);

        await page.goto(STEP_ONE_PATH);
        await expectHydrated(page);

        expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
      },
    );
  },
);

function expectNoViolations(net: ViolationNet): void {
  expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
}

async function expectHydrated(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(hasReactFibres), {
      message: "React has hydrated the page",
      timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
    })
    .toBe(true);
}

function hasReactFibres(): boolean {
  return [...document.querySelectorAll("*")].some((element) =>
    Object.keys(element).some((key) => key.startsWith("__reactFiber$")),
  );
}

async function expectSceneDrawn(page: Page): Promise<void> {
  await expect(page.locator("canvas").first()).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
}

/** Fills the design form and presses its call to action, after the least time the server would take the form at. */
async function sendTheDesignForm(
  page: Page,
  design: SeededDesign,
): Promise<void> {
  await page.goto(contactDocumentPath("ro", design.id));
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

/** Serves the page with one inline script no nonce covers, under a policy that also names the report path. */
async function injectAnInlineScript(route: Route): Promise<void> {
  if (route.request().resourceType() !== "document") {
    await route.continue();
    return;
  }
  const response = await route.fetch();
  const headers = { ...response.headers() };
  delete headers["content-encoding"];
  delete headers["content-length"];
  headers[POLICY_HEADER] = policyNamingTheReportPath(policyOf(response));
  await route.fulfill({
    response,
    headers,
    body: (await response.text()).replace(
      "</body>",
      `${SELF_TEST_SCRIPT}</body>`,
    ),
  });
}

/** The policy until S4 gives it a `report-uri` of its own; after that it already names one, and is left alone. */
function policyNamingTheReportPath(policy: string | undefined): string {
  if (policy === undefined) throw new Error("the page carries no policy");
  return /(^|;)\s*report-uri\s/.test(policy)
    ? policy
    : `${policy}; report-uri ${REPORT_PATH}`;
}

function readSelfTestMarker(markerName: string): unknown {
  return (window as unknown as Record<string, unknown>)[markerName] ?? null;
}

function isEnforcing(): boolean {
  return CONTENT_SECURITY_POLICY_MODE === "enforce";
}

function dispositionOfTheLiveMode(): "enforce" | "report" {
  return isEnforcing() ? "enforce" : "report";
}
