// Wave 8L criterion 7, live: where the server cannot take a request, both contact pages say so and draw no way to send
// one. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): it starts a second `next start` of the build the suite's
// own server made, on port 4326, and counts requests, which a `next dev` server's strict mode makes untrustworthy
// (ADR 0158 *Limits*, backlog 182). Its evidence is a `CI=1` run, never `pnpm ci:local`.
//
// The second server is given no fake sender, no mail variable and its own digest secret: the three mail variables are
// absent, so `isContactSendable` is false and nothing it does can store or send. The page hands the browser a boolean;
// neither the HTML nor the RSC payload holds a variable's name or value, or a telephone number.
import { expect, test, type Page } from "@playwright/test";

import {
  callbackPath,
  contactDocumentPath,
  MESSAGES,
  UNAVAILABLE,
  CTA,
} from "./support/contact-page";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  CONTACT_UNAVAILABLE_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";
import { mintSeededDesign, type SeededDesign } from "./support/seeded-design";

const SERVER_START_TIMEOUT_MS = 300_000;
const RUN_UNDER_CI =
  "It needs the production build the first server makes under CI, and builds nothing itself. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/contact-unavailable.e2e.spec.ts --project=mobile";

/** What must not reach a page: the names of the variables the decision reads, and the fake sender's flag. */
const NAMES_THAT_MUST_NOT_REACH_A_PAGE = [
  "RESEND_API_KEY",
  "MAIL_FROM_ADDRESS",
  "LEAD_NOTIFICATION_ADDRESS",
  "LEMNARIA_E2E_FAKE_MAIL",
  "DIGEST_SECRET",
] as const;

const LOCALES = ["ro", "ru"] as const;

test.describe("a server that cannot take a contact request", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  const mintedIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    server = await startProductionPolicyServer(CONTACT_UNAVAILABLE_SERVER_PORT);
  });

  test.afterAll(async () => {
    await server?.stop();
    await deleteMintedDesigns(mintedIds);
  });

  function origin(): string {
    if (server === undefined) throw new Error("the second server is not up");
    return server.origin;
  }

  for (const locale of LOCALES) {
    test(`${locale}: the callback form is the sentence and nothing to send with, and the browser sends nothing`, async ({
      page,
    }) => {
      const sent: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/contact-submissions") {
          sent.push(request.method());
        }
      });

      const response = await page.goto(`${origin()}${callbackPath(locale)}`);

      expect(response?.status()).toBe(200);
      await expect(page.getByTestId(UNAVAILABLE)).toHaveText(
        MESSAGES[locale].contact.unavailable,
      );
      await expectNothingToSendWith(page);
      expect(sent).toEqual([]);
    });

    test(`${locale}: a design's contact page is the sentence and the way back, with nothing to send with, and the browser sends nothing`, async ({
      page,
    }) => {
      const design = await mintOnTheSuitesServer(page);
      const sent: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/contact-submissions") {
          sent.push(request.method());
        }
      });

      const response = await page.goto(
        `${origin()}${contactDocumentPath(locale, design.id)}`,
      );

      expect(response?.status()).toBe(200);
      await expect(page.getByTestId(UNAVAILABLE)).toHaveText(
        MESSAGES[locale].contact.unavailable,
      );
      await expectNothingToSendWith(page);
      await expect(page.getByTestId("contact-back")).toHaveAttribute(
        "href",
        `/${locale}/d/${design.id}/review`,
      );
      expect(sent).toEqual([]);
    });
  }

  test("neither page's HTML nor its RSC payload names a variable, holds the server's secret, or draws the shop's number", async ({
    page,
  }) => {
    const design = await mintOnTheSuitesServer(page);
    const secret = server?.secret ?? "";
    expect(secret.length).toBeGreaterThan(8);
    const pages = [callbackPath("ro"), contactDocumentPath("ru", design.id)];

    for (const path of pages) {
      const document = await page.context().request.get(`${origin()}${path}`);
      const flight = await page.context().request.get(`${origin()}${path}`, {
        headers: { rsc: "1" },
      });
      for (const answer of [document, flight]) {
        expect(answer.status(), path).toBe(200);
        const text = await answer.text();
        expect(text.length, `${path} has a body`).toBeGreaterThan(200);
        for (const name of NAMES_THAT_MUST_NOT_REACH_A_PAGE) {
          expect(text, `${path} holds ${name}`).not.toContain(name);
        }
        expect(text, `${path} holds the secret`).not.toContain(secret);
        expect(text, `${path} draws a number`).not.toMatch(/href="tel:/i);
      }
      const html = await document.text();
      expect(html).toMatch(/isSendable\\?":false/);
    }
  });

  test("the review's way to the contact page still leads to the sentence, and not to a form", async ({
    page,
  }) => {
    const design = await mintOnTheSuitesServer(page);

    await page.goto(`${origin()}/ro/d/${design.id}/review`);
    await expect(page.getByTestId("review-cta")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("review-cta").tap();
    await page.waitForURL(`${origin()}${contactDocumentPath("ro", design.id)}`);

    await expect(page.getByTestId(UNAVAILABLE)).toBeVisible();
    await expect(page.getByTestId(CTA)).toHaveCount(0);
  });

  async function mintOnTheSuitesServer(page: Page): Promise<SeededDesign> {
    const design = await mintSeededDesign(page);
    mintedIds.push(design.id);
    return design;
  }

  async function expectNothingToSendWith(page: Page): Promise<void> {
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.locator("main textarea")).toHaveCount(0);
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  }
});
