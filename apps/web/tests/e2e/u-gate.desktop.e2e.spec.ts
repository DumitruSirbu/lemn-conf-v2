// **The U's desktop line, by click** — M7B wave U7, slice S2 (reload flash gated at zero wrong-chip
// frames: `docs/decisions/0133`, U7 D5). 1440 x 900 with a pointer and no touch: D1B, D1C and D1F
// where the phone has 1B, 1C and 1F. The journey and every assertion live in
// `support/u-gate-journeys.ts`, shared with the phone (`u-gate.e2e.spec.ts`); this file is what the
// desktop adds to it: the *Sugestii* card at D1C, and 1F's static plan aside drawing three walls.
import { expect } from "@playwright/test";

import { emulateNetworkLatency } from "./support/step-one-by-touch";
import { NARROWEST_WALKWAY_U } from "./support/u-gate";
import { describeUGate } from "./support/u-gate-journeys";

/** Long enough that the hand-off's write is still in flight when the plan aside is looked at (7K's
 *  `WRITE_LATENCY_MS`, criterion 14). */
const HAND_OFF_LATENCY_MS = 1_500;

describeUGate({
  title: "the U's desktop line, by click (U7 S2)",
  device: "pointer",
  // D1C: the same suggestion group as the phone, and here its card is drawn.
  expectSuggestionCard: async (page) => {
    await expect(page.getByTestId("room-suggestion-card")).toBeVisible();
  },
  holdHandOff: (page) => emulateNetworkLatency(page, HAND_OFF_LATENCY_MS),
  // D1F: the static plan aside draws wall A, wall B and wall C with their lengths, and nothing else.
  expectPlanAside: async (page) => {
    const aside = page.getByTestId("room-compose-plan");
    await expect(aside).toBeVisible();
    const labels = aside.locator("[data-testid^='room-plan-label-']");
    await expect(labels).toHaveCount(3);
    for (const wall of ["A", "B", "C"] as const) {
      const lengthMm = NARROWEST_WALKWAY_U[`wall${wall}`];
      await expect(aside.getByTestId(`room-plan-label-${wall}`)).toContainText(
        lengthMm,
      );
    }
  },
});
