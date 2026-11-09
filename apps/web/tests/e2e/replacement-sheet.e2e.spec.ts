import { test } from "./support/seeded-design";
import { runReplacementSheetJourney } from "./support/replacement-sheet-journey";

// A kitchen naming a tier its price book no longer holds, at 390 x 844 by real touch. The journey is shared with the
// desktop line (`replacement-sheet.desktop.e2e.spec.ts`).
test("a kitchen naming a tier the book no longer holds is asked to choose again, and is priced and acknowledged once it has", async ({
  page,
  browser,
  seededDesign,
}) => {
  await runReplacementSheetJourney({
    page,
    browser,
    design: seededDesign,
    press: (control) => control.tap(),
  });
});
