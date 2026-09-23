import {
  expect,
  test as base,
  type Page,
  type Request as PlaywrightRequest,
  type Response,
} from "@playwright/test";

import { deleteMintedDesigns } from "./minted-designs";

/**
 * Mints and opens `/d/{id}` the way a browser actually does: from inside the page, so the
 * `lemnaria_write_token_{id}` cookie lands in the jar under test rather than an out-of-band
 * `APIRequestContext`'s (wave 7E4 D1). Every spec that opens a seeded design goes through here so
 * the mint origin can move — the retired editor route is a 7E3a concern, not this file's — without
 * every spec re-deriving the fetch.
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
  if (minted.id === "" || minted.revision === "") {
    // A non-empty id means a row was really minted even though the answer describing it is
    // unusable — ADR 0006 still owns it, and throwing without deleting it here would leak a row
    // this helper's own caller never gets a chance to register for cleanup.
    if (minted.id !== "") await deleteMintedDesigns([minted.id]);
    throw new Error(
      `mintSeededDesign: POST /api/designs answered 201 with an empty id or revision ` +
        `(id: ${JSON.stringify(minted.id)}, revision: ${JSON.stringify(minted.revision)})`,
    );
  }
  return { id: minted.id, revision: minted.revision };
}

/** What `GET /api/designs/{id}` answers about this browser's write access — the one field every
 *  caller of {@link openDesignAndAwaitAccessProbe} has read so far. */
export interface DesignAccessProbe {
  readonly canWrite: boolean;
}

/** What {@link navigateAndAwaitDesignRouteOutcome} found — tagged because `"unavailable"`
 *  (M7 wave 7E3b, ADR 0114 decision 5) never fires a probe at all, so a caller must check which
 *  case it has before reading `probe`. */
type DesignRouteOutcome =
  | { readonly kind: "unavailable"; readonly navigation: Response | null }
  | {
      readonly kind: "answered";
      readonly navigation: Response | null;
      readonly probe: DesignAccessProbe;
    };

/**
 * Navigates to a design-by-link `path` and waits for whichever of the route's three legitimate
 * outcomes appears first: a mounted `<canvas>`, the WebGL-unavailable exit, or (M7 wave 7E3b) the
 * `"unavailable"` refusal — the gate's own answer for a missing, malformed or foreign visitor
 * cookie. A plain `page.goto`, carrying whatever cookies this browser context already holds — it
 * sets none of its own, unlike {@link mintSeededDesign}'s in-page `fetch`, which exists
 * specifically to land a `Set-Cookie` in the jar under test.
 *
 * The write-access probe wait is registered before navigating, exactly as it always was, so its
 * response is never missed. When the race is won by `"unavailable"`, that wait is left to expire
 * on its own timeout and its rejection is swallowed — a probe request the page never sends cannot
 * answer one.
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
 * Navigates to a design-by-link `path` and returns only once the write-access probe
 * (`GET /api/designs/{id}`) has answered, alongside the navigation's own response.
 *
 * **The one navigation every `/d/{id}` caller in this suite shares** (review round 1, R1.3):
 * `openSeededDesign` below throws on the probe's answer; `read-only-panel`, `read-only-global-settings`
 * and `global-colour`'s own read-only cases read it directly, because a disabled answer is the thing
 * under test there rather than a reason to throw.
 *
 * **Throws by name if the route answers `"unavailable"`** (M7 wave 7E3b): none of this helper's
 * callers open a design their own browser does not own, so that outcome would mean the caller's own
 * setup is wrong. A caller that specifically wants the unavailable case calls
 * {@link openUnavailableDesign} instead.
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

/**
 * Opens `path` and waits for the `"unavailable"` refusal (M7 wave 7E3b, ADR 0114 decision 5) —
 * every foreign, missing or cookie-less visitor cookie answers this same page, and never sends the
 * write-access probe at all. Fails by name if a probe request was made regardless: that would mean
 * this browser actually owns the row, which is not the scenario a caller of this helper is testing.
 */
export async function openUnavailableDesign(
  page: Page,
  path: string,
): Promise<Response | null> {
  const probeRequestUrls: string[] = [];
  const onRequest = (request: PlaywrightRequest): void => {
    if (
      request.method() === "GET" &&
      /^\/api\/designs\/[^/]+$/.test(new URL(request.url()).pathname)
    ) {
      probeRequestUrls.push(request.url());
    }
  };
  page.on("request", onRequest);
  try {
    const navigation = await page.goto(path);
    await page.waitForSelector('[data-testid="design-load-error"]', {
      state: "attached",
    });
    if (probeRequestUrls.length > 0) {
      throw new Error(
        `openUnavailableDesign: a write-access probe request was made while opening ${path} ` +
          `(${probeRequestUrls.join(", ")}), which the unavailable page must never send.`,
      );
    }
    return navigation;
  } finally {
    page.off("request", onRequest);
  }
}

/**
 * Opens the seeded design and returns only once this browser's write access is confirmed. The path
 * is unprefixed by default, exactly as the retired editor route was, so the same proxy redirect to
 * `/ro/…` runs; pass `locale` to open an explicit prefix instead (`shared-design-locale-identity`,
 * `webgl-unavailable-i18n`).
 *
 * Throws by name unless the write-access probe (`GET /api/designs/{id}`) answers `canWrite: true` —
 * this helper is for specs that need write access confirmed before they proceed. A spec that wants
 * the read-only path calls {@link openDesignAndAwaitAccessProbe} directly instead (`read-only-panel`,
 * `read-only-global-settings`, `global-colour`'s own read-only case), because there a disabled
 * answer is the thing under test rather than a reason to throw.
 *
 * `global-settings-trigger`, the store's own observable for "the probe's answer has been applied",
 * only exists on the WebGL-available branch: the exit renders neither it nor `GlobalSettings`, so
 * this only waits on it when it is on screen at all.
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
  // M7 wave 7E3b (ADR 0114 decision 5): with no visitor cookie owning this row — the write-token
  // cookie alone is not enough, and clearing every cookie is exactly that case — the route never
  // reaches the probe at all, so the old `canWrite: false` message would be misleading here.
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
  if ((await trigger.count()) > 0) await expect(trigger).toBeEnabled();

  return outcome.navigation;
}

interface ShareLinkIssueOutcome {
  readonly status: number;
  readonly path: string;
}

/**
 * Issues an active share link for `design`, from inside the page (M7 wave 7E3c S6) — the same
 * reason {@link mintSeededDesign} mints in-page: the request has to carry the browser's own
 * write-token and visitor cookies, which an out-of-band `APIRequestContext` would not. Throws by
 * name on anything but 201, so a spec that expects a link fails in setup rather than on a later,
 * unrelated assertion.
 */
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

/**
 * Opens a share link — `path` is what {@link issueShareLink} returned, e.g. `/s/{token}`. Unlike
 * {@link openDesignAndAwaitAccessProbe}, this waits for **no** `GET /api/designs/{id}`: the share
 * view issues no write-access probe at all (D6/G15 — it holds no credential to ask about and no id
 * to ask with), so waiting for one here would hang forever on a route that correctly never sends it.
 * Waits for either `<canvas>` or the WebGL-unavailable exit's own testid, the same two legitimate
 * outcomes {@link openDesignAndAwaitAccessProbe} waits on.
 */
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
