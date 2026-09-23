import { expect, test, type BrowserContext } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  mintSeededDesign,
  openDesignAndAwaitAccessProbe,
} from "./support/seeded-design";

/**
 * M7 wave 7E3a adversarial QA — what only a real browser can answer: criterion 8 (the clear is
 * honoured by Chromium, so it must carry `Secure`), criterion 10 (`document.cookie` never sees the
 * cookie while the jar holds it), criterion 9 (a foreign `/d/{id}` leaves the jar byte-identical),
 * criterion 4's cross-site form POST from another site, and cross-context isolation of resume.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const ATTACKER_HOST = "127.0.0.1";
const VALID_ROOM_QUERY =
  "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";

async function visitorCookieOf(context: BrowserContext) {
  return (await context.cookies()).find(
    (cookie) => cookie.name === VISITOR_COOKIE_NAME,
  );
}

function projectBaseUrl(): URL {
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error("the project has no baseURL");
  return new URL(base);
}

test.describe("criterion 8 — the clear, measured in the browser", () => {
  for (const path of ["/ro", "/ru/configurator/configure"]) {
    test(`${path}: a cookie whose design is gone is removed from the jar, and the visitor lands on room`, async ({
      page,
      context,
    }) => {
      const locale = path.slice(1, 3);
      const design = await mintSeededDesign(
        page,
        locale === "ru" ? "ru" : "ro",
      );
      expect(await visitorCookieOf(context)).toBeDefined();
      await deleteMintedDesigns([design.id]);

      await page.goto(path);

      expect(new URL(page.url()).pathname).toBe(`/${locale}/configurator/room`);
      expect(await visitorCookieOf(context)).toBeUndefined();
    });
  }
});

test.describe("criterion 10 — no script can read it", () => {
  for (const locale of ["ro", "ru"] as const) {
    test(`${locale}: document.cookie never names it on room (bare and with a query) or on /d/{id}`, async ({
      page,
      context,
    }) => {
      const design = await mintSeededDesign(page, locale);
      try {
        const paths = [
          `/${locale}/configurator/room`,
          `/${locale}/configurator/room?${VALID_ROOM_QUERY}`,
        ];
        for (const path of paths) {
          await page.goto(path);
          expect(
            await page.evaluate(() => document.cookie),
            path,
          ).not.toContain(VISITOR_COOKIE_NAME);
        }
        await openDesignAndAwaitAccessProbe(
          page,
          `/${locale}/d/${design.id}`,
          design.id,
        );
        expect(await page.evaluate(() => document.cookie)).not.toContain(
          VISITOR_COOKIE_NAME,
        );

        expect(await visitorCookieOf(context)).toBeDefined();
      } finally {
        await deleteMintedDesigns([design.id]);
      }
    });
  }

  test("a same-host script cannot overwrite the HttpOnly cookie through document.cookie", async ({
    page,
    context,
  }) => {
    const design = await mintSeededDesign(page);
    try {
      const before = await visitorCookieOf(context);
      await page.evaluate((name) => {
        document.cookie = `${name}=${"A".repeat(43)}; Secure; Path=/; SameSite=Lax`;
      }, VISITOR_COOKIE_NAME);

      const after = (await context.cookies()).filter(
        (c) => c.name === VISITOR_COOKIE_NAME,
      );
      expect(after).toHaveLength(1);
      expect(after[0]?.value).toBe(before?.value);
      expect(after[0]?.httpOnly).toBe(true);
    } finally {
      await deleteMintedDesigns([design.id]);
    }
  });
});

test.describe("criterion 9 — another visitor's /d/{id}", () => {
  test("opening a foreign design leaves the jar's visitor cookie byte-identical, and resume still finds this visitor's own", async ({
    page,
    context,
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const foreign = await mintSeededDesign(ownerPage);
    const own = await mintSeededDesign(page);
    try {
      const before = await visitorCookieOf(context);
      const ownerCookie = await visitorCookieOf(ownerContext);
      expect(before?.value).not.toBe(ownerCookie?.value);

      const { navigation, probe } = await openDesignAndAwaitAccessProbe(
        page,
        `/ro/d/${foreign.id}`,
        foreign.id,
      );
      expect(probe.canWrite).toBe(false);
      expect(
        (await navigation?.allHeaders())?.["set-cookie"] ?? "",
      ).not.toContain(VISITOR_COOKIE_NAME);

      expect(await visitorCookieOf(context)).toEqual(before);

      await page.goto("/ro");
      expect(new URL(page.url()).pathname).toBe(`/ro/d/${own.id}`);
    } finally {
      await ownerContext.close();
      await deleteMintedDesigns([foreign.id, own.id]);
    }
  });

  test("a fresh browser with no cookie is never resumed into anyone's design", async ({
    page,
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const foreign = await mintSeededDesign(await ownerContext.newPage());
    try {
      await page.goto("/ro");
      expect(new URL(page.url()).pathname).toBe("/ro/configurator/room");
    } finally {
      await ownerContext.close();
      await deleteMintedDesigns([foreign.id]);
    }
  });
});

test.describe("criterion 4 / D6 — a cross-site form POST cannot clobber the identity", () => {
  test(`an auto-submitted form from http://${ATTACKER_HOST} is refused and the jar's value is unchanged`, async ({
    page,
    context,
  }) => {
    const own = await mintSeededDesign(page);
    const minted: string[] = [own.id];
    try {
      const before = await visitorCookieOf(context);
      const target = new URL("/api/designs", projectBaseUrl());
      const attackerUrl = `http://${ATTACKER_HOST}:${target.port}/qa-7e3a-attacker`;
      await page.route(attackerUrl, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<form id="f" method="POST" action="${target.href}"></form>
                 <script>document.getElementById("f").submit()</script>`,
        }),
      );

      const mintResponse = page.waitForResponse(
        (response) =>
          response.url() === target.href &&
          response.request().method() === "POST",
      );
      await page.goto(attackerUrl);
      const response = await mintResponse;
      const request = response.request();
      const body = await response.text();
      const leakedId = /"id":"([^"]+)"/.exec(body)?.[1];
      if (leakedId !== undefined) minted.push(leakedId);

      // Playwright's `allHeaders()` does not surface Chromium's network-stack `Sec-Fetch-*` headers,
      // so the request is identified as cross-site by its `Origin` instead.
      expect((await request.allHeaders()).origin).toBe(
        `http://${ATTACKER_HOST}:${target.port}`,
      );
      expect(response.status()).toBe(403);
      expect(leakedId).toBeUndefined();
      expect(await visitorCookieOf(context)).toEqual(before);
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
});

test.describe("criterion 7 — neither route ever carries a body", () => {
  for (const path of [
    "/ro",
    "/ru",
    "/ro/configurator/configure",
    "/ru/configurator/configure",
  ]) {
    test(`${path}: every cookie state answers an empty body`, async ({
      request,
    }) => {
      for (const cookie of [
        undefined,
        `${VISITOR_COOKIE_NAME}=bad`,
        `${VISITOR_COOKIE_NAME}=${"z".repeat(43)}`,
      ]) {
        const response = await request.get(path, {
          maxRedirects: 0,
          headers: cookie === undefined ? {} : { cookie },
        });
        expect(response.status(), `${path} ${cookie ?? "no cookie"}`).toBe(307);
        expect(await response.text()).toBe("");
      }
    });
  }
});

test("the unprefixed / and /configurator/configure resume through the locale hop (R8)", async ({
  page,
}) => {
  const design = await mintSeededDesign(page);
  try {
    for (const path of ["/", "/configurator/configure"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, path).toBe(`/ro/d/${design.id}`);
    }
  } finally {
    await deleteMintedDesigns([design.id]);
  }
});
