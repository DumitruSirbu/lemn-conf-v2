import type { Design } from "@lemnaria/configurator-domain";
import { expect, type Page, type Response } from "@playwright/test";

import { policyOf } from "./support/csp-violations";
import {
  issueShareLink,
  openSharedDesign,
  test,
} from "./support/seeded-design";

interface LoadedDesign {
  readonly id: string;
  readonly design: Design;
  readonly revision: string;
  readonly canWrite: boolean;
}

/** `shared-design-view.tsx`'s own `SHARED_VIEW_DESIGN_ID`, not exported (D6: the share view hydrates
 *  under a sentinel, never the real id — G5, G8). Pinned here rather than imported, the same reason
 *  the approved copy strings are pinned as literals in the golden fixtures: this spec is the
 *  regression guard for the value, and importing the constant it is meant to check would let both
 *  change together silently. */
const SHARED_VIEW_SENTINEL_DESIGN_ID = "shared-view";

/**
 * **Re-pointed onto a real `/s/{token}` link, M7 wave 7E3c S6.** Before this wave no dedicated share
 * route existed, so this file used `/{locale}/d/{id}` itself as a stand-in for "a shared design,
 * loaded the same way twice" — its own comment said so (`it already opens /{ro,ru}/d/{id}`). Now
 * that D6 ships the real thing, this file's actual subject moves there.
 *
 * **What could not survive the move, and how it is preserved.** The old assertions read
 * `GET /api/designs/{id}`'s own JSON, including `canWrite: true` and the id itself — exactly the
 * probe and the id D6 requires the share view to never carry (G5, G15). So the identity check below
 * is over what a share view *can* show without becoming the thing this wave forbids: `updatedAt`,
 * read off `selection-debug` the same way the original test did, is part of the document rather
 * than the row's identity, and it is asserted identical to the owner's own authenticated read of the
 * same design, at both locales. The former `data-design-id` assertion becomes its own inverse: proof
 * that the attribute holds the share view's own sentinel (review round 1, L1.6: pinned to that
 * literal, not merely asserted absent — `not.toHaveAttribute(..., id)` would also pass on a blank
 * or a wrong-but-still-not-`id` value, which is not what "never the real id" was meant to prove).
 * `shared-design-view.tsx`'s own `SHARED_VIEW_DESIGN_ID` is not exported; the literal is pinned here
 * deliberately, so a change to it is a decision this spec notices rather than one it stays silent on.
 * And the former per-locale probe wait becomes a positive
 * assertion that **no** `/api/` request happens at all while the share view is open (criterion 9),
 * which the old test could not have asserted — it depended on exactly one such request happening.
 *
 * Uses the `seededDesign` fixture (wave 7E4 D3) for minting and cleanup only; the identity under
 * test is the share link's, not `seededDesign`'s own `/d/{id}`.
 */
test("Romanian and Russian share links load one unchanged design identity", async ({
  page,
  seededDesign,
}) => {
  const before = await loadStoredDesign(page, seededDesign.id);
  expect(before.id).toBe(seededDesign.id);
  expect(before.revision).toBe(seededDesign.revision);

  const sharePath = await issueShareLink(page, seededDesign);

  // Scoped to the loop below: `loadStoredDesign`'s own `fetch` calls, before and after it, are
  // deliberately excluded — they are the owner's authenticated reads, not requests the share view
  // itself makes.
  const apiRequests: string[] = [];
  const recordApiRequest = (url: string): void => {
    if (new URL(url).pathname.startsWith("/api/")) apiRequests.push(url);
  };
  page.on("request", (request) => {
    recordApiRequest(request.url());
  });

  for (const locale of ["ro", "ru"] as const) {
    const documentResponse = await openSharedDesign(page, sharePath, {
      locale,
    });
    if (documentResponse === null)
      throw new Error("Share-link navigation returned no document response");
    expect(documentResponse.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/${locale}${sharePath}`);
    const nonce = assertCsp(documentResponse);
    expect(await documentNonces(page)).toEqual([nonce]);

    const debug = page.getByTestId("selection-debug");
    // The inverse of the old assertion: the share view hydrates under a sentinel, never the real
    // id (G5, G8) — pinned to that literal (review round 1, L1.6), not merely asserted absent.
    await expect(debug).toHaveAttribute(
      "data-design-id",
      SHARED_VIEW_SENTINEL_DESIGN_ID,
    );
    await expect(debug).toHaveAttribute(
      "data-updated-at",
      before.design.updatedAt,
    );
  }

  page.removeAllListeners("request");
  expect(apiRequests).toEqual([]);

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
  const policy = policyOf(response);
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
