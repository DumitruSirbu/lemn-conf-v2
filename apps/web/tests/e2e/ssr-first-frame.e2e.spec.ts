// M7B U7 S0 (ADR 0133, backlog 98): **the first server-rendered frame of `/d/{id}` and `/s/{token}` is
// the loaded design.**
//
// Raw HTML through `request.get`, so no JavaScript runs: what is asserted is what the server sent, not
// what React made of it afterwards. An L, a straight room and a U each answer with their own camera
// chips (3, 2 and 4) on both routes, and twenty interleaved requests for a U and a straight room each
// answer with their own — a process-wide store written per request is what would swap them.
//
// **Must not run concurrently with any other persistence live run**: this mints real rows (ADR 0006's
// per-row cleanup applies, and `afterEach` deletes them, including when a test fails).
import { expect, test, type Page } from "@playwright/test";

import {
  collectHydrationComplaints,
  installFrameSampler,
  provokeAHydrationMismatch,
  readPaintedFrames,
} from "./support/first-frame";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  cameraChipCount,
  fingerprintOf,
  htmlOf,
  L_OWN,
  SHARE_VIEW_SESSION_ID,
  seedKitchen,
  STRAIGHT,
  U_MIDDLE,
} from "./support/ssr-html";

const CONCURRENT_REQUESTS = 20;

/** The price is the design's own figure, so the server's must be the one the browser settles on
 *  (`toHaveText` compares with whitespace normalised, non-breaking spaces included). */
async function expectBrowserShowsTheSamePrice(
  page: Page,
  path: string,
  serverHtml: string,
): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("price-bar-total")).toHaveText(
    fingerprintOf(serverHtml).price,
  );
}

test.describe("the first server-rendered frame is the loaded design (U7 S0)", () => {
  const mintedIds: string[] = [];

  test.afterEach(async () => {
    await deleteMintedDesigns(mintedIds.splice(0));
  });

  test("an L, a straight room and a U each send their own camera chips, on /d and on /s", async ({
    page,
    request: stranger,
  }) => {
    const kitchens = [
      await seedKitchen(page, mintedIds, L_OWN),
      await seedKitchen(page, mintedIds, STRAIGHT),
      await seedKitchen(page, mintedIds, U_MIDDLE),
    ];

    // `stranger` is the `request` fixture: its own cookie jar, so it holds only the link.
    for (const kitchen of kitchens) {
      const ownersHtml = await htmlOf(page.request, kitchen.designPath);
      const sharedHtml = await htmlOf(stranger, kitchen.sharePath);
      const label = kitchen.spec.name;

      expect(cameraChipCount(ownersHtml), `/d for ${label}`).toBe(
        kitchen.spec.cameraChips,
      );
      expect(cameraChipCount(sharedHtml), `/s for ${label}`).toBe(
        kitchen.spec.cameraChips,
      );
      expect(fingerprintOf(ownersHtml).sessionId, `/d for ${label}`).toBe(
        kitchen.id,
      );
      expect(fingerprintOf(sharedHtml).sessionId, `/s for ${label}`).toBe(
        SHARE_VIEW_SESSION_ID,
      );
      await expectBrowserShowsTheSamePrice(
        page,
        kitchen.designPath,
        ownersHtml,
      );
      await expectBrowserShowsTheSamePrice(page, kitchen.sharePath, sharedHtml);
    }
  });

  test("twenty interleaved concurrent requests for a U and a straight room each answer their own", async ({
    page,
    request: stranger,
  }) => {
    const straight = await seedKitchen(page, mintedIds, STRAIGHT);
    const u = await seedKitchen(page, mintedIds, U_MIDDLE);
    const interleaved = Array.from(
      { length: CONCURRENT_REQUESTS },
      (_, index) => (index % 2 === 0 ? u : straight),
    );

    const answers = await Promise.all(
      interleaved.flatMap((kitchen) => [
        htmlOf(page.request, kitchen.designPath).then(cameraChipCount),
        htmlOf(stranger, kitchen.sharePath).then(cameraChipCount),
      ]),
    );

    expect(answers).toEqual(
      interleaved.flatMap((kitchen) => [
        kitchen.spec.cameraChips,
        kitchen.spec.cameraChips,
      ]),
    );
  });

  for (const spec of [U_MIDDLE, STRAIGHT]) {
    test(`a reload of /d/{id} for ${spec.name} paints no frame at the wrong chip count, and hydrates without a mismatch`, async ({
      page,
    }) => {
      const kitchen = await seedKitchen(page, mintedIds, spec);
      const hydrationComplaints = collectHydrationComplaints(page);
      await installFrameSampler(page);

      await page.goto(kitchen.designPath);
      await page.reload();
      await page.waitForSelector("canvas", { state: "attached" });
      const frames = await readPaintedFrames(page);

      expect(
        frames.length,
        "the sampler saw no frame with a camera row",
      ).toBeGreaterThan(0);
      expect(
        frames.filter((frame) => frame.chips !== spec.cameraChips),
      ).toEqual([]);
      expect(hydrationComplaints).toEqual([]);
    });
  }

  // The detector above is only evidence if it can fire. This provokes a real text mismatch (the
  // server-rendered price is rewritten before hydration, so the client renders another) and requires the same collector to hear React. It
  // is what makes the "no complaint" assertions above mean something under `next start`, where React
  // reports the minified codes rather than the development wording.
  test("control: the hydration-complaint detector fires when the HTML disagrees with the client", async ({
    page,
  }) => {
    const kitchen = await seedKitchen(page, mintedIds, STRAIGHT);
    const hydrationComplaints = collectHydrationComplaints(page);
    await provokeAHydrationMismatch(page);

    await page.goto(kitchen.designPath);

    await expect
      .poll(() => hydrationComplaints.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });
});
