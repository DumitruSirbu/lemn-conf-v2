// Wave 8Q S6 item 1 and criterion 3, QA's: what the policy DOES to an injection, on the editor, the share view and the
// callback page. An injected parser-inserted inline script, an inline handler, a `<script src>` of another origin and a
// `<script>` with the wrong nonce are each (1) blocked, so no marker is set and another origin is never asked for the
// script, (2) a violation of the right directive whose disposition is the live mode's, seen by the event observer and
// reported to the sink, and (3) harmless to the page, which still hydrates and answers a tap. Every proof has a control
// that can fail it: the same shapes carrying the response's OWN nonce run and set their markers, so a blocked marker is
// a blocked script and never a script nobody inserted.
//
// Every expectation is derived from the mode constant: under a rollback to report-only the same injection RUNS, is a
// `report` violation, and the foreign script IS fetched, so this file needs no edit for a rollback (criterion 7).
// THIS FILE IS A `CI=1` SPEC: the production build's nonces are under test. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-enforced.adversarial.e2e.spec.ts --project=mobile
// Writes: one design minted per worker, one share link, both removed. Reports are answered by `page.route`, so none
// reaches the suite's server and the teardown's whole-run net stays at zero. No contact request is sent.
import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  CSP_REPORT_PATH,
  cspResponseHeaderName,
} from "../../src/lib/security-headers";
import { callbackPath, expectFormDrawn, field } from "./support/contact-page";
import {
  NO_VIOLATIONS,
  violationsSeen,
  watchForViolations,
} from "./support/csp-violations";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  CONTROL_MARKER,
  FOREIGN_BODY_MARKER,
  INJECTION_KINDS,
  captureReports,
  controlHtml,
  dispositionOfTheLiveMode,
  expectedViolationOf,
  hasHydrated,
  IMAGE_ID,
  imageHasErrored,
  injectIntoDocuments,
  injectionHtml,
  isEnforcing,
  markerOf,
  readMarker,
  serveForeignScript,
  type ForeignScriptStub,
  type InjectionKind,
} from "./support/qa-8q-injection";
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
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-enforced.adversarial.e2e.spec.ts --project=mobile";

type OwnerState = Awaited<ReturnType<BrowserContext["storageState"]>>;

interface Fixtures {
  readonly design: SeededDesign;
  readonly sharePath: string;
  readonly ownerState: OwnerState;
}

const test = base
  .extend<object, { fixtures: Fixtures }>({
    fixtures: [
      async ({ browser }, use, workerInfo) => {
        const fixtures = await mintFixtures(
          browser,
          workerInfo.project.use.baseURL,
        );
        try {
          await use(fixtures);
        } finally {
          await deleteMintedDesigns([fixtures.design.id]);
        }
      },
      { scope: "worker" },
    ],
  })
  .extend({
    storageState: async ({ fixtures }, use) => {
      await use(fixtures.ownerState);
    },
  });

async function mintFixtures(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Fixtures> {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
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

interface PageUnderTest {
  readonly name: string;
  open(page: Page, fixtures: Fixtures): Promise<void>;
  /** A control only the page's own, running scripts can answer. */
  answersATap(page: Page): Promise<void>;
}

const PAGES: readonly PageUnderTest[] = [
  {
    name: "the editor",
    open: async (page, { design }) => {
      await openSeededDesign(page, design, { locale: "ro" });
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      });
    },
    answersATap: async (page) => {
      await expect(page.getByTestId("global-settings-trigger")).toBeEnabled();
      await page.getByTestId("global-settings-trigger").tap();
      await expect(page.getByTestId("global-settings-surface")).toBeVisible();
    },
  },
  {
    name: "the share view",
    open: async (page, { sharePath }) => {
      await openSharedDesign(page, sharePath, { locale: "ro" });
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
      });
    },
    // The share view holds no control: the scene drawn by the page's own chunks is its answer, and React must own it.
    answersATap: async (page) => {
      await expect.poll(() => hasHydrated(page)).toBe(true);
    },
  },
  {
    name: "the callback page",
    open: async (page) => {
      await page.goto(callbackPath("ro"));
      await expectFormDrawn(page);
    },
    // Enter in a form's field submits it to the browser unless the page's script is running and says what is missing.
    answersATap: async (page) => {
      const before = page.url();
      await field(page, "phone").press("Enter");
      await expect(
        page.getByTestId("contact-consent").getByRole("alert"),
      ).toBeVisible();
      expect(page.url()).toBe(before);
    },
  },
];

