import type { Design } from "@lemnaria/configurator-domain";
import { expect, type Page, type Response } from "@playwright/test";

import { test } from "./support/seeded-design";

interface LoadedDesign {
  readonly id: string;
  readonly design: Design;
  readonly revision: string;
  readonly canWrite: boolean;
}

// Uses the `seededDesign` fixture (wave 7E4 D3): it already opens `/{ro,ru}/d/{id}`, so re-pointing
// only replaces this file's own mint and its bookkeeping — the fixture's teardown now owns the row.
test("Romanian and Russian shared links load one unchanged design identity", async ({
  page,
  seededDesign,
}) => {
  const before = await loadStoredDesign(page, seededDesign.id);
  expect(before.id).toBe(seededDesign.id);
  expect(before.revision).toBe(seededDesign.revision);

  for (const locale of ["ro", "ru"] as const) {
    const expectedApiPath = `/api/designs/${seededDesign.id}`;
    const probePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === expectedApiPath,
    );

    const documentResponse = await page.goto(`/${locale}/d/${seededDesign.id}`);
    if (documentResponse === null)
      throw new Error("Shared-design navigation returned no document response");
    expect(documentResponse.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(
      `/${locale}/d/${seededDesign.id}`,
    );
    const nonce = assertCsp(documentResponse);
    expect(await documentNonces(page)).toEqual([nonce]);

    const probe = await probePromise;
    expect(new URL(probe.url()).pathname).toBe(expectedApiPath);
    const loaded = (await probe.json()) as LoadedDesign;
    expect(loaded).toEqual({ ...before, canWrite: true });
    expect(loaded).not.toHaveProperty("locale");

    const debug = page.getByTestId("selection-debug");
    await expect(debug).toHaveAttribute("data-design-id", seededDesign.id);
    await expect(debug).toHaveAttribute(
      "data-updated-at",
      before.design.updatedAt,
    );
  }

  const after = await loadStoredDesign(page, seededDesign.id);
  expect(after).toEqual(before);
});

async function loadStoredDesign(page: Page, id: string): Promise<LoadedDesign> {
  return page.evaluate(async (designId): Promise<LoadedDesign> => {
    const response = await fetch(`/api/designs/${designId}`, {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(`Load failed with ${String(response.status)}`);
    return (await response.json()) as LoadedDesign;
  }, id);
}

function assertCsp(response: Response): string {
  const policy = response.headers()["content-security-policy-report-only"];
  expect(policy).toBeTruthy();
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  expect(nonce).toBeTruthy();
  if (nonce === undefined) throw new Error("CSP contains no nonce");
  return nonce;
}

async function documentNonces(page: Page): Promise<string[]> {
  return page.locator("script[nonce], link[nonce]").evaluateAll((elements) => {
    const nonces = elements.map((element) =>
      "nonce" in element && typeof element.nonce === "string"
        ? element.nonce
        : undefined,
    );
    return [
      ...new Set(
        nonces.filter((nonce): nonce is string => nonce !== undefined),
      ),
    ];
  });
}
