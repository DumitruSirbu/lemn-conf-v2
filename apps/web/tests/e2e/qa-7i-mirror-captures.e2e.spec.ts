// M7 wave 7I adversarial QA, A18 at the mobile viewport: left and right × three presets × 600 and
// 700 mm, a selected right-hand body, and `/internal/mirror-shot`, captured outside the watched
// tree; the reflected width note in the real panel; zero page errors. Mints two rows and deletes them
// (ADR 0006) — never run concurrently with the persistence live suite.
import { test } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  MIRROR_CAPTURE_SET_TIMEOUT_MS,
  runMirrorCaptureSet,
} from "./support/qa-7i-captures";

test.describe("7I QA — the mirror capture set (mobile)", () => {
  test.setTimeout(MIRROR_CAPTURE_SET_TIMEOUT_MS);
  const mintedIds: string[] = [];

  test.afterAll(async () => {
    await deleteMintedDesigns(mintedIds);
  });

  test("captures both hands at both depths, the selected right-hand body and the mirror-shot route", async ({
    page,
  }) => {
    await runMirrorCaptureSet(page, "mobile", mintedIds);
  });
});