test.describe("an injection under the live policy", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  // One test per page and purpose, each load in a fresh browser context: the e2e budget counts tests
  // (`gate:e2e-shard-budget`), and `test.step` names the kind that fails.
  for (const pageUnderTest of PAGES) {
    test(`${pageUnderTest.name}: each injected kind is ${isEnforcing() ? "blocked" : "run"}, reported as ${dispositionOfTheLiveMode()}, and the page still works`, async ({
      browser,
      fixtures,
    }) => {
      for (const kind of INJECTION_KINDS) {
        await test.step(`an injected ${kind}`, async () => {
          const context = await browser.newContext({
            storageState: fixtures.ownerState,
          });
          try {
            const page = await context.newPage();
            const foreign = await serveForeignScript(page);
            const net = await watchForViolations(page);
            const reports = await captureReports(page);
            await injectIntoDocuments(page, () =>
              injectionHtml(kind, foreign.url),
            );

            await pageUnderTest.open(page, fixtures);
            await pageUnderTest.answersATap(page);

            await expectTheInjectionHandled(page, kind, {
              net,
              reports,
              foreign,
            });
          } finally {
            await context.close();
          }
        });
      }
    });

    test(`${pageUnderTest.name}: controls, the same shapes with the response's own nonce run and the net stays silent, and with nothing injected every marker is unset`, async ({
      browser,
      fixtures,
    }) => {
      await test.step("nonced shapes", async () => {
        const context = await browser.newContext({
          storageState: fixtures.ownerState,
        });
        try {
          const page = await context.newPage();
          const foreign = await serveForeignScript(page);
          const net = await watchForViolations(page);
          const reports = await captureReports(page);
          await injectIntoDocuments(page, (nonce) =>
            controlHtml(nonce, foreign.url),
          );

          await pageUnderTest.open(page, fixtures);
          await pageUnderTest.answersATap(page);

          expect(
            await readMarker(page, CONTROL_MARKER),
            "a nonced inline script",
          ).toBe(1);
          await expect
            .poll(() => readMarker(page, FOREIGN_BODY_MARKER), {
              message:
                "a nonced script of another origin, admitted by strict-dynamic",
            })
            .toBe(1);
          expect(foreign.requests).toHaveLength(1);
          expect(await imageHasErrored(page), "the broken image").toBe(true);
          expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
          expect(reports).toEqual([]);
        } finally {
          await context.close();
        }
      });
      await test.step("nothing injected", async () => {
        const context = await browser.newContext({
          storageState: fixtures.ownerState,
        });
        try {
          const page = await context.newPage();
          const net = await watchForViolations(page);
          const reports = await captureReports(page);

          await pageUnderTest.open(page, fixtures);
          await pageUnderTest.answersATap(page);

          for (const kind of INJECTION_KINDS) {
            expect(await readMarker(page, markerOf(kind))).toBeNull();
          }
          expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
          expect(reports).toEqual([]);
        } finally {
          await context.close();
        }
      });
    });
  }
});

