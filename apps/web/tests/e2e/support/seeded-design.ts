import {
  expect,
  test as base,
  type Page,
  type Request as PlaywrightRequest,
  type Response,
} from "@playwright/test";

import { deleteMintedDesigns } from "./minted-designs";

/** Mints and opens `/d/{id}` from inside the page, so the `lemnaria_write_token_{id}` cookie lands in the jar under
 *  test, not in an out-of-band `APIRequestContext`'s. */

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

/** A real network round trip to the database, not a fixed settle. */
const PROBE_TIMEOUT_MS = 15_000;

/** Mints one `KITCHEN_L_DESIGN` row from `/{locale}/configurator/room`, which keeps no database of its own. Throws by
 *  name on anything but 201, so a mint failure fails in setup rather than as a confusing assertion later. */
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
  if (minted.id === "" || minted.revision === "") {
    // A non-empty id means a row was really minted; delete it here, since the caller never gets to register it for
    // cleanup (ADR 0006).
    if (minted.id !== "") await deleteMintedDesigns([minted.id]);
    throw new Error(
      `mintSeededDesign: POST /api/designs answered 201 with an empty id or revision ` +
        `(id: ${JSON.stringify(minted.id)}, revision: ${JSON.stringify(minted.revision)})`,
    );
  }
  return { id: minted.id, revision: minted.revision };
}

/** What `GET /api/designs/{id}` answers about this browser's write access. */
export interface DesignAccessProbe {
  readonly canWrite: boolean;
}

/** Tagged because `"unavailable"` never fires a probe, so a caller must check the case before reading `probe`. */
type DesignRouteOutcome =
  | { readonly kind: "unavailable"; readonly navigation: Response | null }
  | {
      readonly kind: "answered";
      readonly navigation: Response | null;
      readonly probe: DesignAccessProbe;
    };

/**
 * Navigates to a design-by-link `path` and waits for whichever outcome appears first: a mounted `<canvas>`, the
 * WebGL-unavailable exit, or the `"unavailable"` refusal (ADR 0114 decision 5). It carries whatever cookies the
 * context holds. The probe wait is registered before navigating so its response is never missed; when
 * `"unavailable"` wins, that wait expires on its own and its rejection is swallowed, since a probe the page never
 * sends cannot answer one.
 */
async function navigateAndAwaitDesignRouteOutcome(
  page: Page,
  path: string,
  designId: string,
): Promise<DesignRouteOutcome> {
  const probeWait = page
    .waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === `/api/designs/${designId}`,
      { timeout: PROBE_TIMEOUT_MS },
    )
    .catch(() => undefined);

  const navigation = await page.goto(path);
  const outcome = await Promise.race([
    page
      .waitForSelector("canvas", { state: "attached" })
      .then(() => "answered" as const),
    page
      .waitForSelector('[data-testid="webgl-unavailable"]', {
        state: "attached",
      })
      .then(() => "answered" as const),
    page
      .waitForSelector('[data-testid="design-load-error"]', {
        state: "attached",
      })
      .then(() => "unavailable" as const),
  ]);

  if (outcome === "unavailable") return { kind: "unavailable", navigation };

  const probeResponse = await probeWait;
  if (probeResponse === undefined) {
    throw new Error(
      `navigateAndAwaitDesignRouteOutcome: no write-access probe response arrived for ` +
        `${designId} within ${String(PROBE_TIMEOUT_MS)}ms.`,
    );
  }
  const probe = (await probeResponse.json()) as DesignAccessProbe;
  return { kind: "answered", navigation, probe };
}

/**
 * Navigates to a design-by-link `path` and returns once the write-access probe (`GET /api/designs/{id}`) has
 * answered. The one navigation every `/d/{id}` caller shares: `openSeededDesign` throws on the answer, while the
 * read-only specs read it directly. Throws by name on `"unavailable"`; a caller that wants it calls
 * {@link openUnavailableDesign}.
 */
export async function openDesignAndAwaitAccessProbe(
  page: Page,
  path: string,
  designId: string,
): Promise<{
  readonly navigation: Response | null;
  readonly probe: DesignAccessProbe;
}> {
  const outcome = await navigateAndAwaitDesignRouteOutcome(
    page,
    path,
    designId,
  );
  if (outcome.kind === "unavailable") {
    throw new Error(
      `openDesignAndAwaitAccessProbe: ${path} answered the "unavailable" refusal, which none of ` +
        "this helper's callers expect — a probe never fires there.",
    );
  }
  return { navigation: outcome.navigation, probe: outcome.probe };
}

// eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a negative claim about which of the three DesignLoadError reasons rendered, not copy authored here — the sentence itself is the reached-by-key catalogue leaf `designLoadError.bodyUnavailable`.
const UNAVAILABLE_COPY_SUBSTRING = "nu este disponibilă în acest browser";

/**
 * Opens `path` and waits for the `"unavailable"` refusal (ADR 0114 decision 5): every foreign, missing or
 * cookie-less visitor gets this page and never sends the write-access probe. Asserts the unavailable copy itself,
 * and scopes its probe matcher to `designId`. Fails by name if a probe for `designId` was made, since this browser
 * would then own the row.
 */
