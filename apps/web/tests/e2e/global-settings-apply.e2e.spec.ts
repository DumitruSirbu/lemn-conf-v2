import { expect, type Page } from "@playwright/test";

import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **What one press of *Aplică* does** — M6-AUD-012's recovery and M6-AUD-004's atomicity, measured
 * on the surface rather than at the store.
 *
 * Both defects were invisible from inside the sheet, and for the same structural reason: the sheet
 * closed. M6-AUD-012's press exited as "unchanged" and closed; M6-AUD-004's committed one half,
 * refused the other, and closed on the half it kept. So the assertions here are as much about the
 * sheet **staying open** as about what the document holds afterwards.
 *
 * **The withdrawn tier is written through the real authenticated API**, which is how the audit's own
 * witness produced it: `materialTierId: "material.withdrawn"` is schema-valid, so a document can
 * genuinely arrive in this state after a price-book edit. The reload is the point — a store that
 * merely *displayed* the fallback would pass a same-session assertion and fail this one.
 *
 * Rows minted here are deleted afterwards — ADR 0006.
 */

const WITHDRAWN_MATERIAL_TIER_ID = "material.withdrawn";
const WITHDRAWN_HARDWARE_TIER_ID = "hardware.withdrawn";

/** `openSeededDesign` waits for the trigger to be enabled, not for the price figure — a check taken
 *  the instant it returns can still race the price bar's own mount (review round 1, R1.2). */
const SCENE_SETTLE_MS = 2000;

interface StoredSettings {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly cabinetDepth: string;
  readonly updatedAt: string;
}

async function storedSettings(page: Page): Promise<StoredSettings> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    materialTierId: element.getAttribute("data-material-tier") ?? "",
    hardwareTierId: element.getAttribute("data-hardware-tier") ?? "",
    cabinetDepth: element.getAttribute("data-cabinet-depth") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
  }));
}

/** Writes whole-kitchen settings onto the seeded design through the same route the client uses, so
 *  the document under test is one the server actually accepted. */
async function wearSettings(
  page: Page,
  seededDesign: SeededDesign,
  settings: Record<string, string>,
): Promise<void> {
  const status = await page.evaluate(
    async ({ id, chosen }) => {
      const loaded = await fetch(`/api/designs/${id}`);
      const { design, revision } = (await loaded.json()) as {
        design: Record<string, unknown>;
        revision: string;
      };
      const written = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify({
          ...design,
          settings: { ...(design.settings as object), ...chosen },
        }),
      });
      return written.status;
    },
    { id: seededDesign.id, chosen: settings },
  );
  expect(status).toBe(200);
}

async function openSheet(page: Page): Promise<void> {
  await expect(page.getByTestId("global-settings-trigger")).toBeEnabled();
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
}

/**
 * Presses *Aplică* and returns once the save it causes has been answered. The sheet closes at the
 * press, but the `PUT` leaves about 35 ms later; a reload taken in between aborts it (status −1) and
 * the document is read back unsaved. The response is the thing the reload must wait for, so the
 * wait is on it, not on a pause.
 */
async function applyAndAwaitSave(
  page: Page,
  seededDesign: SeededDesign,
): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  // Both are awaited together so a failed press surfaces as itself and not as a pending `saved`.
  const [response] = await Promise.all([saved, pressApplyAndAwaitClose(page)]);
  expect(response.status()).toBe(200);
}

async function pressApplyAndAwaitClose(page: Page): Promise<void> {
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
}

/** The tier id the sheet paints as checked in a group, read off the rendered radios rather than off
 *  the model — the whole defect was the two disagreeing. */
async function displayedTierIn(
  page: Page,
  group: "material" | "hardware",
): Promise<string> {
  const checked = page
    .getByTestId("global-settings-group")
    .nth(group === "material" ? 0 : 1)
    .locator('input[type="radio"]:checked');
  await expect(checked).toHaveCount(1);
  return (await checked.getAttribute("value")) ?? "";
}

for (const group of ["material", "hardware"] as const) {
  const withdrawnTierId =
    group === "material"
      ? WITHDRAWN_MATERIAL_TIER_ID
      : WITHDRAWN_HARDWARE_TIER_ID;
  const settingKey = group === "material" ? "materialTierId" : "hardwareTierId";

  test(`recovers a withdrawn ${group} tier on one press, with no radio touched`, async ({
    page,
    seededDesign,
  }) => {
    await wearSettings(page, seededDesign, { [settingKey]: withdrawnTierId });
    await openSeededDesign(page, seededDesign);
    await page.waitForTimeout(SCENE_SETTLE_MS);

    // The state the recovery is for: the document cannot be priced, so the bar shows no figure.
    await expect(page.getByTestId("price-bar-total")).toHaveCount(0);

    await openSheet(page);
    const displayed = await displayedTierIn(page, group);
    expect(displayed).not.toBe(withdrawnTierId);

    // No radio is touched. The old sheet's *Aplică* compared the withdrawn pending id against the
    // identical applied id and exited as unchanged — the whole defect in one press.
    await applyAndAwaitSave(page, seededDesign);

    // The reload is what makes this about the document rather than about the store's memory.
    await openSeededDesign(page, seededDesign);
    await page.waitForTimeout(SCENE_SETTLE_MS);
    const stored = await storedSettings(page);
    expect(
      group === "material" ? stored.materialTierId : stored.hardwareTierId,
    ).toBe(displayed);
    await expect(page.getByTestId("price-bar-total")).toBeVisible();
  });
}

test("commits a material and a depth in one press, as one write", async ({
  page,
  seededDesign,
}) => {
  // The commit half of M6-AUD-004's contract, which *is* reachable in a browser: two settings in one
  // press, one document afterwards, and both changes in it. The refusal half is below.
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);

  const before = await storedSettings(page);
  await openSheet(page);

  await page
    .getByTestId("global-settings-group")
    .first()
    .getByRole("radio")
    .last()
    .tap();
  await page
    .getByTestId("global-settings-depth-option")
    .locator("input:not(:checked)")
    .first()
    .tap();
  await applyAndAwaitSave(page, seededDesign);

  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  const after = await storedSettings(page);
  expect(after.materialTierId).not.toBe(before.materialTierId);
  expect(after.cabinetDepth).not.toBe(before.cabinetDepth);
});

/**
 * **The refusal half of M6-AUD-004, and why it is not asserted in a browser yet.**
 *
 * The reachable refusal is `setCabinetDepth`'s `BODY_PROBE_UNAVAILABLE`, which needs the scene's
 * probe to be detached. `kitchen-stage.tsx` attaches it in an effect inside the R3F canvas subtree
 * and detaches it only in that effect's cleanup, so **no deterministic browser route to the state
 * exists**: removing the `<canvas>` node from page script does not unmount the React tree that owns
 * the probe, and racing the mount is a flake rather than a test.
 *
 * The criterion is met at the store instead, against the real `applyWholeKitchenSettings` with no
 * probe attached — `tests/store/whole-kitchen-apply.test.ts`, "commits nothing at all, so the
 * material and hardware it also asked for are unchanged". What is missing here is only the browser's
 * confirmation that the *sheet* stays open, which the surface's own markup asserts one layer down.
 *
 * Left as `fixme` rather than deleted so the gap is visible: it closes the day the scene exposes a
 * detach a spec can reach, or the day a second reachable refusal path appears in the press.
 */
test.fixme(
  "commits nothing and stays open when one half of the press is refused",
  () => {
    // Intentionally empty — see the comment above.
  },
);
