import {
  expect,
  test,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";

import {
  refusedPageHeaders,
  refusedPageHtml,
} from "../../src/lib/server/rate-limit/page-limit-page";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign, type Locale } from "./support/seeded-design";

/**
 * What a customer sees when a page read is refused: the page the module itself makes, put in front of a real browser
 * by its route interception, since a refusal on the server needs six hundred reads. The status, the headers and the
 * body are the module's own functions' answers, so the page seen here is the page a refusing server would send. Two
 * cases: a document, and a navigation's own fetch, which the router must not leave blank or stuck.
 */
const TELLS_SECONDS = 1800;

/** The sentence of a locale's own catalogue, read as the server reads it, since the loader cannot import JSON. */
function sentenceOf(locale: Locale): string {
  const catalogue = JSON.parse(
    readFileSync(join(process.cwd(), "src/messages", `${locale}.json`), "utf8"),
  ) as { designLoadError: { tooManyRequests: string } };
  return catalogue.designLoadError.tooManyRequests;
}

const SENTENCES: Readonly<Record<Locale, string>> = {
  ro: sentenceOf("ro"),
  ru: sentenceOf("ru"),
};
const LOCALES: readonly Locale[] = ["ro", "ru"];

function isFlightFetch(request: Request): boolean {
  return request.headers().rsc !== undefined;
}

/** Answers every request whose path is exactly `pathname` with the module's refusal, and writes down which. */
async function refusePath(
  page: Page,
  { pathname, locale }: { pathname: string; locale: Locale },
): Promise<Request[]> {
  const refused: Request[] = [];
  await page.route(
    (url) => url.pathname === pathname,
    async (route: Route) => {
      refused.push(route.request());
      await route.fulfill({
        status: 429,
        headers: refusedPageHeaders(TELLS_SECONDS),
        body: refusedPageHtml({ locale, sentence: SENTENCES[locale] }),
      });
    },
  );
  return refused;
}

test.describe("a refused page read, as a customer sees it", () => {
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  for (const locale of LOCALES) {
    test(`shows the sentence in ${locale}, and only it, for a refused document`, async ({
      page,
    }) => {
      const pathname = `/${locale}/d/a-design-the-limit-refused`;
      const refused = await refusePath(page, { pathname, locale });

      const response = await page.goto(pathname);

      expect(response?.status()).toBe(429);
      expect(response?.headers()["retry-after"]).toBe(String(TELLS_SECONDS));
      expect(response?.headers()["cache-control"]).toBe("no-store");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByText(SENTENCES[locale])).toBeVisible();
      await expect(page).toHaveTitle(SENTENCES[locale]);
      await expect(page.locator("body *")).toHaveCount(1);
      expect(refused).toHaveLength(1);
      expect(page.url()).toContain(pathname);
    });
  }

  test("ends on the same sentence, neither blank nor stuck, when a navigation's own fetch is refused", async ({
    page,
  }) => {
    const design = await mintSeededDesign(page, "ro");
    mintedIds.push(design.id);
    await page.goto(`/ro/d/${design.id}/review`);
    await expect(page.getByTestId("review-back")).toBeVisible();
    const refused = await refusePath(page, {
      pathname: `/ro/d/${design.id}`,
      locale: "ro",
    });

    await page.getByTestId("review-back").click();

    await expect(page.getByText(SENTENCES.ro)).toBeVisible();
    await expect(page.locator("body *")).toHaveCount(1);
    expect(refused.some(isFlightFetch)).toBe(true);
    expect(page.url()).toContain(`/ro/d/${design.id}`);
    console.log(
      `page read refused: the router sent ${String(refused.filter(isFlightFetch).length)} fetch and ` +
        `${String(refused.filter((request) => !isFlightFetch(request)).length)} document request(s) ` +
        "to the refused path, and the sentence is on screen",
    );
  });
});
