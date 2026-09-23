import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign } from "./support/seeded-design";

/**
 * M7 wave 7E3a — criterion 6 / plan §4, the desktop half of `visitor-identity.e2e.spec.ts`.
 *
 * The plan asks for both projects, and this repository's convention is a project-named twin file
 * rather than a shared spec parameterised at runtime (`playwright.config.ts`'s `testMatch` ties a
 * project to a file name, following `top-bar.e2e.spec.ts` / `top-bar.desktop.e2e.spec.ts`'s
 * pattern). The assertions are identical on purpose: nothing here is viewport-dependent — a cookie's
 * `Secure` attribute does not vary with screen size — so the only thing this file proves that the
 * mobile one does not is that the *other* project's browser instance, launched from its own
 * `webServer`, receives the same `Set-Cookie` over the same `http://localhost`.
 *
 * See the mobile file for what is deliberately not asserted yet (§4 step 3, which needs S3's resume
 * routes) and why.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_VISITOR_VALUE = /^[A-Za-z0-9_-]{43}$/;
const EXPECTED_MAX_AGE_SECONDS = 2_592_000;
const MAX_AGE_TOLERANCE_SECONDS = 120;

test("mints exactly one __Host- visitor cookie with the required attributes, over http://localhost", async ({
  page,
  context,
}) => {
  const design = await mintSeededDesign(page);
  try {
    const cookies = await context.cookies();
    const visitorCookies = cookies.filter(
      (cookie) => cookie.name === VISITOR_COOKIE_NAME,
    );

    expect(visitorCookies).toHaveLength(1);
    const [cookie] = visitorCookies;
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.domain).toBe("localhost");
    expect(cookie?.value).toMatch(WELL_FORMED_VISITOR_VALUE);

    const secondsUntilExpiry = (cookie?.expires ?? 0) - Date.now() / 1000;
    expect(
      Math.abs(secondsUntilExpiry - EXPECTED_MAX_AGE_SECONDS),
    ).toBeLessThanOrEqual(MAX_AGE_TOLERANCE_SECONDS);
  } finally {
    await deleteMintedDesigns([design.id]);
  }
});