async function expectTheInjectionHandled(
  page: Page,
  kind: InjectionKind,
  seen: {
    net: Awaited<ReturnType<typeof watchForViolations>>;
    reports: Awaited<ReturnType<typeof captureReports>>;
    foreign: ForeignScriptStub;
  },
): Promise<void> {
  const { net, reports, foreign } = seen;
  const expected = expectedViolationOf(kind, foreign.url);
  await expect
    .poll(() => violationsSeen(net).events.length, {
      message: "the securitypolicyviolation events",
    })
    .toBeGreaterThan(0);
  for (const event of violationsSeen(net).events) {
    expect(event.directive, JSON.stringify(event)).toBe(expected.directive);
    expect(event.blockedUri).toContain(expected.blockedUriStartsWith);
    expect(event.disposition).toBe(dispositionOfTheLiveMode());
  }
  await expect
    .poll(
      () =>
        reports.filter(
          (report) =>
            report.report["effective-directive"] === expected.directive &&
            report.report.disposition === dispositionOfTheLiveMode(),
        ).length,
      { message: "the report the sink would have been sent" },
    )
    .toBeGreaterThan(0);
  for (const report of reports) {
    expect(report.contentType).toContain("application/csp-report");
  }
  // A foreign script sets its own marker (below), never this kind's: asserting this one would pass vacuously.
  if (kind !== "foreign-src") {
    expect(await readMarker(page, markerOf(kind))).toBe(
      isEnforcing() ? null : 1,
    );
  }
  expect(
    foreign.requests.length,
    "requests another origin saw for the script",
  ).toBe(kind === "foreign-src" && !isEnforcing() ? 1 : 0);
  if (kind === "foreign-src") {
    expect(await readMarker(page, FOREIGN_BODY_MARKER)).toBe(
      isEnforcing() ? null : 1,
    );
  }
  if (kind === "handler") {
    expect(
      await imageHasErrored(page),
      "the image really failed, so its onerror had its chance to run",
    ).toBe(true);
  }
  expect(await hasHydrated(page)).toBe(true);
}

test.describe("an injection after the document, with the collector still listening", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("a violation made after a client-side navigation in the editor is still seen and reported", async ({
    page,
    fixtures,
  }) => {
    const net = await watchForViolations(page);
    const reports = await captureReports(page);
    await PAGES[0]?.open(page, fixtures);
    const documentsBefore = await page.evaluate(
      () => performance.getEntriesByType("navigation").length,
    );
    expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);

    // Not a new document: the page's own router replaces the address, as a click on a link in the page would.
    await page.evaluate(() => {
      window.history.pushState({}, "", `${window.location.pathname}?qa8q=1`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<img src="data:image/png;base64,AAAA" onerror="window.__qa8q_after_nav = 1">',
      );
    });

    await expect
      .poll(() => violationsSeen(net).events.length)
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => performance.getEntriesByType("navigation").length,
      ),
      "still the one document",
    ).toBe(documentsBefore);
    expect(violationsSeen(net).events[0]).toMatchObject({
      directive: "script-src-attr",
      disposition: dispositionOfTheLiveMode(),
    });
    await expect.poll(() => reports.length).toBeGreaterThan(0);
    expect(await readMarker(page, "__qa8q_after_nav")).toBe(
      isEnforcing() ? null : 1,
    );
  });
});

test.describe("the observers hear both dispositions, whatever the live mode", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  // A policy of the OTHER mode's header, beside the live one, that refuses images and names the sink. The live policy
  // admits `data:` images, so under today's enforcement this is a violation of disposition `report` the page survives,
  // and under a rollback it is one of disposition `enforce`. Either way an observer that counted one disposition only
  // would miss it: this is what keeps "the net counts both" (8Q.6) true while the live mode is the other one.
  const ONE_PIXEL_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  test("an img-src policy of the other mode beside the live one is seen by all three observers, as the other disposition", async ({
    page,
  }) => {
    const otherDisposition = isEnforcing() ? "report" : "enforce";
    const otherHeader = cspResponseHeaderName(
      isEnforcing() ? "report-only" : "enforce",
    ).toLowerCase();
    const net = await watchForViolations(page);
    const reports = await captureReports(page);
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      headers[otherHeader] = `img-src 'none'; report-uri ${CSP_REPORT_PATH}`;
      await route.fulfill({
        response,
        headers,
        body: (await response.text()).replace(
          "</body>",
          `<img id="${IMAGE_ID}" src="${ONE_PIXEL_PNG}"></body>`,
        ),
      });
    });

    await page.goto("/ro/configurator/room");
    await expect.poll(() => hasHydrated(page)).toBe(true);

    await expect
      .poll(() => violationsSeen(net).events.length)
      .toBeGreaterThan(0);
    expect(violationsSeen(net).events).toContainEqual(
      expect.objectContaining({
        directive: "img-src",
        disposition: otherDisposition,
      }),
    );
    await expect
      .poll(
        () =>
          reports.filter(
            (report) =>
              report.report["effective-directive"] === "img-src" &&
              report.report.disposition === otherDisposition,
          ).length,
      )
      .toBeGreaterThan(0);
    expect(violationsSeen(net).reportRequests.length).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        (id) => (document.getElementById(id) as HTMLImageElement).naturalWidth,
        IMAGE_ID,
      ),
      "a report-only policy blocks nothing; an enforced one blocks the image",
    ).toBe(isEnforcing() ? 1 : 0);
  });
});

