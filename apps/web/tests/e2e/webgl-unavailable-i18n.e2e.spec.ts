import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import { openSeededDesign, test } from "./support/seeded-design";

const ro = JSON.parse(
  readFileSync(new URL("../../src/messages/ro.json", import.meta.url), "utf8"),
) as {
  readonly webglUnavailable: Readonly<Record<string, string>>;
};
const ru = JSON.parse(
  readFileSync(new URL("../../src/messages/ru.json", import.meta.url), "utf8"),
) as typeof ro;
const REPORT_ONLY_UPGRADE_INSECURE_REQUESTS_DIAGNOSTIC =
  "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.";

async function forceWebGLUnavailable(page: Page): Promise<void> {
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

// Moved onto `openSeededDesign` (wave 7E4 D3): the only difference from the configure route is
// G9's `titleMobile` source, and every ro/ru string below is still asserted visible.
test("the real request and client providers render the Romanian WebGL exit", async ({
  page,
  seededDesign,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text() !== REPORT_ONLY_UPGRADE_INSECURE_REQUESTS_DIAGNOSTIC
    )
      runtimeErrors.push(message.text());
  });

  await forceWebGLUnavailable(page);

  const response = await openSeededDesign(page, seededDesign);
  expect(response?.ok()).toBe(true);
  expect(
    await page.evaluate(
      () => document.createElement("canvas").getContext("2d") !== null,
    ),
  ).toBe(true);

  const exit = page.getByTestId("webgl-unavailable");
  await expect(exit).toBeVisible();
  for (const [key, expected] of Object.entries(ro.webglUnavailable)) {
    expect(expected.trim(), key).not.toBe("");
    await expect(exit).toContainText(expected);
  }

  const rendered = await exit.textContent();
  expect(rendered?.trim()).not.toBe("");
  expect(rendered).not.toContain("webglUnavailable.");
  expect(rendered).not.toContain("undefined");
  expect(runtimeErrors).toEqual([]);
});

test("an explicit Russian route keeps its internal navigation locale despite a contradictory cookie", async ({
  page,
  context,
  seededDesign,
}) => {
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ro",
      domain: "localhost",
      path: "/",
    },
  ]);
  await forceWebGLUnavailable(page);

  await openSeededDesign(page, seededDesign, { locale: "ru" });
  const exit = page.getByTestId("webgl-unavailable");
  await expect(exit).toBeVisible();
  for (const [key, expected] of Object.entries(ru.webglUnavailable)) {
    expect(expected.trim(), key).not.toBe("");
    await expect(exit).toContainText(expected);
  }
  for (const [key, source] of Object.entries(ro.webglUnavailable)) {
    if (source !== ru.webglUnavailable[key])
      await expect(exit).not.toContainText(source);
  }
  const rendered = await exit.textContent();
  expect(rendered).not.toContain("webglUnavailable.");
  expect(rendered).not.toContain("undefined");

  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ro",
      domain: "localhost",
      path: "/",
    },
  ]);
  // The e-mail link is not drawn (Q12 (ii), 8L.12): the callback form is the frame's one exit.
  const contactLink = exit.locator('a[href="/ru/configurator/contact"]');
  await expect(contactLink).toHaveCount(1);
  await expect(exit.locator("a")).toHaveCount(1);
  await contactLink.click();
  await expect(page).toHaveURL(/\/ru\/configurator\/contact$/);
});
