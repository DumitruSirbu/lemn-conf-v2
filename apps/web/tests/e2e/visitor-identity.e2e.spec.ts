import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign } from "./support/seeded-design";

/**
 * M7 wave 7E3a — criterion 6 / plan §4: measuring `Secure` on `http://localhost`, over a real
 * browser rather than argued. Run in the mobile project alone: nothing here is viewport-dependent,
 * and both projects are the same Chromium against the same `webServer`. No `context.addCookies` is
 * used, because whether a *planted* `__Host-` cookie is accepted is not the question this file
 * answers.
 *
 * §4 has four steps; steps 1-3 are asserted below (since M7 wave 7E3a S3, which lands
 * `/[locale]/route.ts`). Step 4 is a QA sabotage run, not an automated assertion — the plan
 * describes it as a manual positive control performed once during adversarial QA, and
 * `configure-route.e2e.spec.ts` carries the rest of the resume matrix this step 3 is one row of.
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
    // Step 1: a real `Set-Cookie` reached Chromium via the in-page `fetch`, not a planted cookie.
    const cookies = await context.cookies();
    const visitorCookies = cookies.filter(
      (cookie) => cookie.name === VISITOR_COOKIE_NAME,
    );

    // Step 2: exactly one cookie, with every attribute criterion 1 and ADR 0114 decision 1 require.
    expect(visitorCookies).toHaveLength(1);
    const [cookie] = visitorCookies;
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    // Host-only with no leading dot: Chromium reports a host-only cookie's domain as the bare host,
    // and a leading-dot (domain-scoped) cookie would fail this exact-equality check.
    expect(cookie?.domain).toBe("localhost");
    expect(cookie?.value).toMatch(WELL_FORMED_VISITOR_VALUE);

    const secondsUntilExpiry = (cookie?.expires ?? 0) - Date.now() / 1000;
    expect(
      Math.abs(secondsUntilExpiry - EXPECTED_MAX_AGE_SECONDS),
    ).toBeLessThanOrEqual(MAX_AGE_TOLERANCE_SECONDS);

    // Step 3: the browser sent the cookie **back** over http — proof of transmission, not only of
    // storage — and the resume route used it to find this exact design.
    const navigation = await page.goto("/ro");
    if (navigation === null) throw new Error("Navigation returned no response");
    expect(new URL(page.url()).pathname).toBe(`/ro/d/${design.id}`);

    const redirectedFrom = navigation.request().redirectedFrom();
    if (redirectedFrom === null) {
      throw new Error("Expected /ro to have redirected at least once");
    }
    expect((await redirectedFrom.response())?.status()).toBe(307);
  } finally {
    await deleteMintedDesigns([design.id]);
  }
});