test.describe("a worker's violation", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  interface WorkerMessage {
    kind: string;
    detail: unknown;
  }

  const WORKER_SOURCE = (target: string): string => `
    const report = (kind, detail) => postMessage({ kind, detail });
    self.addEventListener("securitypolicyviolation", (event) =>
      report("event", { directive: event.effectiveDirective, blocked: event.blockedURI, disposition: event.disposition }));
    fetch(${JSON.stringify(target)}, { mode: "no-cors" })
      .then(() => report("settled", "fetched"), () => report("settled", "refused"));
  `;

  async function runWorkerFetching(
    page: Page,
    target: string,
  ): Promise<WorkerMessage[]> {
    return page.evaluate(
      (source) =>
        new Promise<WorkerMessage[]>((resolve) => {
          const worker = new Worker(
            URL.createObjectURL(
              new Blob([source], { type: "text/javascript" }),
            ),
          );
          const messages: WorkerMessage[] = [];
          worker.onmessage = (
            message: MessageEvent<{ kind: string; detail: unknown }>,
          ) => {
            messages.push(message.data);
            if (message.data.kind === "settled") {
              setTimeout(() => {
                resolve(messages);
              }, 300);
            }
          };
        }),
      WORKER_SOURCE(target),
    );
  }

  test("a blob worker that fetches the application's own address is let alone, and one that fetches another origin is refused, and the report is the only observer that hears it", async ({
    page,
  }) => {
    const foreign = await serveForeignScript(page);
    const net = await watchForViolations(page);
    const reports = await captureReports(page);
    await page.goto("/ro/configurator/room");
    await expect.poll(() => hasHydrated(page)).toBe(true);

    // The control first: the same worker fetching the application's own address is not refused and reports nothing.
    const control = await runWorkerFetching(
      page,
      `${new URL(page.url()).origin}/ro/zz`,
    );
    expect(control.find((message) => message.kind === "settled")?.detail).toBe(
      "fetched",
    );
    expect(control.filter((message) => message.kind === "event")).toEqual([]);
    expect(reports).toEqual([]);
    expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
    const requestsBefore = foreign.requests.length;

    const messages = await runWorkerFetching(page, foreign.url);

    expect(messages.find((message) => message.kind === "settled")?.detail).toBe(
      isEnforcing() ? "refused" : "fetched",
    );
    expect(foreign.requests.length - requestsBefore).toBe(
      isEnforcing() ? 0 : 1,
    );
    await expect
      .poll(
        () =>
          reports.filter(
            (report) =>
              report.report["effective-directive"] === "connect-src" &&
              report.report.disposition === dispositionOfTheLiveMode(),
          ).length,
        { message: "a connect-src report from the worker" },
      )
      .toBeGreaterThan(0);
    expect(
      violationsSeen(net).reportRequests.length,
      "observer (iii) heard the request to the report path",
    ).toBeGreaterThan(0);
    // Measured 2026-10-13 (Chromium 151): the event fires on the worker's own scope and not on `document`, so observer (i)
    // is blind to a worker and observer (iii) is the only one that hears it (8Q.6's inference, now a measurement).
    expect(violationsSeen(net).events).toEqual([]);
    expect(
      messages.filter((message) => message.kind === "event").length,
      "the worker's own scope heard it",
    ).toBeGreaterThan(0);
    expect(CSP_REPORT_PATH).toBe("/api/csp-reports");
  });
});