export async function openUnavailableDesign(
  page: Page,
  path: string,
  designId: string,
): Promise<Response | null> {
  const probeRequestUrls: string[] = [];
  const onRequest = (request: PlaywrightRequest): void => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === `/api/designs/${designId}`
    ) {
      probeRequestUrls.push(request.url());
    }
  };
  page.on("request", onRequest);
  try {
    const outcome = await navigateAndAwaitDesignRouteOutcome(
      page,
      path,
      designId,
    );
    if (outcome.kind !== "unavailable") {
      throw new Error(
        `openUnavailableDesign: ${path} answered its write-access probe instead of the ` +
          '"unavailable" refusal — this browser must own the row, which this helper\'s callers ' +
          "never expect.",
      );
    }
    if (probeRequestUrls.length > 0) {
      throw new Error(
        `openUnavailableDesign: a write-access probe request for ${designId} was made while ` +
          `opening ${path} (${probeRequestUrls.join(", ")}), which the unavailable page must ` +
          "never send.",
      );
    }
    await expect(page.getByTestId("design-load-error")).toContainText(
      UNAVAILABLE_COPY_SUBSTRING,
    );
    return outcome.navigation;
  } finally {
    page.off("request", onRequest);
  }
}

/**
 * Opens the seeded design and returns once write access is confirmed. The path is unprefixed by default so the
 * proxy redirect to `/ro/…` runs; `locale` opens an explicit prefix. Throws by name unless the probe answers
 * `canWrite: true`; read-only specs call {@link openDesignAndAwaitAccessProbe}. `global-settings-trigger` exists
 * only on the WebGL-available branch, so it is awaited only when on screen.
 */
export async function openSeededDesign(
  page: Page,
  design: SeededDesign,
  { locale }: { locale?: Locale } = {},
): Promise<Response | null> {
  const path =
    locale === undefined ? `/d/${design.id}` : `/${locale}/d/${design.id}`;
  const outcome = await navigateAndAwaitDesignRouteOutcome(
    page,
    path,
    design.id,
  );
  // With no visitor cookie owning this row (the write-token cookie alone is not enough) the route never reaches the
  // probe, so a `canWrite: false` message would mislead.
  if (outcome.kind === "unavailable") {
    throw new Error(
      `openSeededDesign: ${design.id} is unavailable in this browser — no visitor cookie owns it.`,
    );
  }
  if (!outcome.probe.canWrite) {
    throw new Error(
      `openSeededDesign: the write-access probe for ${design.id} answered canWrite: ` +
        `${String(outcome.probe.canWrite)}, wanted true`,
    );
  }

  const trigger = page.getByTestId("global-settings-trigger");
  if ((await trigger.count()) > 0) await expectWriteAccessApplied(page);

  return outcome.navigation;
}

/** Outlasts the first WebGL frame's main-thread freeze under software GL (23 s and more); the default 5 s fails a page
 *  that is only late. Capped by the test timeout. See ADR 0144. */
export const FIRST_FRAME_FREEZE_TIMEOUT_MS = 60_000;

/** Waits for the store to apply `canWrite`, i.e. for the settings trigger to enable, within `FIRST_FRAME_FREEZE_TIMEOUT_MS`. */
export async function expectWriteAccessApplied(page: Page): Promise<void> {
  await expect(page.getByTestId("global-settings-trigger")).toBeEnabled({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
}

interface ShareLinkIssueOutcome {
  readonly status: number;
  readonly path: string;
}

/** Issues an active share link for `design` from inside the page, because the request must carry the browser's
 *  write-token and visitor cookies. Throws by name on anything but 201. */
export async function issueShareLink(
  page: Page,
  design: SeededDesign,
): Promise<string> {
  const issued = await page.evaluate(
    async (id: string): Promise<ShareLinkIssueOutcome> => {
      const response = await fetch(`/api/designs/${id}/share`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<{
        path: string;
      }>;
      return { status: response.status, path: payload.path ?? "" };
    },
    design.id,
  );
  if (issued.status !== 201 || issued.path === "") {
    throw new Error(
      `issueShareLink: POST /api/designs/${design.id}/share answered ` +
        `${String(issued.status)}, wanted 201 with a path`,
    );
  }
  return issued.path;
}

/** Opens a share link (`path` is what {@link issueShareLink} returned). Waits for no `GET /api/designs/{id}`: the
 *  share view holds no credential to probe with, so waiting would hang. Waits for `<canvas>` or the WebGL exit. */
export async function openSharedDesign(
  page: Page,
  path: string,
  { locale }: { locale?: Locale } = {},
): Promise<Response | null> {
  const target = locale === undefined ? path : `/${locale}${path}`;
  const navigation = await page.goto(target);
  await Promise.race([
    page.waitForSelector("canvas", { state: "attached" }),
    page.waitForSelector('[data-testid="webgl-unavailable"]', {
      state: "attached",
    }),
  ]);
  return navigation;
}

/** `base.extend` with a test-scoped `seededDesign`: setup mints the row, teardown always deletes it, even when the
 *  test fails. One row per test, never shared (ADR 0006). */
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
