// **The U's mobile gate, by touch** — M7B wave U7, slice S1 (reload flash gated at zero wrong-chip
// frames: `docs/decisions/0133`, U7 D5). 390 x 844 with real touch: no click, no mouse, no `fill`
// over a length. The journey and every assertion live in `support/u-gate-journeys.ts`, shared with the
// desktop line (`u-gate.desktop.e2e.spec.ts`); this file is what the phone adds to it.
import { expect } from "@playwright/test";

import { describeUGate } from "./support/u-gate-journeys";

describeUGate({
  title: "the U's mobile gate, by touch (U7 S1)",
  device: "touch",
  // The phone's 1C draws the suggestion group and hides the desktop's *Sugestii* card.
  expectSuggestionCard: async (page) => {
    await expect(page.getByTestId("room-suggestion-card")).toBeHidden();
  },
  // 1F's plan aside is hidden on the phone (`room-desktop-line.criteria-12-17.desktop.e2e.spec.ts`,
  // criterion 14), so there is nothing to hold the hand-off for and nothing to look at.
  holdHandOff: () => Promise.resolve(() => Promise.resolve()),
  expectPlanAside: () => Promise.resolve(),
});
