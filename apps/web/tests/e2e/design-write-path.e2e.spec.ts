import { expect, test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * The write-token cookie's round trip, in a real browser (ADR 0019 decision 1).
 *
 * Wave 3C-2a's route tests prove the server sets and reads the cookie; they cannot prove a browser
 * *stores* it and *replays* it, because the cookie is `Path`-scoped to `/api/designs/{id}` and a
 * scope that is off by one segment looks correct in every server-side test and silently sends
 * nothing in Chrome. Security review asked for this case by name.
 *
 * The requests are issued from the page with the same verbs, URLs and `credentials` the client
 * repository uses (`src/persistence/fetch-configuration-repository.ts`) — the cookie jar under test
 * belongs to the browser, not to the calling code, so the credential travels the same way either
 * way. The token's value is never read or asserted; it is `HttpOnly`, and page script cannot see it.
 *
 * The dev server behind this suite runs against the **test** database (`playwright.config.ts`), so
 * the row minted here is never in the application's own, and every row it mints is deleted again
 * afterwards — both halves of ADR 0006.
 */

/** Every design this file creates, deleted in `afterAll`. Without it the test database grows by a
 *  row per run, forever; the persistence live suites all clean up after themselves and so does this. */
const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

interface MintOutcome {
  readonly status: number;
  readonly id: string;
}

interface SaveOutcome {
  readonly status: number;
  readonly placementsBefore: number;
  readonly placementsAfter: number;
}

test("a design minted by POST is writable by PUT from the same browser, and only from it", async ({
  page,
  context,
  browser,
}) => {
  await page.goto("/configurator/configure");

  const minted = await page.evaluate(async (): Promise<MintOutcome> => {
    const response = await fetch("/api/designs", {
      method: "POST",
      credentials: "same-origin",
    });
    const payload = (await response.json()) as { id: string };
    return { status: response.status, id: payload.id };
  });

  // Registered for deletion before anything is asserted, so a failing assertion still cleans up.
  if (minted.id) mintedDesignIds.push(minted.id);

  expect(minted.status).toBe(201);
  expect(minted.id).not.toBe("");

  // The scoping that no server-side test can check: the cookie the browser actually kept, and the
  // path it will send it for. Its value is deliberately never touched.
  const writeCookie = (await context.cookies()).find(
    (cookie) => cookie.name === `lemnaria_write_token_${minted.id}`,
  );
  expect(writeCookie).toBeDefined();
  expect(writeCookie?.path).toBe(`/api/designs/${minted.id}`);
  expect(writeCookie?.httpOnly).toBe(true);
  expect(writeCookie?.sameSite).toBe("Lax");

  const saved = await page.evaluate(
    async (id: string): Promise<SaveOutcome> => {
      const loaded = await fetch(`/api/designs/${id}`);
      const { design } = (await loaded.json()) as {
        design: { placements: unknown[] };
      };
      const edited = { ...design, placements: design.placements.slice(1) };

      const response = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edited),
      });

      const reloaded = await fetch(`/api/designs/${id}`);
      const stored = (await reloaded.json()) as {
        design: { placements: unknown[] };
      };
      return {
        status: response.status,
        placementsBefore: design.placements.length,
        placementsAfter: stored.design.placements.length,
      };
    },
    minted.id,
  );

  // A real 200, and the edit is actually in the database afterwards.
  expect(saved.status).toBe(200);
  expect(saved.placementsAfter).toBe(saved.placementsBefore - 1);

  // The control: without that cookie the same request is refused, so the 200 above was earned by
  // the credential rather than by an unguarded route.
  const strangerContext = await browser.newContext();
  try {
    const strangerPage = await strangerContext.newPage();
    await strangerPage.goto("/configurator/configure");
    const forbiddenStatus = await strangerPage.evaluate(async (id: string) => {
      const response = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nothing: true }),
      });
      return response.status;
    }, minted.id);
    expect(forbiddenStatus).toBe(403);
  } finally {
    await strangerContext.close();
  }
});
