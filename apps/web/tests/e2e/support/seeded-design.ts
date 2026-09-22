import {
  expect,
  test as base,
  type Page,
  type Response,
} from "@playwright/test";

import { deleteMintedDesigns } from "./minted-designs";

/**
 * Mints and opens `/d/{id}` the way a browser actually does: from inside the page, so the
 * `lemnaria_write_token_{id}` cookie lands in the jar under test rather than an out-of-band
 * `APIRequestContext`'s (wave 7E4 D1). Every spec that opens a seeded design goes through here so
 * the mint origin can move — `/configurator/configure` retiring is a 7E3a concern, not this file's
 * — without every spec re-deriving the fetch.
 */

export type Locale = "ro" | "ru";

export interface SeededDesign {
  readonly id: string;
  readonly revision: string;
}

interface MintOutcome {
  readonly status: number;
  readonly id: string;
  readonly revision: string;
}

/** A real network round trip to the database, not a fixed settle (`support/panel.ts` carries the
 *  same reasoning for the write path). */
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Mints one `KITCHEN_L_DESIGN` row from `/{locale}/configurator/room` — Step 1, which keeps no
 * database of its own and is not a route 7E3a changes (G1, G3). Throws by name on anything but 201,
 * so a mint failure fails the spec in setup rather than surfacing as a confusing assertion later.
 */
export async function mintSeededDesign(
  page: Page,
  locale: Locale = "ro",
): Promise<SeededDesign> {
  await page.goto(`/${locale}/configurator/room`);
  const minted = await page.evaluate(async (): Promise<MintOutcome> => {
    const response = await fetch("/api/designs", {
      method: "POST",
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => ({}))) as Partial<{
      id: string;
      revision: string;
    }>;
    return {
      status: response.status,
      id: payload.id ?? "",
      revision: payload.revision ?? "",
    };
  });
  if (minted.status !== 201) {
    throw new Error(
      `mintSeededDesign: POST /api/designs from /${locale}/configurator/room answered ` +
        `${String(minted.status)}, wanted 201`,
    );
  }
  return { id: minted.id, revision: minted.revision };
}

/**
 * Opens the seeded design and returns only once this browser's write access is confirmed. The path
 * is unprefixed by default, exactly as `/configurator/configure` was, so the same proxy redirect to
 * `/ro/…` runs; pass `locale` to open an explicit prefix instead (`shared-design-locale-identity`,
 * `webgl-unavailable-i18n`).
 *
 * Throws by name unless the write-access probe (`GET /api/designs/{id}`) answers `canWrite: true` —
 * this helper is for specs that need write access confirmed before they proceed. A spec that wants
 * the read-only path clears cookies and drives its own navigation instead (`read-only-panel`,
 * `read-only-global-settings`), because there the disabled state is the thing under test.
 *
 * The route renders a `<canvas>` when WebGL is available and the exit's own testid
 * (`webgl-unavailable`) when it is not — both are legitimate outcomes of the same route, and
 * `webgl-unavailable-i18n` forces the second deliberately. `global-settings-trigger`, the store's
 * own observable for "the probe's answer has been applied", only exists in the first: the exit
 * renders neither it nor `GlobalSettings`, so this only waits on it when it is on screen at all.
 */
export async function openSeededDesign(
  page: Page,
  design: SeededDesign,
  { locale }: { locale?: Locale } = {},
): Promise<Response | null> {
  const path =
    locale === undefined ? `/d/${design.id}` : `/${locale}/d/${design.id}`;
  const probe = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/designs/${design.id}`,
    { timeout: PROBE_TIMEOUT_MS },
  );
  const navigation = await page.goto(path);
  await Promise.race([
    page.waitForSelector("canvas", { state: "attached" }),
    page.waitForSelector('[data-testid="webgl-unavailable"]', {
      state: "attached",
    }),
  ]);

  const probeResponse = await probe;
  const { canWrite } = (await probeResponse.json()) as { canWrite: boolean };
  if (!canWrite) {
    throw new Error(
      `openSeededDesign: the write-access probe for ${design.id} answered canWrite: ` +
        `${String(canWrite)}, wanted true`,
    );
  }

  const trigger = page.getByTestId("global-settings-trigger");
  if ((await trigger.count()) > 0) await expect(trigger).toBeEnabled();

  return navigation;
}

/**
 * `base.extend` with a test-scoped `seededDesign` fixture: setup mints the row, teardown always
 * deletes it — including when the test fails, because the delete runs after `use()` regardless of
 * outcome (Playwright fixture semantics). One row per test, never shared, so one test's edits can
 * never carry into the next (ADR 0006's per-row cleanup obligation).
 */
export const test = base.extend<{ seededDesign: SeededDesign }>({
  seededDesign: async ({ page }, use) => {
    const design = await mintSeededDesign(page);
    try {
      await use(design);
    } finally {
      await deleteMintedDesigns([design.id]);
    }
  },
});
