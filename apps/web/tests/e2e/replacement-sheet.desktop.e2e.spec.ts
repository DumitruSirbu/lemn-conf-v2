import { test } from "./support/seeded-design";
import { runReplacementSheetJourney } from "./support/replacement-sheet-journey";

// The same journey at 1440 x 900 with a pointer.
test("a kitchen naming a tier the book no longer holds is asked to choose again, and is priced and acknowledged once it has", async ({
  page,
  browser,
  seededDesign,
}) => {
  await runReplacementSheetJourney({
    page,
    browser,
    design: seededDesign,
    press: (control) => control.click(),
  });
});
